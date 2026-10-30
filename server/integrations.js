import { timingSafeEqual } from "node:crypto";

export const fail = (status, message) =>
  Object.assign(new Error(message), { status });
export const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function verifyToken(value, expected) {
  if (!value || !expected) return false;
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createGateway(env = process.env, transport = fetch) {
  async function request(path, method = "GET", body, key) {
    if (!env.XENDIT_SECRET_KEY) throw fail(503, "Pembayaran belum dikonfigurasi.");
    let res;
    try {
      res = await transport("https://api.xendit.co" + path, {
        method,
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(env.XENDIT_SECRET_KEY + ":").toString("base64"),
          "Content-Type": "application/json",
          ...(key ? { "X-Idempotency-Key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw fail(
        502,
        "Koneksi pembayaran terputus. Pesanan tersimpan; coba muat pembayaran kembali.",
      );
    }
    const data = await res.json();
    if (!res.ok) {
      const error = fail(
        502,
        "Pembayaran belum dapat diproses. Pilih metode lain atau hubungi pengelola.",
      );
      error.definitive =
        res.status >= 400 &&
        res.status < 500 &&
        ![408, 409, 429].includes(res.status);
      throw error;
    }
    return data;
  }
  return {
    configured: Boolean(env.XENDIT_SECRET_KEY && env.XENDIT_WEBHOOK_TOKEN),
    sandbox: !env.XENDIT_SECRET_KEY?.startsWith("xnd_production_"),
    async create(order) {
      // Cari referensi yang sama sebelum mencoba ulang setelah koneksi terputus.
      const found = await request(
        "/v2/invoices?external_id=" + encodeURIComponent(order.id),
      );
      if (Array.isArray(found) && found.length) return found[0];
      const appUrl = (env.APP_URL || "http://localhost:3001").replace(
        /\/$/,
        "",
      );
      return request(
        "/v2/invoices",
        "POST",
        {
          external_id: order.id,
          amount: order.total,
          currency: "IDR",
          description: "Pesanan Kintsugi " + order.id,
          invoice_duration: Math.min(
            86400,
            Math.max(300, Number(env.INVOICE_DURATION) || 3600),
          ),
          should_send_email: false,
          ...(order.payment && order.payment !== 'xendit' ? { payment_methods: [order.payment] } : {}),
          success_redirect_url: appUrl + "/#account/orders",
          failure_redirect_url: appUrl + "/#account/orders",
        },
        order.id,
      );
    },
    get: (id) => request("/v2/invoices/" + encodeURIComponent(id)),
    expire: (id) =>
      request("/invoices/" + encodeURIComponent(id) + "/expire!", "POST"),
  };
}

/**
 * Normalisasi nomor telepon ke format internasional (62xxx).
 * Menerima format 08xx, +628xx, 628xx.
 */
export function normalizePhone(phone) {
  let p = String(phone || "").replace(/[\s()\-+]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (p.startsWith("+62")) p = p.slice(1);
  return p;
}

/**
 * Kirim pesan WhatsApp melalui Wablas API.
 * @param {{phone: string, message: string, id?: string, subject?: string, recipient?: string}} wa - Data pesan WA
 * @param {object} env - Environment variables
 * @param {function} transport - Fetch function (for testing)
 * @returns {Promise<object>} Hasil dari Wablas API
 */
export async function sendWhatsApp(wa, env = process.env, transport = fetch) {
  if (!env.WABLAS_TOKEN && !env.RESEND_API_KEY)
    throw fail(503, "Layanan WhatsApp belum dikonfigurasi. Hubungi pengelola.");
  const apiHost = (env.WABLAS_API_HOST || "https://smg.wablas.com").replace(
    /\/$/,
    "",
  );
  const token = env.WABLAS_TOKEN || env.RESEND_API_KEY;
  let response;
  try {
    response = await transport(apiHost + "/api/send-message", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: env.WABLAS_SECRET_KEY
          ? `${token}.${env.WABLAS_SECRET_KEY}`
          : token,
        "Content-Type": "application/json",
        ...(wa.id ? { "Idempotency-Key": wa.id } : {}),
      },
      body: JSON.stringify({
        phone: normalizePhone(wa.phone),
        message: wa.message,
        to: [wa.recipient || normalizePhone(wa.phone)],
        subject: wa.subject || "Kode verifikasi Kintsugi",
      }),
    });
  } catch {
    throw fail(
      502,
      "WhatsApp belum berhasil dikirim. Periksa koneksi dan coba kirim ulang.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status === false) {
    let code = "WA_PROVIDER_ERROR",
      message =
        "Layanan WhatsApp belum berhasil mengirim pesan. Silakan coba lagi.";
    if (response.status === 429) {
      code = "WA_RATE_LIMITED";
      message =
        "Layanan WhatsApp sedang membatasi pengiriman. Tunggu sebentar lalu coba lagi.";
    } else if (response.status === 401 || response.status === 403) {
      code = "WA_AUTH_ERROR";
      message =
        "Token Wablas ditolak atau tidak memiliki izin kirim. Hubungi pengelola.";
    }
    throw Object.assign(
      fail(
        response.status === 429 || response.status === 401 || response.status === 403
          ? 503
          : 502,
        message,
      ),
      {
        code,
        providerStatus: response.status,
        providerError:
          typeof result?.message === "string"
            ? result.message
            : "invalid_response",
      },
    );
  }
  return result;
}

/**
 * Antrian pesan WhatsApp ke tabel wa_outbox untuk pengiriman background.
 */
export async function queueWhatsApp(db, id, phone, message) {
  await db.query(
    "INSERT IGNORE INTO wa_outbox(id,phone,message) VALUES(?,?,?)",
    [id, normalizePhone(phone), message],
  );
  try {
    await db.query(
      "INSERT IGNORE INTO email_outbox(id,recipient,subject,html) VALUES(?,?,?,?)",
      [id, normalizePhone(phone), "WA: " + id, message],
    );
  } catch {}
}

/**
 * Flush pesan WhatsApp dari antrian wa_outbox.
 */
export async function flushWhatsApp(pool, env = process.env, transport = fetch) {
  if (!env.WABLAS_TOKEN && !env.RESEND_API_KEY) return;
  for (let n = 0; n < 5; n++) {
    const c = await pool.connect();
    try {
      await c.query("START TRANSACTION");
      const { rows } = await c.query(
        "SELECT * FROM wa_outbox WHERE status='pending' AND attempts<8 AND next_attempt_at<=UTC_TIMESTAMP(3) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      const msg = rows[0];
      if (!msg) {
        await c.query("COMMIT");
        break;
      }
      try {
        await sendWhatsApp(
          { id: msg.id, phone: msg.phone, message: msg.message },
          env,
          transport,
        );
        await c.query(
          "UPDATE wa_outbox SET status='sent',attempts=attempts+1,last_error=NULL WHERE id=?",
          [msg.id],
        );
      } catch (e) {
        await c.query(
          "UPDATE wa_outbox SET attempts=attempts+1,last_error=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE) WHERE id=?",
          [e.message.slice(0, 500), msg.id],
        );
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}

// ── Backward-compatible aliases ──
export const queueEmail = queueWhatsApp;
export const flushEmails = flushWhatsApp;
export const sendEmail = sendWhatsApp;

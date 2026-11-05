import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
    if (!env.XENDIT_SECRET_KEY) throw fail(503, "Xendit belum dikonfigurasi.");
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
        "Koneksi Xendit terputus. Pesanan tersimpan; coba muat pembayaran kembali.",
      );
    }
    const data = await res.json();
    if (!res.ok) {
      const error = fail(
        502,
        "Xendit menolak permintaan (" + (data.error_code || res.status) + ").",
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
          description: "Pesanan Liny Jaya " + order.id,
          invoice_duration: Math.min(
            86400,
            Math.max(300, Number(env.INVOICE_DURATION) || 3600),
          ),
          should_send_email: false,
          success_redirect_url: appUrl + "/#account",
          failure_redirect_url: appUrl + "/#account",
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
 * Menerima format 08xx, 8xx, +628xx, 628xx, 6208xx.
 */
export function normalizePhone(phone) {
  let p = String(phone || "").replace(/[\s()\-+]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (p.startsWith("8")) p = "62" + p;
  else if (p.startsWith("620")) p = "62" + p.slice(3);
  return p;
}

/**
 * Baca konfigurasi Wablas secara dinamis (sinkron dengan file .env di disk jika runtime node aktif).
 */
export function getWablasConfig(env = process.env) {
  let host = env.WABLAS_API_HOST;
  let token = env.WABLAS_TOKEN || env.WABLAS_API_KEY || env.RESEND_API_KEY;
  let secret = env.WABLAS_SECRET_KEY;

  if (env === process.env) {
    try {
      const envPath = path.resolve(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const [k, ...vParts] = trimmed.split("=");
          const v = vParts.join("=").trim().replace(/^["']|["']$/g, "");
          if (k === "WABLAS_API_HOST" && v) host = v;
          if ((k === "WABLAS_TOKEN" || k === "WABLAS_API_KEY") && v) token = v;
          if (k === "WABLAS_SECRET_KEY" && v) secret = v;
        }
      }
    } catch (_) {}
  }

  return {
    host: (host || "https://texas.wablas.com").replace(/\/$/, ""),
    token: token || "",
    secret: secret || "",
  };
}

/**
 * Kirim pesan WhatsApp melalui Wablas API.
 * @param {{phone: string, message: string, id?: string, subject?: string, recipient?: string}} wa - Data pesan WA
 * @param {object} env - Environment variables
 * @param {function} transport - Fetch function (for testing)
 * @returns {Promise<object>} Hasil dari Wablas API
 */
export async function sendWhatsApp(wa, env = process.env, transport = fetch) {
  const { host: apiHost, token: rawToken, secret: rawSecret } = getWablasConfig(env);

  if (!rawToken)
    throw fail(503, "Layanan WhatsApp belum dikonfigurasi. Hubungi pengelola.");

  let authHeader = rawToken;
  if (rawSecret) {
    // Wablas format: <token_or_api_key>.<secret_key>
    // Primary key biasanya ~50 karakter, secret key ~8 karakter.
    const [primary, secret] =
      rawToken.length < rawSecret.length
        ? [rawSecret, rawToken]
        : [rawToken, rawSecret];
    authHeader = `${primary}.${secret}`;
  }

  const normalizedPhone = normalizePhone(wa.phone);
  if (!/^628\d{7,13}$/.test(normalizedPhone)) {
    throw Object.assign(
      fail(400, "Nomor WhatsApp tidak valid (contoh: 081234567890)."),
      { code: "WA_INVALID_PHONE" }
    );
  }

  let response;
  try {
    response = await transport(apiHost + "/api/send-message", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...(wa.id ? { "Idempotency-Key": wa.id } : {}),
      },
      body: JSON.stringify({
        phone: normalizedPhone,
        message: wa.message,
        flag: "instant",
        ref_id: wa.id || undefined,
        to: [wa.recipient || normalizedPhone],
        subject: wa.subject || "Kode verifikasi Liny Jaya",
      }),
    });
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw Object.assign(
        fail(504, "Koneksi ke gateway WhatsApp waktu habis (timeout). Silakan coba lagi."),
        { code: "WA_TIMEOUT" }
      );
    }
    throw Object.assign(
      fail(
        502,
        "Gagal menghubungi server WhatsApp: " + (err.message || "koneksi terputus") + ". Periksa koneksi internet.",
      ),
      { code: "WA_NETWORK_ERROR" }
    );
  }

  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status === false) {
    let code = "WA_PROVIDER_ERROR";
    const providerMsg = String(result?.message || "");
    let message = providerMsg || "Layanan WhatsApp belum berhasil mengirim pesan. Silakan coba lagi.";

    if (response.status === 429) {
      code = "WA_RATE_LIMITED";
      message =
        "Layanan WhatsApp sedang membatasi pengiriman (rate limited). Tunggu sebentar lalu coba lagi.";
    } else if (response.status === 401 || response.status === 403) {
      code = "WA_AUTH_ERROR";
      message = providerMsg
        ? "Kredensial WhatsApp: " + providerMsg
        : "Kredensial token WhatsApp ditolak atau kedaluwarsa. Hubungi pengelola toko.";
    } else if (
      providerMsg.toLowerCase().includes("disconnected") ||
      providerMsg.toLowerCase().includes("qr code")
    ) {
      code = "WA_DEVICE_DISCONNECTED";
      message =
        "Perangkat WhatsApp toko terputus (perlu scan QR ulang). Hubungi admin toko atau gunakan opsi masuk kata sandi jika sudah memiliki akun.";
    } else if (providerMsg) {
      message = "Layanan WhatsApp: " + providerMsg;
    }

    throw Object.assign(
      fail(
        response.status === 429 || response.status === 401 || response.status === 403 || code === "WA_DEVICE_DISCONNECTED"
          ? 503
          : 502,
        message,
      ),
      {
        code,
        providerStatus: response.status,
        providerError: providerMsg || "invalid_response",
      },
    );
  }

  if (Array.isArray(result?.data?.messages) && result.data.messages.length === 0) {
    throw Object.assign(
      fail(
        400,
        "Nomor WhatsApp tidak valid atau tidak dapat menerima pesan. Periksa kembali nomor yang Anda masukkan.",
      ),
      { code: "WA_INVALID_PHONE" }
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
  } catch { }
}

export function renderWhatsAppTemplate(template, values) {
  return String(template || "").replace(/\[([a-z_]+)\]/gi, (match, key) =>
    Object.hasOwn(values, key.toLowerCase()) ? String(values[key.toLowerCase()] ?? "") : match,
  );
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
        "SELECT * FROM wa_outbox WHERE status='pending' AND attempts<8 AND next_attempt_at<=UTC_TIMESTAMP(3) ORDER BY created_at LIMIT 1 FOR UPDATE",
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

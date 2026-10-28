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
export async function queueEmail(db, id, recipient, subject, html) {
  await db.query(
    "INSERT IGNORE INTO email_outbox(id,recipient,subject,html) VALUES(?,?,?,?)",
    [id, recipient, subject, html],
  );
}
export async function sendEmail(mail, env = process.env, transport = fetch) {
  if (!env.RESEND_API_KEY)
    throw fail(503, "Layanan email belum dikonfigurasi. Hubungi pengelola.");
  // OTP selalu ditujukan ke email pendaftar. Resend memvalidasi izin pengirim/penerima.
  let response;
  try {
    response = await transport("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": mail.id,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM || "Liny Jaya <onboarding@resend.dev>",
        to: [mail.recipient],
        subject: mail.subject,
        html: mail.html,
      }),
    });
  } catch {
    throw fail(
      502,
      "Email belum berhasil dikirim. Periksa koneksi dan coba kirim ulang.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.id) {
    const detail = String(result?.message || "").toLowerCase();
    let code = "EMAIL_PROVIDER_ERROR",
      message =
        "Layanan email belum berhasil mengirim kode. Silakan coba lagi.";
    if (response.status === 429) {
      code = "EMAIL_RATE_LIMITED";
      message =
        "Layanan email sedang membatasi pengiriman. Tunggu sebentar lalu coba lagi.";
    } else if (
      /only send testing emails|testing emails to your own|test.*own email/.test(
        detail,
      )
    ) {
      code = "EMAIL_TEST_SENDER_RESTRICTED";
      message =
        "Resend menolak alamat penerima karena pengirim toko masih menggunakan domain uji. Pengelola perlu mengaktifkan pengirim terverifikasi. Akun belum dibuat.";
    } else if (
      /domain.*not verified|domain.*verify|verify.*domain/.test(detail)
    ) {
      code = "EMAIL_SENDER_UNVERIFIED";
      message =
        "Domain pengirim email toko belum terverifikasi oleh Resend. Akun belum dibuat.";
    } else if (
      response.status === 401 ||
      /api.?key|sending access|permission|access.*denied/.test(detail)
    ) {
      code = "EMAIL_API_KEY_REJECTED";
      message =
        "Resend menolak kredensial atau izin kirim milik toko. Pengelola perlu memeriksa API key. Akun belum dibuat.";
    } else if (response.status === 403) {
      code = "EMAIL_ACCESS_DENIED";
      message =
        "Resend menolak izin pengiriman email toko. Akun belum dibuat; pengelola perlu memeriksa pengaturan Resend.";
    }
    throw Object.assign(
      fail(
        response.status === 429 ||
          response.status === 401 ||
          response.status === 403
          ? 503
          : 502,
        message,
      ),
      {
        code,
        providerStatus: response.status,
        providerError:
          typeof result?.name === "string" ? result.name : "invalid_response",
      },
    );
  }
  return result;
}
export async function flushEmails(pool, env = process.env, transport = fetch) {
  if (!env.RESEND_API_KEY) return;
  for (let n = 0; n < 5; n++) {
    const c = await pool.connect();
    try {
      await c.query("START TRANSACTION");
      const { rows } = await c.query(
        "SELECT * FROM email_outbox WHERE status='pending' AND attempts<8 AND next_attempt_at<=UTC_TIMESTAMP(3) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      const mail = rows[0];
      if (!mail) {
        await c.query("COMMIT");
        break;
      }
      try {
        const allowed = env.RESEND_ALLOWED_TO?.split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (allowed?.length && !allowed.includes(mail.recipient.toLowerCase()))
          throw new Error(
            "Sandbox: penerima belum diizinkan. Verifikasi domain Resend untuk mengirim ke pelanggan.",
          );
        const response = await transport("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: "Bearer " + env.RESEND_API_KEY,
            "Content-Type": "application/json",
            "Idempotency-Key": mail.id,
          },
          body: JSON.stringify({
            from: env.RESEND_FROM || "Liny Jaya <onboarding@resend.dev>",
            to: [mail.recipient],
            subject: mail.subject,
            html: mail.html,
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error("Resend: " + (result.name || response.status));
        await c.query(
          "UPDATE email_outbox SET status='sent',provider_id=?,attempts=attempts+1,last_error=NULL WHERE id=?",
          [result.id, mail.id],
        );
      } catch (e) {
        await c.query(
          "UPDATE email_outbox SET attempts=attempts+1,last_error=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE) WHERE id=?",
          [e.message.slice(0, 500), mail.id],
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

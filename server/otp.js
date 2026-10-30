import bcrypt from "bcryptjs";
import { randomInt, randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { fail, sendWhatsApp, normalizePhone } from "./integrations.js";

const phoneSchema = z
  .string()
  .regex(/^[0-9+ ()-]{8,20}$/, "Masukkan nomor WhatsApp yang valid.")
  .transform((s) => normalizePhone(s));

export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .refine((s) => Buffer.byteLength(s) <= 72, "Kata sandi maksimal 72 byte.");

export function createOtp({ pool, env, transport, session }) {
  async function issue(phone, purpose, payload) {
    const c = await pool.connect(),
      id = randomUUID(),
      code = String(randomInt(100000, 1000000));
    try {
      await c.query("START TRANSACTION");
      const old = (
        await c.query(
          "SELECT *,TIMESTAMPDIFF(SECOND,issued_at,UTC_TIMESTAMP(3)) AS age FROM auth_challenges WHERE phone=? AND purpose=? FOR UPDATE",
          [phone, purpose],
        )
      ).rows[0];
      if (old && old.age < 60)
        throw fail(429, "Tunggu 60 detik sebelum meminta kode baru.");
      if (old)
        await c.query("DELETE FROM auth_challenges WHERE id=?", [old.id]);
      await c.query(
        "INSERT INTO auth_challenges(id,phone,purpose,code_hash,payload,expires_at) VALUES(?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))",
        [
          id,
          phone,
          purpose,
          await bcrypt.hash(code, 12),
          JSON.stringify(payload),
        ],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    try {
      const purposeText = {
        register: "Verifikasi pendaftaran akun Anda.",
        login: "Gunakan kode ini untuk masuk ke akun Anda.",
        reset: "Gunakan kode ini untuk mengatur ulang kata sandi.",
      }[purpose];
      await sendWhatsApp(
        {
          id: "otp/" + id,
          phone,
          recipient: payload?.email,
          subject: "Kode verifikasi Kintsugi: " + code,
          message:
            `*Kintsugi - Kode Verifikasi*\n\n` +
            `${purposeText}\n\n` +
            `Kode OTP Anda: *${code}*\n\n` +
            `Kode berlaku 10 menit dan hanya dapat digunakan satu kali.\n` +
            `Jangan bagikan kode ini kepada siapa pun.\n\n` +
            `Jika Anda tidak meminta kode ini, abaikan pesan ini.`,
        },
        env,
        transport,
      );
      await pool.query("UPDATE auth_challenges SET delivered=TRUE WHERE id=?", [
        id,
      ]);
    } catch (e) {
      await pool.query("DELETE FROM auth_challenges WHERE id=?", [id]);
      throw e;
    }
    return {
      challengeId: id,
      phone,
      email: payload?.email || undefined,
      purpose,
      expiresIn: 600,
      resendAfter: 60,
      message: "Kode verifikasi telah dikirim ke WhatsApp Anda.",
    };
  }

  async function register(body) {
    const f = z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: phoneSchema.optional(),
        email: z
          .string()
          .email()
          .max(254)
          .transform((s) => s.toLowerCase())
          .optional(),
        password: passwordSchema,
      })
      .refine((d) => d.phone || d.email, "Masukkan nomor WhatsApp atau email.")
      .parse(body);

    let phone = f.phone;
    if (!phone && f.email) {
      const num = createHash("sha256")
        .update(f.email)
        .digest("hex")
        .replace(/\D/g, "")
        .slice(0, 9)
        .padEnd(9, "0");
      phone = normalizePhone("081" + num);
    }

    if (
      (
        await pool.query(
          "SELECT id FROM users WHERE phone=? OR (email=? AND email!='')",
          [phone, f.email || ""],
        )
      ).rows.length
    )
      throw fail(
        409,
        "Nomor WhatsApp atau email sudah terdaftar. Silakan masuk.",
      );

    return issue(phone, "register", {
      name: f.name,
      email: f.email || "",
      passwordHash: await bcrypt.hash(f.password, 12),
    });
  }

  // Checkout mengenali akun melalui nomor terverifikasi tanpa meminta password baru.
  async function checkout(body) {
    const f = z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: phoneSchema,
        consent: z.literal(true),
      })
      .parse(body);
    const user = (
      await pool.query("SELECT id,role FROM users WHERE phone=?", [f.phone])
    ).rows[0];
    if (user?.role === "admin")
      throw fail(
        403,
        "Nomor ini milik akun administrator. Gunakan nomor pelanggan untuk berbelanja.",
      );
    if (user)
      return issue(f.phone, "login", { userId: user.id, checkout: true });
    return issue(f.phone, "register", {
      name: f.name,
      email: "",
      checkout: true,
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
    });
  }

  async function request(body = {}) {
    if (body.challengeId) {
      const id = z.string().uuid().parse(body.challengeId);
      const row = (
        await pool.query("SELECT * FROM auth_challenges WHERE id=?", [id])
      ).rows[0];
      if (!row)
        throw fail(410, "Permintaan kode sudah tidak berlaku. Mulai lagi.");
      return issue(
        row.phone,
        row.purpose,
        typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      );
    }
    const f = z
      .object({
        phone: phoneSchema.optional(),
        email: z.string().email().optional(),
        purpose: z.enum(["login", "reset"]),
      })
      .refine((d) => d.phone || d.email, "Masukkan nomor WhatsApp atau email.")
      .parse(body);

    let user;
    if (f.phone) {
      const phone = normalizePhone(f.phone);
      user = (
        await pool.query("SELECT id, phone, email FROM users WHERE phone=?", [
          phone,
        ])
      ).rows[0];
    } else {
      user = (
        await pool.query("SELECT id, phone, email FROM users WHERE email=?", [
          f.email.toLowerCase(),
        ])
      ).rows[0];
    }
    if (!user)
      throw fail(404, "Akun belum terdaftar. Buat akun terlebih dahulu.");
    return issue(user.phone || f.phone, f.purpose, {
      userId: user.id,
      email: user.email,
    });
  }

  async function verify(req, res) {
    const f = z
      .object({
        challengeId: z.string().uuid(),
        code: z.string().regex(/^\d{6}$/, "Masukkan 6 digit kode OTP."),
        newPassword: passwordSchema.optional(),
      })
      .parse(req.body);
    const c = await pool.connect();
    let user, purpose;
    try {
      await c.query("START TRANSACTION");
      const row = (
        await c.query(
          "SELECT *,expires_at>UTC_TIMESTAMP(3) AS valid FROM auth_challenges WHERE id=? FOR UPDATE",
          [f.challengeId],
        )
      ).rows[0];
      if (!row || !row.valid || !row.delivered)
        throw fail(
          410,
          "Kode sudah kedaluwarsa atau tidak tersedia. Minta kode baru.",
        );
      if (row.attempts >= 5)
        throw fail(429, "Batas percobaan tercapai. Minta kode baru.");
      if (!(await bcrypt.compare(f.code, row.code_hash))) {
        await c.query(
          "UPDATE auth_challenges SET attempts=attempts+1 WHERE id=?",
          [row.id],
        );
        await c.query("COMMIT");
        throw fail(
          400,
          "Kode salah. Sisa percobaan: " + (4 - row.attempts) + ".",
        );
      }
      purpose = row.purpose;
      const payload =
        typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      if (purpose === "register") {
        user = {
          id: randomUUID(),
          name: payload.name,
          email: payload.email || null,
          phone: row.phone,
          role: "customer",
        };
        await c.query(
          "INSERT INTO users(id,name,email,phone,password_hash,role) VALUES(?,?,?,?,?,?)",
          [
            user.id,
            user.name,
            user.email,
            user.phone,
            payload.passwordHash,
            "customer",
          ],
        );
      } else {
        user = (
          await c.query("SELECT * FROM users WHERE id=?", [payload.userId])
        ).rows[0];
        if (!user) throw fail(404, "Akun tidak ditemukan.");
        if (payload.checkout && user.role !== "customer")
          throw fail(
            403,
            "Akun administrator tidak dapat digunakan untuk pembayaran belanja.",
          );
        if (purpose === "reset") {
          if (!f.newPassword) throw fail(400, "Masukkan kata sandi baru.");
          await c.query("UPDATE users SET password_hash=? WHERE id=?", [
            await bcrypt.hash(f.newPassword, 12),
            user.id,
          ]);
          await c.query("DELETE FROM sessions WHERE user_id=?", [user.id]);
        }
      }
      await c.query("DELETE FROM auth_challenges WHERE id=?", [row.id]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      if (e.code === "ER_DUP_ENTRY")
        throw fail(
          409,
          "Nomor WhatsApp atau email sudah terdaftar. Silakan masuk.",
        );
      throw e;
    } finally {
      c.release();
    }
    if (purpose === "reset") {
      res.clearCookie("lj_session", { path: "/" });
      return {
        reset: true,
        message: "Kata sandi berhasil diperbarui. Silakan masuk.",
      };
    }
    return session(req, res, user);
  }
  return { register, request, verify, checkout };
}

import bcrypt from "bcryptjs";
import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { fail, sendEmail } from "./integrations.js";
const emailSchema = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .refine((s) => Buffer.byteLength(s) <= 72, "Kata sandi maksimal 72 byte.");
export function createOtp({ pool, env, transport, session }) {
  async function issue(email, purpose, payload) {
    const c = await pool.connect(),
      id = randomUUID(),
      code = String(randomInt(100000, 1000000));
    try {
      await c.query("START TRANSACTION");
      const old = (
        await c.query(
          "SELECT *,TIMESTAMPDIFF(SECOND,issued_at,UTC_TIMESTAMP(3)) AS age FROM auth_challenges WHERE email=? AND purpose=? FOR UPDATE",
          [email, purpose],
        )
      ).rows[0];
      if (old && old.age < 60)
        throw fail(429, "Tunggu 60 detik sebelum meminta kode baru.");
      if (old)
        await c.query("DELETE FROM auth_challenges WHERE id=?", [old.id]);
      await c.query(
        "INSERT INTO auth_challenges(id,email,purpose,code_hash,payload,expires_at) VALUES(?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))",
        [
          id,
          email,
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
      await sendEmail(
        {
          id: "otp/" + id,
          recipient: email,
          subject: "Kode verifikasi Liny Jaya: " + code,
          html:
            '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#172b3a"><h2>Liny Jaya</h2><p>' +
            {
              register: "Verifikasi pendaftaran akun Anda.",
              login: "Gunakan kode ini untuk masuk ke akun Anda.",
              reset: "Gunakan kode ini untuk mengatur ulang kata sandi.",
            }[purpose] +
            '</p><div style="font-size:36px;font-weight:bold;letter-spacing:8px;padding:24px;background:#f0f5f7">' +
            code +
            "</div><p>Kode berlaku 10 menit dan hanya dapat digunakan satu kali. Jangan bagikan kode ini kepada siapa pun.</p><p>Jika Anda tidak meminta kode ini, abaikan email ini.</p></div>",
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
      email,
      purpose,
      expiresIn: 600,
      resendAfter: 60,
      message: "Kode verifikasi telah dikirim ke email Anda.",
    };
  }
  async function register(body) {
    const f = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: emailSchema,
        password: passwordSchema,
      })
      .parse(body);
    if (
      (await pool.query("SELECT id FROM users WHERE email=?", [f.email])).rows
        .length
    )
      throw fail(409, "Email sudah terdaftar. Silakan masuk.");
    return issue(f.email, "register", {
      name: f.name,
      passwordHash: await bcrypt.hash(f.password, 12),
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
        row.email,
        row.purpose,
        typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      );
    }
    const f = z
      .object({ email: emailSchema, purpose: z.enum(["login", "reset"]) })
      .parse(body);
    const user = (
      await pool.query("SELECT id FROM users WHERE email=?", [f.email])
    ).rows[0];
    if (!user)
      throw fail(404, "Email belum terdaftar. Buat akun terlebih dahulu.");
    return issue(f.email, f.purpose, { userId: user.id });
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
          email: row.email,
          role: "customer",
        };
        await c.query(
          "INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)",
          [user.id, user.name, user.email, payload.passwordHash, "customer"],
        );
      } else {
        user = (
          await c.query("SELECT * FROM users WHERE id=?", [payload.userId])
        ).rows[0];
        if (!user) throw fail(404, "Akun tidak ditemukan.");
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
        throw fail(409, "Email sudah terdaftar. Silakan masuk.");
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
  return { register, request, verify };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import {
  createPool,
  databaseConfig,
  pool as unusedPool,
} from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
test("OTP pendaftaran dan keamanan akun", async (t) => {
  const name = "liny_jaya_test_otp_" + Date.now(),
    root = await mysql.createConnection({
      ...databaseConfig(),
      database: undefined,
    });
  await root.query(
    "CREATE DATABASE \`" +
      name +
      "\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
  const db = createPool(name);
  let server,
    mailFailure = false;
  const codes = new Map();
  try {
    await initialize(db, false);
    server = createApp(db, {
      test: true,
      env: {
        NODE_ENV: "test",
        RESEND_API_KEY: "test",
        RESEND_ALLOWED_TO: "customer@example.test,other@example.test",
      },
      gateway: { configured: false, sandbox: true },
      mailTransport: async (url, options) => {
        const mail = JSON.parse(options.body);
        if (mailFailure || mail.to[0] === "blocked@example.test")
          return new Response(JSON.stringify({ name: "validation_error" }), {
            status: 403,
          });
        codes.set(mail.to[0], mail.subject.match(/\b\d{6}\b/)[0]);
        return new Response(JSON.stringify({ id: randomUUID() }), {
          status: 200,
        });
      },
    }).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port + "/api";
    async function request(path, body, cookie = "", method = "POST") {
      const r = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: r.status,
        data: await r.json(),
        cookie: r.headers.get("set-cookie")?.split(";")[0],
      };
    }
    const body = {
      name: "Pelanggan OTP",
      email: "customer@example.test",
      password: "InitialPass2026!",
    };
    let challenge, cookie;
    await t.test(
      "daftar tidak membuat user atau sesi sebelum OTP benar; kode tidak bocor",
      async () => {
        const r = await request("/auth/register", body);
        assert.equal(r.status, 202);
        challenge = r.data;
        assert.equal(r.cookie, undefined);
        assert.equal(r.data.code, undefined);
        assert.equal(
          (await db.query("SELECT COUNT(*) AS n FROM users")).rows[0].n,
          0,
        );
        const row = (
          await db.query("SELECT * FROM auth_challenges WHERE id=?", [
            r.data.challengeId,
          ])
        ).rows[0];
        assert.notEqual(row.code_hash, codes.get(body.email));
        assert.match(row.code_hash, /^\$2/);
        assert.equal(
          (
            await request("/auth/login", {
              email: body.email,
              password: body.password,
            })
          ).status,
          401,
        );
        const wrong = codes.get(body.email) === "000000" ? "111111" : "000000";
        assert.equal(
          (
            await request("/auth/otp/verify", {
              challengeId: challenge.challengeId,
              code: wrong,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await db.query("SELECT attempts FROM auth_challenges WHERE id=?", [
              challenge.challengeId,
            ])
          ).rows[0].attempts,
          1,
        );
        assert.equal(
          (await db.query("SELECT COUNT(*) AS n FROM users")).rows[0].n,
          0,
        );
        assert.equal(
          (
            await request("/auth/otp/request", {
              challengeId: challenge.challengeId,
            })
          ).status,
          429,
        );
      },
    );
    await t.test("OTP benar menyelesaikan akun; replay ditolak", async () => {
      const r = await request("/auth/otp/verify", {
        challengeId: challenge.challengeId,
        code: codes.get(body.email),
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.role, "customer");
      cookie = r.cookie;
      assert.ok(cookie);
      assert.equal(
        (await db.query("SELECT COUNT(*) AS n FROM users")).rows[0].n,
        1,
      );
      assert.equal(
        (
          await request("/auth/otp/verify", {
            challengeId: challenge.challengeId,
            code: codes.get(body.email),
          })
        ).status,
        410,
      );
      assert.equal((await request("/auth/register", body)).status, 409);
    });
    await t.test(
      "kode kedaluwarsa, batas percobaan dan resend membatalkan kode lama",
      async () => {
        let r = await request("/auth/otp/request", {
            email: body.email,
            purpose: "login",
          }),
          id = r.data.challengeId;
        await db.query(
          "UPDATE auth_challenges SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE),issued_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE) WHERE id=?",
          [id],
        );
        assert.equal(
          (
            await request("/auth/otp/verify", {
              challengeId: id,
              code: codes.get(body.email),
            })
          ).status,
          410,
        );
        r = await request("/auth/otp/request", { challengeId: id });
        assert.equal(r.status, 202);
        assert.notEqual(r.data.challengeId, id);
        assert.equal(
          (
            await request("/auth/otp/verify", {
              challengeId: id,
              code: codes.get(body.email),
            })
          ).status,
          410,
        );
        id = r.data.challengeId;
        const wrong = codes.get(body.email) === "000000" ? "111111" : "000000";
        for (let i = 0; i < 5; i++)
          assert.equal(
            (
              await request("/auth/otp/verify", {
                challengeId: id,
                code: wrong,
              })
            ).status,
            400,
          );
        assert.equal(
          (
            await request("/auth/otp/verify", {
              challengeId: id,
              code: codes.get(body.email),
            })
          ).status,
          429,
        );
        await db.query("DELETE FROM auth_challenges WHERE id=?", [id]);
      },
    );
    await t.test(
      "reset password menggunakan OTP dan mencabut sesi lama",
      async () => {
        const r = await request("/auth/otp/request", {
          email: body.email,
          purpose: "reset",
        });
        assert.equal(r.status, 202);
        assert.equal(
          (
            await request("/auth/otp/verify", {
              challengeId: r.data.challengeId,
              code: codes.get(body.email),
              newPassword: "UpdatedPass2026!",
            })
          ).status,
          200,
        );
        assert.equal(
          (await request("/me", undefined, cookie, "GET")).status,
          401,
        );
        assert.equal(
          (
            await request("/auth/login", {
              email: body.email,
              password: body.password,
            })
          ).status,
          401,
        );
        const login = await request("/auth/login", {
          email: body.email,
          password: "UpdatedPass2026!",
        });
        assert.equal(login.status, 200);
        cookie = login.cookie;
      },
    );
    await t.test(
      "alamat tersimpan per pengguna dan perubahan password memerlukan password lama",
      async () => {
        const p = {
          name: "Nama Terbaru",
          phone: "081234567890",
          street: "Jalan Pengujian Nomor 10",
          city: "Jakarta",
          postal: "12345",
        };
        assert.equal(
          (await request("/me/profile", p, cookie, "PATCH")).status,
          200,
        );
        assert.equal(
          (await request("/me/profile", undefined, cookie, "GET")).data.street,
          p.street,
        );
        assert.equal(
          (
            await request(
              "/auth/password",
              { oldPassword: "wrong", newPassword: "NextPass2026!" },
              cookie,
              "PATCH",
            )
          ).status,
          400,
        );
        const r = await request(
          "/auth/password",
          { oldPassword: "UpdatedPass2026!", newPassword: "NextPass2026!" },
          cookie,
          "PATCH",
        );
        assert.equal(r.status, 200);
        assert.equal(
          (await request("/me", undefined, cookie, "GET")).status,
          401,
        );
        cookie = r.cookie;
      },
    );
    await t.test(
      "email tujuan mengikuti masing-masing pendaftar, tidak memakai email tetap",
      async () => {
        const addresses = [
          "registrant-one@example.test",
          "registrant-two@example.test",
        ];
        const responses = [];
        for (const email of addresses) {
          const response = await request("/auth/register", { ...body, email });
          assert.equal(response.status, 202);
          assert.equal(response.data.email, email);
          assert.ok(codes.has(email));
          responses.push(response.data.challengeId);
        }
        assert.notEqual(responses[0], responses[1]);
        assert.equal(
          (await db.query("SELECT COUNT(*) AS n FROM users")).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "gagal kirim dan penerima sandbox tidak diizinkan tidak membuat akun",
      async () => {
        assert.equal(
          (
            await request("/auth/register", {
              ...body,
              email: "blocked@example.test",
            })
          ).status,
          503,
        );
        mailFailure = true;
        assert.equal(
          (
            await request("/auth/register", {
              ...body,
              email: "other@example.test",
            })
          ).status,
          503,
        );
        assert.equal(
          (await db.query("SELECT COUNT(*) AS n FROM users")).rows[0].n,
          1,
        );
        assert.equal(
          (
            await db.query(
              "SELECT COUNT(*) AS n FROM auth_challenges WHERE email='other@example.test'",
            )
          ).rows[0].n,
          0,
        );
      },
    );
  } finally {
    if (server) await new Promise((r) => server.close(r));
    await db.end();
    await unusedPool.end();
    await root.query("DROP DATABASE \`" + name + "\`");
    await root.end();
  }
});

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
import { normalizePhone } from "../server/integrations.js";

test("OTP pendaftaran dan keamanan akun via WhatsApp", async (t) => {
  const name = "liny_jaya_test_otp_" + Date.now(),
    root = await mysql.createConnection({
      ...databaseConfig(),
      database: undefined,
    });
  await root.query(
    "CREATE DATABASE `" +
    name +
    "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
  const db = createPool(name);
  let server,
    mailFailure = false,
    waFailure = false;
    const codes = new Map();
    try {
      await initialize(db, false);
      server = createApp(db, {
        test: true,
        env: {
          NODE_ENV: "test",
          RESEND_API_KEY: "test",
          RESEND_ALLOWED_TO: "customer@example.test,other@example.test",
          WABLAS_API_HOST: "https://smg.wablas.com",
          WABLAS_TOKEN: "test-token",
          WABLAS_SECRET_KEY: "test-secret",
        },
        gateway: { configured: false, sandbox: true },
        waTransport: async (url, options) => {
          const body = JSON.parse(options.body);
          if (waFailure || body.phone === "628999999999")
            return new Response(JSON.stringify({ status: false, message: "failed" }), {
              status: 403,
            });
          const match = body.message.match(/\*(\d{6})\*/);
          if (match) codes.set(body.phone, match[1]);
          return new Response(
            JSON.stringify({
              status: true,
              message: "success",
              data: { id: randomUUID() },
            }),
            { status: 200 },
          );
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
            phone: "081234567890",
            password: "InitialPass2026!",
          };
          const normalizedPhone = normalizePhone(body.phone);
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
              assert.notEqual(row.code_hash, codes.get(normalizedPhone));
              assert.match(row.code_hash, /^\$2/);
              assert.equal(
                (
                  await request("/auth/login", {
                    email: body.email,
                    phone: body.phone,
                    password: body.password,
                  })
                ).status,
                401,
              );
              const wrong = codes.get(normalizedPhone) === "000000" ? "111111" : "000000";
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
              code: codes.get(normalizedPhone),
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
                  code: codes.get(normalizedPhone),
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
                phone: body.phone,
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
                    code: codes.get(normalizedPhone),
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
                    code: codes.get(normalizedPhone),
                  })
                ).status,
                410,
              );
              id = r.data.challengeId;
              const wrong = codes.get(normalizedPhone) === "000000" ? "111111" : "000000";
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
                    code: codes.get(normalizedPhone),
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
                phone: body.phone,
                purpose: "reset",
              });
              assert.equal(r.status, 202);
              assert.equal(
                (
                  await request("/auth/otp/verify", {
                    challengeId: r.data.challengeId,
                    code: codes.get(body.email),
                    code: codes.get(normalizedPhone),
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
                    phone: body.phone,
                    password: body.password,
                  })
                ).status,
                401,
              );
              const login = await request("/auth/login", {
                email: body.email,
                phone: body.phone,
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
            "nomor WhatsApp tujuan mengikuti masing-masing pendaftar",
            async () => {
              const numbers = [
                "081211111111",
                "081222222222",
              ];
              const responses = [];
              for (const phone of numbers) {
                const response = await request("/auth/register", {
                  ...body,
                  email: `reg_${phone}@example.test`,
                  phone,
                });
                assert.equal(response.status, 202);
                const norm = normalizePhone(phone);
                assert.equal(response.data.phone, norm);
                assert.ok(codes.has(norm));
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
            "gagal kirim WhatsApp tidak membuat akun baru",
            async () => {
              assert.equal(
                (
                  await request("/auth/register", {
                    ...body,
                    email: "blocked@example.test",
                    phone: "08999999999",
                  })
                ).status,
                503,
              );
              mailFailure = true;
              waFailure = true;
              assert.equal(
                (
                  await request("/auth/register", {
                    ...body,
                    email: "other@example.test",
                    phone: "081333333333",
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
                    "SELECT COUNT(*) AS n FROM auth_challenges WHERE phone='628133333333'",
                  )
                ).rows[0].n,
                0,
              );
            },
          );
        } finally {
          if(server) await new Promise((r) => server.close(r));
          await db.end();
          await unusedPool.end();
          await root.query("DROP DATABASE `" + name + "`");
          await root.end();
        }
      });

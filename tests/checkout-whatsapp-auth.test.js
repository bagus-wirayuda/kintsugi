import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
import { normalizePhone } from "../server/integrations.js";

test("Audit dan Mekanisme Autentikasi Pelanggan WhatsApp saat Checkout", async (t) => {
  const dbName = "lj_test_wa_auth_" + Date.now();
  const root = await mysql.createConnection({
    ...databaseConfig(),
    database: undefined,
  });
  await root.query(
    `CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  const db = createPool(dbName);

  let server;
  let waFailureMode = null; // null | "disconnected" | "generic_error"
  const sentOtps = new Map();

  try {
    await initialize(db, false);

    // Create an existing customer account
    const existingCustomerId = randomUUID();
    const existingCustomerPhone = "081234567890";
    const existingCustomerNormPhone = normalizePhone(existingCustomerPhone);
    const existingCustomerPassword = "CustomerPass123!";
    const existingCustomerHash = await bcrypt.hash(existingCustomerPassword, 10);

    await db.query(
      "INSERT INTO users (id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)",
      [
        existingCustomerId,
        "Pelanggan Terdaftar",
        "existing@customer.test",
        existingCustomerNormPhone,
        existingCustomerHash,
        "customer",
      ]
    );

    // Create an admin account
    const adminId = randomUUID();
    const adminPhone = "081987654321";
    const adminNormPhone = normalizePhone(adminPhone);
    const adminHash = await bcrypt.hash("AdminPass123!", 10);
    await db.query(
      "INSERT INTO users (id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)",
      [
        adminId,
        "Admin Toko",
        "admin@toko.test",
        adminNormPhone,
        adminHash,
        "admin",
      ]
    );

    server = createApp(db, {
      test: true,
      env: {
        NODE_ENV: "test",
        WABLAS_API_HOST: "https://smg.wablas.com",
        WABLAS_TOKEN: "mock-token",
        WABLAS_SECRET_KEY: "mock-secret",
      },
      gateway: { configured: false, sandbox: true },
      waTransport: async (url, options) => {
        const body = JSON.parse(options.body);

        if (waFailureMode === "disconnected") {
          return new Response(
            JSON.stringify({
              status: false,
              message: "device disconnected, need to scan qr code again",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        if (waFailureMode === "generic_error") {
          return new Response(
            JSON.stringify({
              status: false,
              message: "server timeout",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        const match = body.message.match(/\*(\d{6})\*/);
        if (match) {
          sentOtps.set(body.phone, match[1]);
        }
        return new Response(
          JSON.stringify({
            status: true,
            message: "success",
            data: { id: randomUUID() },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
    }).listen(0, "127.0.0.1");

    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    async function req(path, body, cookie = "", method = "POST") {
      const res = await fetch(baseUrl + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try {
        data = await res.json();
      } catch (_) {}
      return {
        status: res.status,
        data,
        cookie: res.headers.get("set-cookie")?.split(";")[0],
      };
    }

    // 1. Pemeriksaan Akun (/api/auth/lookup)
    await t.test("1. Pemeriksaan akun WhatsApp baru vs terdaftar vs admin", async () => {
      // Nomor baru
      const lookupNew = await req("/auth/lookup", { phone: "085211112222" });
      assert.equal(lookupNew.status, 200);
      assert.equal(lookupNew.data.exists, false);
      assert.equal(lookupNew.data.isNew, true);

      // Nomor pelanggan terdaftar (format lokal 08xxx)
      const lookupExistLocal = await req("/auth/lookup", { phone: "081234567890" });
      assert.equal(lookupExistLocal.status, 200);
      assert.equal(lookupExistLocal.data.exists, true);
      assert.equal(lookupExistLocal.data.isNew, false);
      assert.equal(lookupExistLocal.data.role, "customer");

      // Nomor pelanggan terdaftar (format internasional 628xxx)
      const lookupExistNorm = await req("/auth/lookup", { phone: "6281234567890" });
      assert.equal(lookupExistNorm.status, 200);
      assert.equal(lookupExistNorm.data.exists, true);
      assert.equal(lookupExistNorm.data.isNew, false);

      // Nomor admin
      const lookupAdmin = await req("/auth/lookup", { phone: "081987654321" });
      assert.equal(lookupAdmin.status, 200);
      assert.equal(lookupAdmin.data.exists, true);
      assert.equal(lookupAdmin.data.role, "admin");
    });

    // 2. Alur Pendaftaran Akun Baru saat Checkout
    await t.test("2. Alur akun baru: validasi password, kirim OTP, verifikasi, dan buat akun", async () => {
      const newPhone = "085299887766";
      const normPhone = normalizePhone(newPhone);

      // Gagal jika password < 8 karakter
      const shortPass = await req("/auth/checkout", {
        name: "Budi Santoso",
        phone: newPhone,
        consent: true,
        password: "123",
      });
      assert.equal(shortPass.status, 400);
      assert.match(shortPass.data.error, /minimal 8 karakter/i);

      // Gagal jika tanpa password untuk akun baru
      const noPass = await req("/auth/checkout", {
        name: "Budi Santoso",
        phone: newPhone,
        consent: true,
      });
      assert.equal(noPass.status, 400);

      // Berhasil meminta OTP checkout pendaftaran
      const initOtp = await req("/auth/checkout", {
        name: "Budi Santoso",
        phone: newPhone,
        email: "budi@example.test",
        consent: true,
        password: "BudiSecurePassword2026!",
      });
      assert.equal(initOtp.status, 202);
      assert.ok(initOtp.data.challengeId);
      assert.equal(initOtp.data.purpose, "register");
      assert.equal(initOtp.data.resendAfter, 60);

      // Pastikan belum ada record di tabel users sebelum kode OTP diverifikasi
      const checkPreUser = await db.query("SELECT * FROM users WHERE phone=?", [normPhone]);
      assert.equal(checkPreUser.rows.length, 0);

      // Uji kode OTP salah -> kurangi sisa percobaan
      const wrongOtp = await req("/auth/otp/verify", {
        challengeId: initOtp.data.challengeId,
        code: "999999",
      });
      assert.equal(wrongOtp.status, 400);
      assert.match(wrongOtp.data.error, /sisa percobaan/i);

      // Ambil kode yang terkirim ke WhatsApp
      const receivedCode = sentOtps.get(normPhone);
      assert.ok(receivedCode, "Kode OTP harus terkirim melalui transport WA");

      // Verifikasi dengan kode yang benar
      const verifySuccess = await req("/auth/otp/verify", {
        challengeId: initOtp.data.challengeId,
        code: receivedCode,
      });
      assert.equal(verifySuccess.status, 200);
      assert.equal(verifySuccess.data.name, "Budi Santoso");
      assert.equal(verifySuccess.data.role, "customer");
      assert.ok(verifySuccess.cookie, "Harus mengembalikan cookie session lj_session");

      // Pastikan user sekarang sudah tersimpan di tabel users dengan password ter-hash
      const checkPostUser = (await db.query("SELECT * FROM users WHERE phone=?", [normPhone])).rows[0];
      assert.ok(checkPostUser);
      assert.equal(checkPostUser.name, "Budi Santoso");
      const match = await bcrypt.compare("BudiSecurePassword2026!", checkPostUser.password_hash);
      assert.ok(match, "Password harus ter-hash dengan benar dan dapat diverifikasi");

      // Replay OTP challenge yang sudah dipakai harus ditolak (410)
      const replay = await req("/auth/otp/verify", {
        challengeId: initOtp.data.challengeId,
        code: receivedCode,
      });
      assert.equal(replay.status, 410);
    });

    // 3. Alur Pelanggan Terdaftar: Masuk Langsung dengan Password (Bypass OTP jika WA bermasalah)
    await t.test("3. Pelanggan terdaftar dapat login langsung dengan password saat checkout", async () => {
      // Login dengan nomor format lokal '081234567890'
      const loginLocal = await req("/auth/login", {
        identifier: "081234567890",
        password: "CustomerPass123!",
      });
      assert.equal(loginLocal.status, 200);
      assert.equal(loginLocal.data.role, "customer");
      assert.equal(loginLocal.data.id, existingCustomerId);
      assert.ok(loginLocal.cookie);

      // Login dengan nomor format internasional '6281234567890'
      const loginNorm = await req("/auth/login", {
        identifier: "6281234567890",
        password: "CustomerPass123!",
      });
      assert.equal(loginNorm.status, 200);
      assert.equal(loginNorm.data.id, existingCustomerId);

      // Password salah
      const wrongPass = await req("/auth/login", {
        identifier: "081234567890",
        password: "SalahPassword!",
      });
      assert.equal(wrongPass.status, 401);
      assert.match(wrongPass.data.error, /tidak cocok/i);
    });

    // 4. Alur Pelanggan Terdaftar: Masuk Melalui OTP WhatsApp
    await t.test("4. Pelanggan terdaftar dapat meminta dan verifikasi OTP WhatsApp", async () => {
      sentOtps.clear();

      const otpReq = await req("/auth/checkout", {
        name: "Pelanggan Terdaftar",
        phone: existingCustomerPhone,
        consent: true,
      });
      assert.equal(otpReq.status, 202);
      assert.equal(otpReq.data.purpose, "login");

      const code = sentOtps.get(existingCustomerNormPhone);
      assert.ok(code);

      const verifyRes = await req("/auth/otp/verify", {
        challengeId: otpReq.data.challengeId,
        code,
      });
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.data.id, existingCustomerId);
      assert.equal(verifyRes.data.role, "customer");
      assert.ok(verifyRes.cookie);
    });

    // 5. Penanganan Error Wablas Terputus / Device Disconnected
    await t.test("5. Error device disconnected pada Wablas mengembalikan pesan jelas bukan generic", async () => {
      waFailureMode = "disconnected";
      try {
        const attempt = await req("/auth/checkout", {
          name: "Tes Disconnected",
          phone: "081399001122",
          consent: true,
          password: "PasswordDiscon2026!",
        });

        // Status 503 dengan kode error terstruktur dan pesan informatif
        assert.equal(attempt.status, 503);
        assert.equal(attempt.data.code, "WA_DEVICE_DISCONNECTED");
        assert.match(attempt.data.error, /perangkat|terputus|qr code/i);
      } finally {
        waFailureMode = null;
      }
    });

    // 6. Proteksi Akun Administrator dari Checkout
    await t.test("6. Akun administrator ditolak dari autentikasi checkout", async () => {
      const adminAttempt = await req("/auth/checkout", {
        name: "Admin Toko",
        phone: adminPhone,
        consent: true,
      });
      assert.equal(adminAttempt.status, 403);
      assert.match(adminAttempt.data.error, /administrator/i);
    });

    // 7. Batas Percobaan dan Cooldown Resend
    await t.test("7. Cooldown resend 60 detik & batas 5x kesalahan OTP", async () => {
      const testPhone = "087711223344";
      const normTestPhone = normalizePhone(testPhone);

      const challenge1 = await req("/auth/checkout", {
        name: "Tes Cooldown",
        phone: testPhone,
        consent: true,
        password: "TestPass2026!",
      });
      assert.equal(challenge1.status, 202);

      // Meminta ulang langsung tanpa menunggu 60 detik harus ditolak dengan 429
      const tooFast = await req("/auth/otp/request", {
        challengeId: challenge1.data.challengeId,
      });
      assert.equal(tooFast.status, 429);
      assert.match(tooFast.data.error, /tunggu 60 detik/i);

      // Coba 5 kali salah
      for (let i = 0; i < 4; i++) {
        const failTry = await req("/auth/otp/verify", {
          challengeId: challenge1.data.challengeId,
          code: "000000",
        });
        assert.equal(failTry.status, 400);
      }

      // Percobaan ke-5
      const fail5 = await req("/auth/otp/verify", {
        challengeId: challenge1.data.challengeId,
        code: "000000",
      });
      assert.equal(fail5.status, 400);

      // Setelah 5 kali gagal, permintaan selanjutnya diblokir
      const fail6 = await req("/auth/otp/verify", {
        challengeId: challenge1.data.challengeId,
        code: "000000",
      });
      assert.equal(fail6.status, 429);
      assert.match(fail6.data.error, /batas percobaan/i);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.end();
    await root.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await root.end();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp, DEFAULT_WA_TEMPLATES } from "../server/app.js";
import { renderWhatsAppTemplate, normalizePhone } from "../server/integrations.js";

test("Admin WhatsApp Templates & OTP Template Integration", async (t) => {
  const dbName = "lj_test_wa_tmpl_" + Date.now();
  const root = await mysql.createConnection({
    ...databaseConfig(),
    database: undefined,
  });
  await root.query(
    `CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  const db = createPool(dbName);

  let server;
  const sentMessages = [];

  try {
    await initialize(db, false);

    // Create admin user
    const adminId = randomUUID();
    const adminPass = "AdminSecurePass2026!";
    const adminHash = await bcrypt.hash(adminPass, 10);
    await db.query(
      "INSERT INTO users (id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)",
      [
        adminId,
        "Administrator Toko",
        "admin@linyjaya.test",
        "6281112223334",
        adminHash,
        "admin",
      ]
    );

    server = createApp(db, {
      test: true,
      env: {
        NODE_ENV: "test",
        WABLAS_API_HOST: "https://texas.wablas.com",
        WABLAS_TOKEN: "mock-token",
        WABLAS_SECRET_KEY: "mock-secret",
      },
      gateway: { configured: false, sandbox: true },
      waTransport: async (url, options) => {
        const body = JSON.parse(options.body);
        sentMessages.push(body);
        return new Response(
          JSON.stringify({
            status: true,
            message: "success",
            data: { id: randomUUID(), messages: [{ id: "mock-1" }] },
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

    // Login as admin
    const loginRes = await req("/auth/login", {
      identifier: "admin@linyjaya.test",
      password: adminPass,
    });
    assert.equal(loginRes.status, 200);
    const adminCookie = loginRes.cookie;
    assert.ok(adminCookie);

    // 1. Template WhatsApp Default otomatis tersedia
    await t.test("1. Template WhatsApp default mencakup 6 jenis template lengkap", async () => {
      const settingsRes = await req("/admin/settings", null, adminCookie, "GET");
      assert.equal(settingsRes.status, 200);

      const templates = settingsRes.data.settings.waTemplates;
      assert.ok(templates, "waTemplates harus tersedia di pengaturan toko");

      const requiredKeys = ["otp", "purchased", "processing", "shipped", "delivered", "cancelled"];
      for (const k of requiredKeys) {
        assert.ok(templates[k], `Template '${k}' wajib tersedia secara default`);
        assert.ok(templates[k].length > 10, `Template '${k}' harus memiliki teks bermakna`);
      }

      // Pastikan defaultWaTemplates juga dikembalikan untuk fitur reset
      assert.ok(settingsRes.data.defaultWaTemplates);
      assert.equal(typeof settingsRes.data.defaultWaTemplates.otp, "string");
    });

    // 2. Pengeditan dan Penyimpanan Template WhatsApp di Database
    await t.test("2. Admin dapat mengedit template dan menyimpannya secara independen", async () => {
      const customTemplates = {
        otp: "KODE KEAMANAN ANDA: [kode_otp] untuk akun [nama] di [toko].",
        purchased: "Pembayaran Anda [nomor_pesanan] sejumlah [total] telah kami terima. Terima kasih dari [toko].",
        processing: "Barang pesanan [nomor_pesanan] sedang dipersiapkan.",
        shipped: "Paket [nomor_pesanan] dikirim via [kurir]. Resi: [nomor_resi].",
        delivered: "Pesanan [nomor_pesanan] telah sampai.",
        cancelled: "Pesanan [nomor_pesanan] senilai [total] dibatalkan.",
      };

      const saveRes = await req(
        "/admin/settings",
        { settings: { waTemplates: customTemplates } },
        adminCookie,
        "PATCH"
      );
      assert.equal(saveRes.status, 200);
      assert.equal(saveRes.data.ok, true);

      // Verifikasi pembacaan kembali dari database
      const readAgain = await req("/admin/settings", null, adminCookie, "GET");
      assert.equal(readAgain.status, 200);
      assert.equal(readAgain.data.settings.waTemplates.otp, customTemplates.otp);
      assert.equal(readAgain.data.settings.waTemplates.purchased, customTemplates.purchased);
      assert.equal(readAgain.data.settings.waTemplates.cancelled, customTemplates.cancelled);
    });

    // 3. Pengiriman OTP Menggunakan Template Dinamis
    await t.test("3. Pengiriman OTP menggunakan template aktif dan mengisi placeholder", async () => {
      sentMessages.length = 0; // reset log

      const otpRes = await req("/auth/checkout", {
        name: "Siti Rahma",
        phone: "081234567899",
        consent: true,
        password: "SitiPassword2026!",
      });

      assert.equal(otpRes.status, 202);
      assert.equal(sentMessages.length, 1);

      const sent = sentMessages[0];
      assert.equal(sent.phone, "6281234567899");
      // Template custom: "KODE KEAMANAN ANDA: [kode_otp] untuk akun [nama] di [toko]."
      assert.match(sent.message, /KODE KEAMANAN ANDA: \d{6} untuk akun Siti Rahma/i);
      assert.doesNotMatch(sent.message, /\[kode_otp\]/);
      assert.doesNotMatch(sent.message, /\[nama\]/);
    });

    // 4. Fitur Kembalikan ke Default
    await t.test("4. Pemulihan template ke default berhasil disimpan kembali", async () => {
      const resetRes = await req(
        "/admin/settings",
        { settings: { waTemplates: DEFAULT_WA_TEMPLATES } },
        adminCookie,
        "PATCH"
      );
      assert.equal(resetRes.status, 200);

      const verifyReset = await req("/admin/settings", null, adminCookie, "GET");
      assert.equal(verifyReset.data.settings.waTemplates.otp, DEFAULT_WA_TEMPLATES.otp);
      assert.equal(verifyReset.data.settings.waTemplates.cancelled, DEFAULT_WA_TEMPLATES.cancelled);
    });

    // 5. Placeholder Rendering Utility
    await t.test("5. Placeholder dinamis diganti dengan benar saat pesan dikirim", () => {
      const tpl = "Halo [nama], pesanan [nomor_pesanan] senilai [total] dikirim dengan [kurir], resi [nomor_resi] dari [toko].";
      const values = {
        nama: "Ahmad",
        nomor_pesanan: "ORD-999",
        total: "Rp250.000",
        kurir: "SiCepat",
        nomor_resi: "SC-12345",
        toko: "Liny Jaya",
      };
      const rendered = renderWhatsAppTemplate(tpl, values);
      assert.equal(
        rendered,
        "Halo Ahmad, pesanan ORD-999 senilai Rp250.000 dikirim dengan SiCepat, resi SC-12345 dari Liny Jaya."
      );
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.end();
    await root.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await root.end();
  }
});

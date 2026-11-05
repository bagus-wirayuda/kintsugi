import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { createPool, databaseConfig, pool as unusedPool } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
import { flushWhatsApp } from "../server/integrations.js";

test("Checkout: Akun baru wajib buat password & Belanja kedua kali alamat otomatis terisi", async () => {
  const name = "liny_jaya_test_chk_" + Date.now();
  const root = await mysql.createConnection({
    ...databaseConfig(),
    database: undefined,
  });
  await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const db = createPool(name);

  let server;
  const codes = new Map();

  try {
    await initialize(db, true);
    server = createApp(db, {
      test: true,
      env: {
        NODE_ENV: "test",
        WABLAS_API_HOST: "https://smg.wablas.com",
        WABLAS_TOKEN: "test-token",
        WABLAS_SECRET_KEY: "test-secret",
      },
      gateway: { configured: true, sandbox: true },
      waTransport: async (url, options) => {
        const body = JSON.parse(options.body);
        const match = body.message?.match(/\*(\d{6})\*/);
        if (match) codes.set(body.phone, match[1]);
        return new Response(
          JSON.stringify({
            status: true,
            message: "success",
            data: { id: "wa-test-id" },
          }),
          { status: 200 }
        );
      },
    }).listen(0, "127.0.0.1");

    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port + "/api";

    async function req(path, body, cookie = "", method = "POST") {
      const r = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      const rawCookie = r.headers.get("set-cookie");
      const sessionCookie = rawCookie ? rawCookie.split(";")[0] : cookie;
      return { status: r.status, data, cookie: sessionCookie };
    }

    // 1. Test /api/auth/lookup
    const testPhone = "081299887766";
    const lookupNew = await req("/auth/lookup", { phone: testPhone });
    assert.equal(lookupNew.status, 200);
    assert.equal(lookupNew.data.isNew, true);
    assert.equal(lookupNew.data.exists, false);

    // 2. Checkout OTP untuk akun baru tanpa password HARUS DITOLAK
    const chkWithoutPass = await req("/auth/checkout", {
      name: "Pelanggan Baru",
      phone: testPhone,
      consent: true,
    });
    assert.equal(chkWithoutPass.status, 400);
    assert.match(chkWithoutPass.data.error, /kata sandi/i);

    // 3. Checkout OTP untuk akun baru DENGAN password berhasil
    const chosenPassword = "PasswordBaru2026!";
    const chkWithPass = await req("/auth/checkout", {
      name: "Pelanggan Baru",
      phone: testPhone,
      email: "pelangganbaru@example.test",
      consent: true,
      password: chosenPassword,
    });
    assert.equal(chkWithPass.status, 202);
    assert.ok(chkWithPass.data.challengeId);

    // 4. Verifikasi OTP -> akun terbuat dengan password yang dipilih
    const otpCode = codes.get("6281299887766");
    assert.ok(otpCode);
    const verifyRes = await req("/auth/otp/verify", {
      challengeId: chkWithPass.data.challengeId,
      code: otpCode,
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.role, "customer");
    const sessionCookie = verifyRes.cookie;
    assert.ok(sessionCookie);

    // 5. Cek akun bisa login menggunakan password baru yang tadi dibuat di checkout
    const loginRes = await req("/auth/login", {
      phone: testPhone,
      password: chosenPassword,
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.data.name, "Pelanggan Baru");

    // 6. Buat pesanan pertama dengan alamat lengkap
    const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
    const variant = (await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])).rows[0];

    const order1Address = {
      name: "Pelanggan Baru",
      email: "pelangganbaru@example.test",
      phone: "081299887766",
      street: "Jalan Melati No. 45 RT 02 RW 05",
      city: "Jakarta Selatan",
      postal: "12340",
    };

    const order1 = await req(
      "/orders",
      {
        items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
        address: order1Address,
        shipping: "regular",
        payment: "COD",
        checkoutKey: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      },
      sessionCookie
    );
    assert.equal(order1.status, 201);
    assert.ok(order1.data.id);

    // 7. Periksa bahwa belanja untuk yang ke-2 kali dan seterusnya: alamat tersimpan di customer_profiles & dimuat di /me/profile
    const profile = await req("/me/profile", null, sessionCookie, "GET");
    assert.equal(profile.status, 200);
    assert.equal(profile.data.street, order1Address.street);
    assert.equal(profile.data.city, order1Address.city);
    assert.equal(profile.data.postal, order1Address.postal);
    assert.equal(profile.data.phone, order1Address.phone);

    // 8. Test flushWhatsApp berjalan tanpa SKIP LOCKED (kompatibel MySQL 5.7 & 8)
    await db.query(
      "INSERT INTO wa_outbox(id,phone,message,status,attempts) VALUES(?,?,?,'pending',0)",
      ["test-wa-id-1", "6281299887766", "Pesan uji antrian"]
    );
    await flushWhatsApp(db, {
      WABLAS_TOKEN: "token",
      WABLAS_SECRET_KEY: "secret",
      WABLAS_API_HOST: "https://smg.wablas.com",
    }, async () => new Response(JSON.stringify({ status: true }), { status: 200 }));
    const [waMsg] = (await db.query("SELECT status FROM wa_outbox WHERE id='test-wa-id-1'")).rows;
    assert.equal(waMsg.status, "sent");

  } finally {
    if (server) await new Promise((r) => server.close(r));
    await db.end();
    await root.query(`DROP DATABASE \`${name}\``);
    await root.end();
  }
});

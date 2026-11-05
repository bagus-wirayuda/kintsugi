import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import mysql from "mysql2/promise";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
import { ALLOWED_CUSTOMER_VIEWS, ALLOWED_GUEST_VIEWS } from "../src/routes.js";

test("Alur Checkout dan Pembayaran Terstruktur (Pemisahan Step & Validasi)", async (t) => {
  const checkoutCode = fs.readFileSync("src/Checkout.jsx", "utf-8");

  await t.test("1. Pemisahan Halaman Checkout dan Pembayaran", () => {
    // Memastikan tidak ada metode pembayaran di tahap checkout
    assert.ok(checkoutCode.includes("step === \"checkout\""), "Harus ada pemisahan step checkout");
    assert.ok(checkoutCode.includes("step === \"payment\""), "Harus ada pemisahan step payment");
    assert.ok(checkoutCode.includes("Lanjut ke Pembayaran"), "Tombol lanjut ke pembayaran harus tersedia");
    assert.ok(
      checkoutCode.includes("Pilih Metode Pembayaran"),
      "Tahap pembayaran harus menampilkan judul Pilih Metode Pembayaran"
    );

    // Di step checkout, pilihan pembayaran tidak ditampilkan langsung
    const checkoutStepSection = checkoutCode.slice(
      checkoutCode.indexOf("step === \"checkout\" ?"),
      checkoutCode.indexOf("/* TAHAP 2: PILIH METODE PEMBAYARAN")
    );
    assert.ok(
      !checkoutStepSection.includes("paymentMethod"),
      "Pilihan radio metode pembayaran tidak boleh ada di formulir checkout"
    );

    // Di step payment, radio paymentMethod ditampilkan
    const paymentStepSection = checkoutCode.slice(
      checkoutCode.indexOf("/* TAHAP 2: PILIH METODE PEMBAYARAN"),
      checkoutCode.indexOf("{identity && !user &&")
    );
    assert.ok(
      paymentStepSection.includes("paymentMethod"),
      "Pilihan radio metode pembayaran harus ditampilkan di tahap pembayaran"
    );
    assert.ok(
      paymentStepSection.includes("Ubah Data Pengiriman"),
      "Harus ada tombol untuk kembali/mengubah data pengiriman"
    );
  });

  await t.test("2. Routing dan Hak Akses Navigasi ke #payment", () => {
    assert.ok(
      ALLOWED_CUSTOMER_VIEWS.includes("payment"),
      "ALLOWED_CUSTOMER_VIEWS harus mendukung view 'payment'"
    );
    assert.ok(
      ALLOWED_GUEST_VIEWS.includes("payment"),
      "ALLOWED_GUEST_VIEWS harus mendukung view 'payment'"
    );
  });

  await t.test("3. Validasi Checkout, Ongkir Manual, dan Eksekusi Pembayaran API", async () => {
    const name = "liny_test_chkpay_" + Date.now();
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
          ADMIN_PHONE: "081122334455",
          WABLAS_API_HOST: "https://smg.wablas.com",
          WABLAS_TOKEN: "test-token",
          WABLAS_SECRET_KEY: "test-secret",
        },
        gateway: { configured: true, sandbox: true },
        waTransport: async (url, options) => {
          const body = JSON.parse(options.body);
          const match = body.message?.match(/\*(\d{6})\*/);
          if (match) codes.set(body.phone, match[1]);
          return new Response(JSON.stringify({ status: true, data: { id: "wa-1" } }), { status: 200 });
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

      // Login customer
      const chkOtp = await req("/auth/checkout", {
        name: "Siti Rahma",
        phone: "081299112233",
        email: "siti@example.com",
        consent: true,
        password: "PasswordSiti123!",
      });
      const otp = codes.get("6281299112233") || codes.get("081299112233");
      assert.ok(otp);
      const verifyRes = await req("/auth/otp/verify", {
        challengeId: chkOtp.data.challengeId,
        code: otp,
      });
      assert.equal(verifyRes.status, 200);
      const customerCookie = verifyRes.cookie;

      const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
      const variant = (await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])).rows[0];
      const unitPrice = Number(product.price);

      // A. Validasi: Alamat Pengantaran (local) gagal jika nama/telepon/alamat tidak lengkap
      const failOrder = await req("/orders", {
        items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
        address: {
          name: "S", // Terlalu pendek
          phone: "123", // Terlalu pendek
          email: "siti@example.com",
          street: "",
          city: "",
        },
        shipping: "local",
        payment: "COD",
        checkoutKey: "aaaaaaaa-1111-4111-8111-111111111111",
      }, customerCookie);
      assert.equal(failOrder.status, 400);

      // B. Validasi: Opsi Ambil di Toko (pickup) berhasil tanpa alamat jalan pengantaran
      const pickupOrder = await req("/orders", {
        items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
        address: {
          name: "Siti Rahma",
          phone: "081299112233",
          email: "siti@example.com",
          street: "Ambil di Toko",
          city: "Toko Utama",
        },
        shipping: "pickup",
        shippingOption: { courier: "TOKO", service: "Ambil di Toko", cost: 0 },
        payment: "COD",
        checkoutKey: "bbbbbbbb-2222-4222-8222-222222222222",
      }, customerCookie);
      assert.equal(pickupOrder.status, 201);
      assert.equal(Number(pickupOrder.data.delivery), 0);
      assert.equal(Number(pickupOrder.data.total), unitPrice);

      // C. Alur Pengiriman Standar dengan Metode Pembayaran Terpilih (misal: COD)
      const validCheckoutKey = "cccccccc-3333-4333-8333-333333333333";
      const deliveryOrder = await req("/orders", {
        items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
        address: {
          name: "Siti Rahma",
          phone: "081299112233",
          email: "siti@example.com",
          street: "Jalan Hasanuddin No. 12 RT 01 RW 04",
          city: "Makassar",
          postal: "90111",
        },
        shipping: "local",
        shippingOption: { courier: "TOKO", service: "Standar", cost: 15000 },
        payment: "COD",
        checkoutKey: validCheckoutKey,
      }, customerCookie);
      assert.equal(deliveryOrder.status, 201);
      assert.equal(Number(deliveryOrder.data.delivery), 15000);
      assert.equal(Number(deliveryOrder.data.total), unitPrice + 15000);

      // D. Proteksi Pesanan Ganda (Idempotency Key):
      // Mengirimkan checkoutKey yang sama tidak boleh menduplikasi baris pesanan di database
      const countBefore = (await db.query("SELECT COUNT(*) AS cnt FROM orders WHERE checkout_key=?", [validCheckoutKey])).rows[0].cnt;
      assert.equal(Number(countBefore), 1);

      const repeatOrder = await req("/orders", {
        items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
        address: {
          name: "Siti Rahma",
          phone: "081299112233",
          email: "siti@example.com",
          street: "Jalan Hasanuddin No. 12 RT 01 RW 04",
          city: "Makassar",
          postal: "90111",
        },
        shipping: "local",
        shippingOption: { courier: "TOKO", service: "Standar", cost: 15000 },
        payment: "COD",
        checkoutKey: validCheckoutKey,
      }, customerCookie);
      assert.equal(repeatOrder.status, 201);
      assert.equal(repeatOrder.data.id, deliveryOrder.data.id, "ID pesanan harus sama jika checkoutKey sama");

      const countAfter = (await db.query("SELECT COUNT(*) AS cnt FROM orders WHERE checkout_key=?", [validCheckoutKey])).rows[0].cnt;
      assert.equal(Number(countAfter), 1, "Jumlah pesanan di database tidak boleh bertambah (tidak duplikat)");

    } finally {
      if (server) await new Promise((r) => server.close(r));
      await db.end();
      await root.query(`DROP DATABASE \`${name}\``);
      await root.end();
    }
  });
});

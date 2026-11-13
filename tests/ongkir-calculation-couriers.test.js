import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";

test("Perhitungan Ongkir Otomatis (OngkirApp): J&T, JNE, TIKI, dan POS Indonesia", async (t) => {
  const dbName = "liny_test_ongkir_" + Date.now();
  const root = await mysql.createConnection({
    ...databaseConfig(),
    database: undefined,
  });
  await root.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const db = createPool(dbName);

  let server;
  const codes = new Map();
  try {
    await initialize(db, true);

    // Mock response untuk Komerce / RajaOngkir API agar pengujian cepat, deterministik, dan dapat berjalan offline/CI
    const mockDestinations = [
      {
        id: 31864,
        label: "KEMARAYA, KENDARI BARAT, KENDARI, SULAWESI TENGGARA, 93121",
        province_name: "SULAWESI TENGGARA",
        city_name: "KENDARI",
        district_name: "KENDARI BARAT",
        subdistrict_name: "KEMARAYA",
        zip_code: "93121",
      },
      {
        id: 17601,
        label: "GAMBIR, GAMBIR, JAKARTA PUSAT, DKI JAKARTA, 10110",
        province_name: "DKI JAKARTA",
        city_name: "JAKARTA PUSAT",
        district_name: "GAMBIR",
        subdistrict_name: "GAMBIR",
        zip_code: "10110",
      },
    ];

    const mockDomesticCosts = {
      jnt: [
        { code: "jnt", name: "J&T Express", service: "EZ", description: "Reguler", cost: 38000, etd: "2-3 day" },
      ],
      jne: [
        { code: "jne", name: "Jalur Nugraha Ekakurir (JNE)", service: "REG", description: "Layanan Reguler", cost: 54000, etd: "2 day" },
        { code: "jne", name: "Jalur Nugraha Ekakurir (JNE)", service: "YES", description: "Yakin Esok Sampai", cost: 80000, etd: "1 day" },
      ],
      tiki: [
        { code: "tiki", name: "Citra Van Titipan Kilat (TIKI)", service: "REG", description: "Reguler Service", cost: 43000, etd: "3 day" },
      ],
      pos: [
        { code: "pos", name: "POS Indonesia (POS)", service: "Pos Reguler", description: "Pos Reguler", cost: 57000, etd: "4 day" },
      ],
    };

    server = createApp(db, {
      test: true,
      env: {
        NODE_ENV: "test",
        RAJAONGKIR_API_KEY: "test-rajaongkir-key",
        RAJAONGKIR_ORIGIN_ID: "31864",
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

    // Simulasikan global fetch intercept khusus untuk endpoint Komerce RajaOngkir
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes("rajaongkir.komerce.id/api/v1/destination/domestic-destination")) {
        return new Response(
          JSON.stringify({
            meta: { status: "success", code: 200 },
            data: mockDestinations,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes("rajaongkir.komerce.id/api/v1/calculate/domestic-cost")) {
        const bodyStr = String(options.body || "");
        const params = new URLSearchParams(bodyStr);
        const courier = params.get("courier");
        const results = mockDomesticCosts[courier] || [];
        return new Response(
          JSON.stringify({
            meta: { status: "success", code: 200 },
            data: results,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return originalFetch(url, options);
    };

    async function req(path, body, cookie = "", method = "POST") {
      const r = await originalFetch(base + path, {
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

    // 1. Verifikasi /api/config mengaktifkan fitur ekspedisi dengan 4 kurir
    await t.test("1. /api/config mengekspos fitur ekspedisi aktif dan 4 kurir: J&T, JNE, TIKI, POS", async () => {
      const configRes = await req("/config", null, "", "GET");
      assert.equal(configRes.status, 200);
      assert.equal(configRes.data.shipping?.rajaOngkir, true);
      assert.deepEqual(configRes.data.shipping?.couriers, ["jnt", "jne", "tiki", "pos"]);
      assert.equal(configRes.data.shipping?.originId, 31864);
    });

    // 2. Pencarian tujuan pengiriman
    await t.test("2. /api/shipping/destinations mencari dan menampilkan daftar kecamatan/kota tujuan", async () => {
      const destRes = await req("/shipping/destinations?search=gambir", null, "", "GET");
      assert.equal(destRes.status, 200);
      assert.ok(Array.isArray(destRes.data));
      assert.equal(destRes.data.length, 2);
      assert.equal(destRes.data[1].id, 17601);
      assert.match(destRes.data[1].label, /GAMBIR/);
    });

    // 3. Perhitungan ongkos kirim resmi
    await t.test("3. /api/shipping/rates menghitung ongkir untuk 4 kurir: J&T, JNE, TIKI, dan POS saja", async () => {
      const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
      const ratesRes = await req("/shipping/rates", {
        destinationId: 17601,
        items: [{ id: product.id, quantity: 1 }],
      });
      assert.equal(ratesRes.status, 200);
      assert.ok(Array.isArray(ratesRes.data));
      assert.ok(ratesRes.data.length >= 4);

      // Verifikasi hanya kurir J&T, JNE, TIKI, POS yang ada
      const returnedCouriers = [...new Set(ratesRes.data.map((r) => r.courier))];
      assert.ok(returnedCouriers.includes("jnt"), "Harus ada kurir jnt");
      assert.ok(returnedCouriers.includes("jne"), "Harus ada kurir jne");
      assert.ok(returnedCouriers.includes("tiki"), "Harus ada kurir tiki");
      assert.ok(returnedCouriers.includes("pos"), "Harus ada kurir pos");
      assert.equal(returnedCouriers.filter((c) => !["jnt", "jne", "tiki", "pos"].includes(c)).length, 0, "Tidak boleh ada kurir selain 4 kurir utama");

      // Cek format nama dan estimasi hari
      const jntRate = ratesRes.data.find((r) => r.courier === "jnt");
      assert.equal(jntRate.courierName, "J&T Express");
      assert.equal(jntRate.service, "EZ");
      assert.equal(jntRate.cost, 38000);
      assert.match(jntRate.etd, /hari/i);

      const jneReg = ratesRes.data.find((r) => r.courier === "jne" && r.service === "REG");
      assert.equal(jneReg.courierName, "JNE");
      assert.equal(jneReg.cost, 54000);

      const tikiReg = ratesRes.data.find((r) => r.courier === "tiki");
      assert.equal(tikiReg.courierName, "TIKI");
      assert.equal(tikiReg.cost, 43000);

      const posReg = ratesRes.data.find((r) => r.courier === "pos");
      assert.equal(posReg.courierName, "POS Indonesia");
      assert.equal(posReg.cost, 57000);
    });

    // 4. Quote checkout dengan opsi kurir resmi
    await t.test("4. /api/checkout/quote mengakumulasikan tarif kurir resmi ke dalam total pembayaran", async () => {
      const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
      const variant = (await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])).rows[0];
      const unitPrice = Number(product.price);

      const quoteRes = await req("/checkout/quote", {
        items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
        shipping: "rajaongkir",
        shippingOption: {
          courier: "jnt",
          courierName: "J&T Express",
          service: "EZ",
          cost: 38000,
          etd: "2–3 hari",
        },
      });
      assert.equal(quoteRes.status, 200);
      assert.equal(quoteRes.data.subtotal, unitPrice);
      assert.equal(quoteRes.data.delivery, 38000);
      assert.equal(quoteRes.data.total, unitPrice + 38000);
      assert.match(quoteRes.data.shippingName, /J&T Express/);
    });

    // 5. Eksekusi pesanan /api/orders dengan kurir resmi
    await t.test("5. /api/orders menyimpan pesanan lengkap dengan nama kurir resmi dan ongkir terhitung", async () => {
      const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
      const variant = (await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])).rows[0];
      const unitPrice = Number(product.price);

      // Login pelanggan dengan OTP WhatsApp
      const chkOtp = await req("/auth/checkout", {
        name: "Rian Ekspedisi",
        phone: "081299887766",
        email: "rian@example.test",
        consent: true,
        password: "PasswordRian123!",
      });
      assert.equal(chkOtp.status, 202);
      const custOtp = codes.get("6281299887766") || codes.get("081299887766");
      assert.ok(custOtp);
      const verifyCust = await req("/auth/otp/verify", {
        challengeId: chkOtp.data.challengeId,
        code: custOtp,
      });
      assert.equal(verifyCust.status, 200);
      const customerCookie = verifyCust.cookie;

      const checkoutKey = "99999999-9999-4999-8999-999999999999";
      const orderPayload = {
        items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
        address: {
          name: "Rian Ekspedisi",
          phone: "081299887766",
          email: "rian@example.test",
          street: "Jl. Veteran No. 12",
          city: "GAMBIR, GAMBIR, JAKARTA PUSAT, DKI JAKARTA, 10110",
          postal: "10110",
        },
        shipping: "rajaongkir",
        shippingOption: {
          courier: "pos",
          courierName: "POS Indonesia",
          service: "Pos Reguler",
          cost: 57000,
          etd: "4 hari",
        },
        payment: "COD",
        checkoutKey,
      };

      const orderRes = await req("/orders", orderPayload, customerCookie);
      assert.equal(orderRes.status, 201, JSON.stringify(orderRes.data));
      assert.equal(orderRes.data.delivery, 57000);
      assert.equal(orderRes.data.total, unitPrice + 57000);

      // Periksa baris di database
      const orderDb = (await db.query("SELECT * FROM orders WHERE id=?", [orderRes.data.id])).rows[0];
      assert.equal(orderDb.shipping, "rajaongkir");
      assert.match(orderDb.shipping_name, /POS Indonesia/);
      assert.equal(orderDb.delivery, 57000);
      assert.equal(orderDb.total, unitPrice + 57000);
    });

    // 6. Ambang Batas Gratis Ongkir (Subtotal >= 699.000)
    await t.test("6. Belanja di atas Rp 699.000 otomatis mendapatkan Gratis Ongkir (Rp0) dengan opsi kurir resmi", async () => {
      const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
      const variant = (await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])).rows[0];

      // Quantity banyak agar subtotal >= 699.000
      const qty = Math.ceil(700000 / Number(product.price));
      const quoteRes = await req("/checkout/quote", {
        items: [{ id: product.id, size: variant.size, color: variant.color, quantity: qty }],
        shipping: "rajaongkir",
        shippingOption: {
          courier: "jne",
          courierName: "JNE",
          service: "YES",
          cost: 80000,
          etd: "1 hari",
        },
      });
      assert.equal(quoteRes.status, 200);
      assert.equal(quoteRes.data.delivery, 0, "Ongkir harus Rp0 untuk belanja >= 699.000");
      assert.equal(quoteRes.data.total, quoteRes.data.subtotal);
      assert.match(quoteRes.data.shippingName, /Gratis Ongkir/);
    });

  } finally {
    if (server) server.close();
    await db.end();
    await root.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await root.end();
  }
});

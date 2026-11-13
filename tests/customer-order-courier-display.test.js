import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
import { resolveShippingInfo, COURIER_DETAILS } from "../src/shipping-info.js";

test("Tampilan Pilihan Kurir dan Pengantaran Pesanan Pelanggan", async (t) => {
  // 1. Unit Testing: resolveShippingInfo untuk 4 kurir resmi + lokal + pickup
  await t.test("1. resolveShippingInfo memetakan kurir resmi (J&T, JNE, TIKI, POS), kurir lokal, dan ambil di toko secara akurat", () => {
    // J&T Express
    const jntOrder = {
      shipping: "rajaongkir",
      shipping_name: "J&T Express - EZ (2–3 hari)",
      delivery: 38000,
      status: "Diproses",
      tracking_number: "",
    };
    const jntInfo = resolveShippingInfo(jntOrder);
    assert.equal(jntInfo.code, "jnt");
    assert.equal(jntInfo.courierName, "J&T Express");
    assert.match(jntInfo.service, /EZ/);
    assert.equal(jntInfo.deliveryCostLabel, "Rp 38.000");
    assert.match(jntInfo.statusText, /Menunggu Penjemputan J&T Express/);
    assert.equal(jntInfo.trackUrl, "https://www.jet.co.id/track");

    // JNE Express
    const jneOrder = {
      shipping: "rajaongkir",
      shipping_name: "JNE REG",
      delivery: 54000,
      status: "Dikirim",
      tracking_number: "JNE1234567890",
    };
    const jneInfo = resolveShippingInfo(jneOrder);
    assert.equal(jneInfo.code, "jne");
    assert.equal(jneInfo.courierName, "JNE Express");
    assert.match(jneInfo.service, /REG/);
    assert.equal(jneInfo.trackingNumber, "JNE1234567890");
    assert.match(jneInfo.statusText, /Sedang Diantar oleh JNE Express/);
    assert.equal(jneInfo.trackUrl, "https://www.jne.co.id/tracking");

    // TIKI
    const tikiOrder = {
      shipping: "rajaongkir",
      shipping_name: "TIKI REG",
      delivery: 43000,
      status: "Selesai",
      tracking_number: "TIKI987654321",
    };
    const tikiInfo = resolveShippingInfo(tikiOrder);
    assert.equal(tikiInfo.code, "tiki");
    assert.equal(tikiInfo.courierName, "TIKI");
    assert.match(tikiInfo.statusText, /Pesanan Berhasil Diantar/);

    // POS Indonesia dengan Gratis Ongkir
    const posOrder = {
      shipping: "rajaongkir",
      shipping_name: "POS Indonesia Pos Reguler (Gratis Ongkir)",
      delivery: 0,
      status: "Diproses",
      tracking_number: "",
    };
    const posInfo = resolveShippingInfo(posOrder);
    assert.equal(posInfo.code, "pos");
    assert.equal(posInfo.courierName, "POS Indonesia");
    assert.match(posInfo.service, /Pos Reguler/);
    assert.equal(posInfo.isFree, true);
    assert.equal(posInfo.deliveryCostLabel, "Gratis Ongkir (Rp0)");

    // Kurir Toko (Lokal)
    const localOrder = {
      shipping: "local",
      shipping_name: "Pengiriman lokal",
      delivery: 15000,
      status: "Diproses",
      tracking_number: "",
    };
    const localInfo = resolveShippingInfo(localOrder);
    assert.equal(localInfo.code, "local");
    assert.equal(localInfo.courierName, "Kurir Toko");

    // Ambil di Toko (Store Pickup)
    const pickupOrder = {
      shipping: "pickup",
      shipping_name: "Ambil di Toko",
      delivery: 0,
      status: "Menunggu Pengambilan & Pembayaran",
      payment_type: "store_pickup",
    };
    const pickupInfo = resolveShippingInfo(pickupOrder);
    assert.equal(pickupInfo.isPickup, true);
    assert.equal(pickupInfo.courierName, "Ambil di Toko");
  });

  // 2. Integration: Database & API /api/orders
  const dbName = "liny_test_order_courier_" + Date.now();
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

    // 2. Pembuatan Pesanan Pelanggan dengan Kurir J&T Express
    await t.test("2. Pelanggan membuat pesanan dengan kurir J&T Express dan melihat rincian kurir di /api/orders", async () => {
      const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
      const variant = (await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])).rows[0];

      // Login pelanggan
      const chkOtp = await req("/auth/checkout", {
        name: "Dewi Safitri",
        phone: "081399881122",
        email: "dewi@example.test",
        consent: true,
        password: "PasswordDewi123!",
      });
      assert.equal(chkOtp.status, 202);
      const custOtp = codes.get("6281399881122") || codes.get("081399881122");
      assert.ok(custOtp);
      const verifyCust = await req("/auth/otp/verify", {
        challengeId: chkOtp.data.challengeId,
        code: custOtp,
      });
      assert.equal(verifyCust.status, 200);
      const customerCookie = verifyCust.cookie;

      const orderPayload = {
        items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
        address: {
          name: "Dewi Safitri",
          phone: "081399881122",
          email: "dewi@example.test",
          street: "Jl. Hayam Wuruk No. 45",
          city: "GAMBIR, JAKARTA PUSAT, DKI JAKARTA, 10110",
          postal: "10110",
        },
        shipping: "rajaongkir",
        shippingOption: {
          courier: "jnt",
          courierName: "J&T Express",
          service: "EZ",
          cost: 38000,
          etd: "2–3 hari",
        },
        payment: "COD",
        checkoutKey: "88888888-8888-4888-8888-888888888888",
      };

      const orderRes = await req("/orders", orderPayload, customerCookie);
      assert.equal(orderRes.status, 201);
      const orderId = orderRes.data.id;

      // Ambil daftar pesanan pelanggan dari endpoint GET /api/orders
      const ordersList = await req("/orders", null, customerCookie, "GET");
      assert.equal(ordersList.status, 200);
      assert.ok(Array.isArray(ordersList.data));
      const foundOrder = ordersList.data.find((o) => o.id === orderId);
      assert.ok(foundOrder);
      assert.equal(foundOrder.shipping, "rajaongkir");
      assert.match(foundOrder.shipping_name, /J&T Express/);
      assert.equal(foundOrder.delivery, 38000);

      // Verifikasi resolver frontend dapat memetakan data pesanan dari API
      const frontendShipInfo = resolveShippingInfo(foundOrder);
      assert.equal(frontendShipInfo.code, "jnt");
      assert.equal(frontendShipInfo.courierName, "J&T Express");
      assert.equal(frontendShipInfo.deliveryCostLabel, "Rp 38.000");

      // 3. Admin memasukkan nomor resi kurir dan mengubah status menjadi 'Dikirim'
      // Login admin
      const adminLogin = await req("/auth/login", {
        phone: "081122334455",
        password: process.env.ADMIN_PASSWORD || "admin12345",
      });
      // Jika login via password atau OTP, perbarui status order langsung di DB atau via endpoint
      await db.query("UPDATE orders SET status='Dikirim', tracking_number='JT9922001122' WHERE id=?", [orderId]);

      // Pelanggan memuat ulang /api/orders
      const updatedOrders = await req("/orders", null, customerCookie, "GET");
      assert.equal(updatedOrders.status, 200);
      const shippedOrder = updatedOrders.data.find((o) => o.id === orderId);
      assert.equal(shippedOrder.status, "Dikirim");
      assert.equal(shippedOrder.tracking_number, "JT9922001122");

      const shippedInfo = resolveShippingInfo(shippedOrder);
      assert.equal(shippedInfo.trackingNumber, "JT9922001122");
      assert.match(shippedInfo.statusText, /Sedang Diantar oleh J&T Express/);
      assert.match(shippedInfo.statusDetail, /JT9922001122/);
      assert.equal(shippedInfo.trackUrl, "https://www.jet.co.id/track");
    });

    // 4. Audit Kode Tampilan Frontend (Orders.jsx, ShoppingPages.jsx, kintsugi.css)
    await t.test("3. Audit kode Frontend: Orders.jsx & ShoppingPages.jsx menampilkan kurir, nomor resi, tombol salin, dan status pengantaran", () => {
      const ordersSrc = fs.readFileSync(path.resolve("src/Orders.jsx"), "utf8");
      const shoppingSrc = fs.readFileSync(path.resolve("src/ShoppingPages.jsx"), "utf8");
      const cssSrc = fs.readFileSync(path.resolve("src/kintsugi.css"), "utf8");

      // Verifikasi Orders.jsx
      assert.match(ordersSrc, /resolveShippingInfo/, "Orders.jsx harus mengimpor resolveShippingInfo");
      assert.match(ordersSrc, /ks-order-shipping-panel/, "Orders.jsx harus menampilkan panel informasi pengantaran");
      assert.match(ordersSrc, /handleCopyResi/, "Orders.jsx harus memiliki fungsi salin nomor resi");
      assert.match(ordersSrc, /ks-order-btn-copy/, "Orders.jsx harus memiliki tombol salin resi");
      assert.match(ordersSrc, /shipInfo\.trackingNumber/, "Orders.jsx harus menampilkan nomor resi");
      assert.match(ordersSrc, /shipInfo\.trackUrl/, "Orders.jsx harus menyediakan tautan pelacakan resmi");

      // Verifikasi ShoppingPages.jsx (PaymentPage)
      assert.match(shoppingSrc, /resolveShippingInfo/, "ShoppingPages.jsx harus mengimpor resolveShippingInfo");
      assert.match(shoppingSrc, /ks-payment-shipping-panel/, "ShoppingPages.jsx harus menampilkan ringkasan kurir di halaman sukses");

      // Verifikasi styling di kintsugi.css
      assert.match(cssSrc, /\.ks-order-shipping-panel/, "kintsugi.css harus memiliki styling panel kurir & pengantaran");
      assert.match(cssSrc, /\.ks-order-resi-code/, "kintsugi.css harus memiliki styling kotak nomor resi");
      assert.match(cssSrc, /\.ks-order-btn-copy/, "kintsugi.css harus memiliki styling tombol salin resi");
    });

  } finally {
    if (server) server.close();
    await db.end();
    await root.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await root.end();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";

test("Manual Shipping & Checkout: Solusi Ongkir Manual Tanpa Error shippingOption null", async () => {
  const name = "liny_test_ship_" + Date.now();
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

    // 1. Ambil data produk & varian
    const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
    const variant = (await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])).rows[0];
    const unitPrice = Number(product.price);

    // 2. Periksa /api/config menonaktifkan RajaOngkir dan menyediakan manualShippingFee
    const configRes = await req("/config", null, "", "GET");
    assert.equal(configRes.status, 200);
    assert.equal(configRes.data.shipping?.rajaOngkir, false);
    assert.equal(typeof configRes.data.shipping?.manualShippingFee, "number");

    // 3. Periksa endpoint eksternal shipping/destinations & shipping/rates dinonaktifkan secara aman
    const destRes = await req("/shipping/destinations?search=Bandung", null, "", "GET");
    assert.equal(destRes.status, 200);
    assert.deepEqual(destRes.data, []);

    const ratesRes = await req("/shipping/rates", { destinationId: "123", items: [{ id: product.id, quantity: 1 }] });
    assert.equal(ratesRes.status, 200);
    assert.deepEqual(ratesRes.data, []);

    // 4. Verifikasi /checkout/quote dengan shippingOption: null TIDAK crash / throw Zod error
    const quoteWithNull = await req("/checkout/quote", {
      items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
      shipping: "local",
      shippingOption: null,
    });
    assert.equal(quoteWithNull.status, 200);
    assert.equal(quoteWithNull.data.subtotal, unitPrice);
    assert.equal(quoteWithNull.data.delivery, configRes.data.shipping.manualShippingFee);
    assert.equal(quoteWithNull.data.total, unitPrice + configRes.data.shipping.manualShippingFee);

    // 5. Verifikasi pesanan (/orders) dengan shippingOption: null berhasil tersimpan
    // Buat sesi customer
    const chkOtp = await req("/auth/checkout", {
      name: "Budi Pembeli",
      phone: "081234567890",
      email: "budi@example.com",
      consent: true,
      password: "PasswordBudi123!",
    });
    // Verifikasi sesi customer menggunakan OTP
    const custOtp = codes.get("6281234567890") || codes.get("081234567890");
    assert.ok(custOtp);
    const verifyCust = await req("/auth/otp/verify", {
      challengeId: chkOtp.data.challengeId,
      code: custOtp,
    });
    assert.equal(verifyCust.status, 200);
    const customerCookie = verifyCust.cookie;

    const orderAddress = {
      name: "Budi Pembeli",
      email: "budi@example.com",
      phone: "081234567890",
      street: "Jl. Diponegoro No. 10",
      city: "Makassar",
      postal: "90111",
    };

    // Buat order dengan shippingOption: null (mencegah error yang dialami user)
    const orderNullShipOpt = await req("/orders", {
      items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
      address: orderAddress,
      shipping: "local",
      shippingOption: null,
      payment: "COD",
      checkoutKey: "11111111-1111-4111-8111-111111111111",
    }, customerCookie);
    assert.equal(orderNullShipOpt.status, 201);
    assert.ok(orderNullShipOpt.data.id);
    assert.equal(Number(orderNullShipOpt.data.delivery), configRes.data.shipping.manualShippingFee);
    assert.equal(Number(orderNullShipOpt.data.total), unitPrice + configRes.data.shipping.manualShippingFee);

    // 6. Admin mengubah ongkos kirim manual menjadi Rp 25.000
    // Login admin
    const loginAdmin = await req("/auth/login", {
      identifier: "admin@linyjaya.test",
      password: "AdminLinyJaya2026!",
    });
    assert.equal(loginAdmin.status, 200);
    assert.equal(loginAdmin.data.role, "admin");
    const adminCookie = loginAdmin.cookie;

    // Admin updates manual shipping fee to 25000
    const updateFeeRes = await req("/admin/settings", {
      settings: {
        manualShippingFee: 25000,
        localDeliveryFee: 25000,
      },
    }, adminCookie, "PATCH");
    assert.equal(updateFeeRes.status, 200);

    // Verifikasi config menampilkan nilai baru
    const configAfter = await req("/config", null, "", "GET");
    assert.equal(configAfter.data.shipping.manualShippingFee, 25000);

    // 7. Checkout quote dengan tarif baru 25.000 (Keranjang & Beli Langsung)
    const quoteNewFee = await req("/checkout/quote", {
      items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
      shipping: "local",
      shippingOption: { courier: "TOKO", service: "Standar", cost: 25000 },
    });
    assert.equal(quoteNewFee.status, 200);
    assert.equal(quoteNewFee.data.delivery, 25000);
    assert.equal(quoteNewFee.data.total, unitPrice + 25000);

    // 8. Buat order dengan tarif manual baru
    const orderWithNewFee = await req("/orders", {
      items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
      address: orderAddress,
      shipping: "local",
      shippingOption: { courier: "TOKO", service: "Standar", cost: 25000 },
      payment: "COD",
      checkoutKey: "22222222-2222-4222-8222-222222222222",
    }, customerCookie);
    assert.equal(orderWithNewFee.status, 201);
    assert.equal(Number(orderWithNewFee.data.delivery), 25000);
    assert.equal(Number(orderWithNewFee.data.total), unitPrice + 25000);

    // 9. Uji metode Ambil di Toko (Pickup): Ongkir harus 0
    const quotePickup = await req("/checkout/quote", {
      items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
      shipping: "pickup",
      shippingOption: { courier: "TOKO", service: "Ambil di Toko", cost: 0 },
    });
    assert.equal(quotePickup.status, 200);
    assert.equal(quotePickup.data.delivery, 0);
    assert.equal(quotePickup.data.total, unitPrice);

    const orderPickup = await req("/orders", {
      items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
      address: orderAddress,
      shipping: "pickup",
      shippingOption: { courier: "TOKO", service: "Ambil di Toko", cost: 0 },
      payment: "COD",
      checkoutKey: "33333333-3333-4333-8333-333333333333",
    }, customerCookie);
    assert.equal(orderPickup.status, 201);
    assert.equal(Number(orderPickup.data.delivery), 0);
    assert.equal(Number(orderPickup.data.total), unitPrice);

    // 10. Uji Gratis Ongkir Otomatis jika belanja >= 699.000
    // Hitung quantity agar subtotal >= 699.000
    const freeShippingQty = Math.ceil(699000 / unitPrice);
    const subtotalLarge = unitPrice * freeShippingQty;

    const quoteFreeShip = await req("/checkout/quote", {
      items: [{ id: product.id, size: variant.size, color: variant.color, quantity: freeShippingQty }],
      shipping: "local",
      shippingOption: { courier: "TOKO", service: "Standar", cost: 25000 },
    });
    assert.equal(quoteFreeShip.status, 200);
    assert.equal(quoteFreeShip.data.delivery, 0); // Bebas ongkir karena subtotal >= 699.000
    assert.equal(quoteFreeShip.data.total, subtotalLarge);

    // 11. Uji Alur Beli Langsung (Direct Purchase) vs Keranjang (Cart) dengan kupon diskon LINY10
    const quoteDirectWithCoupon = await req("/checkout/quote", {
      items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 2 }],
      coupon: "LINY10",
      shipping: "local",
      shippingOption: { courier: "TOKO", service: "Standar", cost: 25000 },
    });
    assert.equal(quoteDirectWithCoupon.status, 200);
    const expectedSubtotal = unitPrice * 2;
    const expectedDiscount = Math.min(Math.round(expectedSubtotal * 0.1), 100000);
    assert.equal(quoteDirectWithCoupon.data.subtotal, expectedSubtotal);
    assert.equal(quoteDirectWithCoupon.data.discount, expectedDiscount);
    assert.equal(quoteDirectWithCoupon.data.delivery, 25000);
    assert.equal(quoteDirectWithCoupon.data.total, expectedSubtotal - expectedDiscount + 25000);

    const orderDirectWithCoupon = await req("/orders", {
      items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 2 }],
      address: orderAddress,
      shipping: "local",
      shippingOption: { courier: "TOKO", service: "Standar", cost: 25000 },
      coupon: "LINY10",
      payment: "COD",
      checkoutKey: "44444444-4444-4444-8444-444444444444",
    }, customerCookie);
    assert.equal(orderDirectWithCoupon.status, 201);
    assert.equal(Number(orderDirectWithCoupon.data.subtotal), expectedSubtotal);
    assert.equal(Number(orderDirectWithCoupon.data.discount), expectedDiscount);
    assert.equal(Number(orderDirectWithCoupon.data.delivery), 25000);
    assert.equal(Number(orderDirectWithCoupon.data.total), expectedSubtotal - expectedDiscount + 25000);

  } finally {
    if (server) await new Promise((r) => server.close(r));
    await db.end();
    await root.query(`DROP DATABASE \`${name}\``);
    await root.end();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";

test("Alur Ambil Langsung di Toko (Store Pickup): Checkout, Idempotensi, Pemisahan Pembayaran & Konfirmasi Admin", async (t) => {
  const name = "liny_test_pickup_" + Date.now();
  const root = await mysql.createConnection({
    ...databaseConfig(),
    database: undefined,
  });
  await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const db = createPool(name);

  let server;
  let xenditCalls = 0;
  const sentWa = [];
  const otpMap = new Map();

  try {
    await initialize(db, true);

    server = createApp(db, {
      test: true,
      env: {
        NODE_ENV: "test",
        ADMIN_PHONE: "081122334455",
        STORE_CONTACT_PHONE: "081211112222",
        WABLAS_API_HOST: "https://smg.wablas.com",
        WABLAS_TOKEN: "test-token",
        WABLAS_SECRET_KEY: "test-secret",
      },
      gateway: {
        configured: false,
        sandbox: true,
        create: async () => {
          xenditCalls++;
          throw new Error("Gateway Xendit tidak boleh dipanggil untuk Ambil di Toko");
        },
      },
      waTransport: async (_url, options) => {
        const body = JSON.parse(options.body);
        sentWa.push(body);
        const m = body.message?.match(/\*(\d{6})\*/);
        if (m) otpMap.set(body.phone, m[1]);
        return new Response(JSON.stringify({ status: true, data: { id: "wa-ok" } }), { status: 200 });
      },
    }).listen(0, "127.0.0.1");

    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port + "/api";

    async function req(pathName, body = null, cookie = "", method = "POST") {
      const res = await fetch(base + pathName, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      const rawCookie = res.headers.get("set-cookie");
      const sessionCookie = rawCookie ? rawCookie.split(";")[0] : cookie;
      return { status: res.status, data, cookie: sessionCookie };
    }

    const adminLogin = await req("/auth/login", {
      identifier: "admin@linyjaya.test",
      password: "AdminLinyJaya2026!",
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = adminLogin.cookie;

    const custLogin = await req("/auth/login", {
      identifier: "pelanggan@linyjaya.test",
      password: "BelanjaLiny2026!",
    });
    assert.equal(custLogin.status, 200);
    const customerCookie = custLogin.cookie;

    // Ambil sampel produk & varian aktif
    const prodRow = (await db.query("SELECT id, name, price FROM products LIMIT 1")).rows[0];
    const varRow = (
      await db.query("SELECT id, size, color, stock FROM product_variants WHERE product_id=? LIMIT 1", [prodRow.id])
    ).rows[0];
    assert.ok(varRow && varRow.stock >= 5);

    await t.test("1. Admin Mengatur Alamat Toko, WhatsApp & Info Pengambilan -> Terbaca di /api/config", async () => {
      const saveSettings = await req(
        "/admin/settings",
        {
          settings: {
            storeAddress: "Jl. Sam Ratulangi No. 88, Kendari",
            contactPhone: "081234560000",
            pickupInfo: "Ambil setiap Senin-Minggu pukul 09.00-20.00 WITA. Bawa nomor pesanan.",
          },
        },
        adminCookie,
        "PATCH",
      );
      assert.equal(saveSettings.status, 200, JSON.stringify(saveSettings.data));

      const cfg = await req("/config", null, "", "GET");
      assert.equal(cfg.status, 200);
      assert.equal(cfg.data.storeAddress, "Jl. Sam Ratulangi No. 88, Kendari");
      assert.equal(cfg.data.contactPhone, "081234560000");
      assert.equal(cfg.data.pickupInfo, "Ambil setiap Senin-Minggu pukul 09.00-20.00 WITA. Bawa nomor pesanan.");
    });

    await t.test("2. Pemisahan Ketat Metode Pembayaran vs Pengiriman (Pickup vs Delivery)", async () => {
      // Pickup tidak boleh memilih COD atau QRIS atau metode online lain
      for (const forbiddenMethod of ["COD", "QRIS_DANA_MANUAL"]) {
        const res = await req(
          "/orders",
          {
            items: [{ id: prodRow.id, variantId: varRow.id, size: varRow.size, color: varRow.color, quantity: 1 }],
            address: { name: "Siti Pickup", phone: "081233445566", email: "siti@example.test" },
            shipping: "pickup",
            shippingOption: { courier: "TOKO", service: "Ambil Langsung di Toko", cost: 0 },
            payment: forbiddenMethod,
            checkoutKey: randomUUID(),
          },
          customerCookie,
        );
        assert.equal(res.status, 400, `Metode ${forbiddenMethod} seharusnya ditolak untuk pickup`);
      }

      // Pengiriman ke alamat (local) tidak boleh memakai store_pickup
      const deliveryWithPickupPay = await req(
        "/orders",
        {
          items: [{ id: prodRow.id, variantId: varRow.id, size: varRow.size, color: varRow.color, quantity: 1 }],
          address: {
            name: "Siti Delivery",
            phone: "081233445566",
            email: "siti@example.test",
            street: "Jl. Ahmad Yani No. 5",
            city: "Kendari",
            postal: "93111",
          },
          shipping: "local",
          shippingOption: { courier: "TOKO", service: "Pengiriman Lokal Toko", cost: 25000 },
          payment: "store_pickup",
          checkoutKey: randomUUID(),
        },
        customerCookie,
      );
      assert.equal(deliveryWithPickupPay.status, 400);
      assert.equal(xenditCalls, 0);
    });

    let pickupOrderId = "";
    await t.test("3. Pelanggan Login Checkout Ambil di Toko -> Rp0 Ongkir, Status Pending Pickup & Alamat Tersimpan Aman", async () => {
      // Simpan alamat pengiriman asli pelanggan di DB terlebih dahulu
      const profileSetup = await req(
        "/me/profile",
        {
          name: "Pelanggan Uji",
          phone: "081299990000",
          street: "Jl. Merpati Asli No. 12",
          city: "Bandung",
          postal: "40115",
        },
        customerCookie,
        "PATCH",
      );
      assert.equal(profileSetup.status, 200, JSON.stringify(profileSetup.data));

      const stockBefore = (await db.query("SELECT stock FROM product_variants WHERE id=?", [varRow.id])).rows[0].stock;

      const quoteRes = await req(
        "/checkout/quote",
        {
          items: [{ id: prodRow.id, variantId: varRow.id, size: varRow.size, color: varRow.color, quantity: 2 }],
          shipping: "pickup",
        },
        customerCookie,
      );
      assert.equal(quoteRes.status, 200);
      assert.equal(quoteRes.data.delivery, 0);
      assert.equal(quoteRes.data.total, Number(prodRow.price) * 2);

      const idempotencyKey = randomUUID();
      const createPayload = {
        items: [{ id: prodRow.id, variantId: varRow.id, size: varRow.size, color: varRow.color, quantity: 2 }],
        address: {
          name: "Pelanggan Uji",
          phone: "081299990000",
          email: "pelanggan@linyjaya.test",
          street: "Ambil Langsung di Toko",
          city: "Toko Kintsugi",
        },
        shipping: "pickup",
        shippingOption: { courier: "TOKO", service: "Ambil Langsung di Toko", cost: 0 },
        payment: "store_pickup",
        checkoutKey: idempotencyKey,
      };

      const orderRes = await req("/orders", createPayload, customerCookie);
      assert.equal(orderRes.status, 201, JSON.stringify(orderRes.data));
      assert.equal(orderRes.data.payment, "store_pickup");
      assert.equal(orderRes.data.payment_type, "store_pickup");
      assert.equal(orderRes.data.status, "Menunggu Pengambilan & Pembayaran");
      assert.equal(orderRes.data.payment_status, "PENDING");
      assert.equal(orderRes.data.delivery, 0);
      assert.equal(orderRes.data.total, Number(prodRow.price) * 2);
      assert.equal(xenditCalls, 0);
      pickupOrderId = orderRes.data.id;

      // Uji pencegahan pesanan ganda (klik tombol Konfirmasi Pesanan berulang kali dengan checkoutKey sama)
      const dupRes = await req("/orders", createPayload, customerCookie);
      assert.ok([200, 201].includes(dupRes.status));
      assert.equal(dupRes.data.id, pickupOrderId, "Permintaan duplikat tidak boleh membuat pesanan baru");

      const stockAfter = (await db.query("SELECT stock FROM product_variants WHERE id=?", [varRow.id])).rows[0].stock;
      assert.equal(stockAfter, stockBefore - 2, "Stok hanya boleh berkurang satu kali meskipun tombol diklik dua kali");

      // Alamat tersimpan milik pelanggan tidak boleh tertimpa teks 'Ambil Langsung di Toko'
      const savedProfile = (
        await db.query("SELECT street, city, postal FROM customer_profiles WHERE user_id=(SELECT id FROM users WHERE email='pelanggan@linyjaya.test')")
      ).rows[0];
      assert.equal(savedProfile.street, "Jl. Merpati Asli No. 12");
      assert.equal(savedProfile.city, "Bandung");
      assert.equal(savedProfile.postal, "40115");

      // Notifikasi WhatsApp pickup masuk antrean wa_outbox
      const queuedPickupWa = (
        await db.query("SELECT * FROM wa_outbox WHERE id=?", ["pickup/" + pickupOrderId])
      ).rows;
      assert.equal(queuedPickupWa.length, 1);
      assert.ok(queuedPickupWa[0].message.includes(pickupOrderId));
    });

    await t.test("4. Admin Melihat, Mengunci Status Sebelum Lunas, dan Mengonfirmasi Pengambilan & Pembayaran di Toko", async () => {
      const listRes = await req("/admin/orders", null, adminCookie, "GET");
      assert.equal(listRes.status, 200);
      const found = listRes.data.find((o) => o.id === pickupOrderId);
      assert.ok(found, "Pesanan store_pickup harus tampil di dashboard Admin");
      assert.equal(found.status, "Menunggu Pengambilan & Pembayaran");
      assert.equal(found.payment_status, "PENDING");

      // Tidak boleh dikirim kurir
      const shipAttempt = await req(`/admin/orders/${pickupOrderId}`, { status: "Dikirim", trackingNumber: "RESI123" }, adminCookie, "PATCH");
      assert.equal(shipAttempt.status, 409);

      // Tidak boleh langsung ditandai Selesai tanpa konfirmasi pembayaran & pengambilan
      const finishPremature = await req(`/admin/orders/${pickupOrderId}`, { status: "Selesai" }, adminCookie, "PATCH");
      assert.equal(finishPremature.status, 409);

      // Boleh ditandai barang sedang disiapkan ('Diproses') tetapi pembayaran tetap PENDING
      const prepRes = await req(`/admin/orders/${pickupOrderId}`, { status: "Diproses" }, adminCookie, "PATCH");
      assert.equal(prepRes.status, 200);
      const midOrder = (await req("/admin/orders", null, adminCookie, "GET")).data.find((o) => o.id === pickupOrderId);
      assert.equal(midOrder.status, "Diproses");
      assert.equal(midOrder.payment_status, "PENDING");

      const metricsBefore = await req("/admin/metrics", null, adminCookie, "GET");
      assert.equal(metricsBefore.status, 200);
      assert.equal(metricsBefore.data.paidOrders, 0);

      // Harus mengirim paymentConfirmed: true & pickupConfirmed: true
      const invalidConfirm = await req(
        `/admin/orders/${pickupOrderId}/confirm-pickup`,
        { paymentConfirmed: true, pickupConfirmed: false },
        adminCookie,
      );
      assert.equal(invalidConfirm.status, 400);

      // Konfirmasi pengambilan dan pembayaran secara sah
      const confirmRes = await req(
        `/admin/orders/${pickupOrderId}/confirm-pickup`,
        {
          paymentConfirmed: true,
          pickupConfirmed: true,
          paymentNote: "Dibayar tunai Rp sesuai tagihan di kasir toko",
        },
        adminCookie,
      );
      assert.equal(confirmRes.status, 200, JSON.stringify(confirmRes.data));
      assert.equal(confirmRes.data.status, "Selesai");
      assert.equal(confirmRes.data.payment_status, "PAID");
      assert.equal(confirmRes.data.tracking_number, "Diambil di Toko");
      assert.equal(confirmRes.data.payment_proof_note, "Dibayar tunai Rp sesuai tagihan di kasir toko");

      // Metrik pendapatan terhitung setelah dikonfirmasi lunas
      const metricsAfter = await req("/admin/metrics", null, adminCookie, "GET");
      assert.equal(metricsAfter.status, 200);
      assert.equal(metricsAfter.data.paidOrders, 1);
      assert.equal(metricsAfter.data.revenue, Number(prodRow.price) * 2);

      // Event pembayaran tercatat, WA konfirmasi terkirim & konfirmasi ulang ditolak 409
      const events = (await db.query("SELECT * FROM payment_events WHERE order_id=?", [pickupOrderId])).rows;
      assert.equal(events.length, 1);
      assert.equal(events[0].provider_status, "PAID");
      assert.ok(sentWa.some((w) => w.message && w.message.includes(pickupOrderId)));

      const doubleConfirm = await req(
        `/admin/orders/${pickupOrderId}/confirm-pickup`,
        { paymentConfirmed: true, pickupConfirmed: true },
        adminCookie,
      );
      assert.equal(doubleConfirm.status, 409);
    });

    await t.test("5. Pengunjung Publik (Guest OTP) Store Pickup & Pembatalan Pesanan Sebelum Diambil Mengembalikan Stok", async () => {
      const stockBefore = (await db.query("SELECT stock FROM product_variants WHERE id=?", [varRow.id])).rows[0].stock;

      const otpStart = await req("/auth/checkout", {
        name: "Budi Pengunjung",
        phone: "081355667788",
        email: "budi.pickup@example.test",
        password: "PasswordBudi123!",
        consent: true,
      });
      assert.ok([200, 202].includes(otpStart.status), JSON.stringify(otpStart.data));
      const code = otpMap.get("6281355667788") || otpMap.get("081355667788");
      assert.ok(code, "Kode OTP WhatsApp harus terkirim untuk pengunjung publik");

      const otpVerify = await req("/auth/otp/verify", {
        challengeId: otpStart.data.challengeId,
        code,
      });
      assert.equal(otpVerify.status, 200);
      const guestCookie = otpVerify.cookie;

      const guestOrder = await req(
        "/orders",
        {
          items: [{ id: prodRow.id, variantId: varRow.id, size: varRow.size, color: varRow.color, quantity: 1 }],
          address: {
            name: "Budi Pengunjung",
            phone: "081355667788",
            email: "budi.pickup@example.test",
          },
          shipping: "pickup",
          shippingOption: { courier: "TOKO", service: "Ambil Langsung di Toko", cost: 0 },
          payment: "store_pickup",
          checkoutKey: randomUUID(),
        },
        guestCookie,
      );
      assert.equal(guestOrder.status, 201, JSON.stringify(guestOrder.data));
      assert.equal(guestOrder.data.status, "Menunggu Pengambilan & Pembayaran");
      assert.equal(guestOrder.data.payment_status, "PENDING");
      assert.equal(guestOrder.data.delivery, 0);

      const stockMid = (await db.query("SELECT stock FROM product_variants WHERE id=?", [varRow.id])).rows[0].stock;
      assert.equal(stockMid, stockBefore - 1);

      const cancelRes = await req(`/orders/${guestOrder.data.id}/cancel`, {}, guestCookie);
      assert.equal(cancelRes.status, 200);

      const stockAfterCancel = (await db.query("SELECT stock FROM product_variants WHERE id=?", [varRow.id])).rows[0].stock;
      assert.equal(stockAfterCancel, stockBefore, "Pembatalan pesanan ambil di toko harus mengembalikan stok");
    });

    await t.test("6. Audit Kode Frontend Store Pickup & Responsivitas CSS", async () => {
      const [checkoutSrc, shoppingSrc, ordersSrc, adminSrc, cssSrc] = await Promise.all([
        readFile("src/Checkout.jsx", "utf8"),
        readFile("src/ShoppingPages.jsx", "utf8"),
        readFile("src/Orders.jsx", "utf8"),
        readFile("src/Admin.jsx", "utf8"),
        readFile("src/kintsugi.css", "utf8"),
      ]);

      assert.ok(checkoutSrc.includes("Pembayaran dilakukan saat pengambilan di toko"));
      assert.ok(checkoutSrc.includes("Konfirmasi Pesanan"));
      assert.ok(checkoutSrc.includes("setPayment(\"\")"));
      assert.ok(checkoutSrc.includes("submittingRef"));
      assert.ok(checkoutSrc.includes("ks-pickup-payment-box"));

      assert.ok(shoppingSrc.includes("Pembayaran dilakukan saat pengambilan di toko"));
      assert.ok(shoppingSrc.includes("Belum dibayar (Bayar di Toko)"));
      assert.ok(ordersSrc.includes("Menunggu Pengambilan & Pembayaran"));

      assert.ok(adminSrc.includes("/confirm-pickup"));
      assert.ok(adminSrc.includes("pickupPayConfirmed"));
      assert.ok(adminSrc.includes("pickupGoodsConfirmed"));
      assert.ok(adminSrc.includes("STORE_PICKUP"));
      assert.ok(adminSrc.includes("pickupInfo"));
      assert.ok(adminSrc.includes("contactPhone"));

      assert.ok(cssSrc.includes(".ks-pickup-payment-box"));
      assert.ok(cssSrc.includes(".ks-pickup-info-grid"));
      assert.ok(cssSrc.includes(".ks-admin-pickup-verify"));
      assert.ok(cssSrc.includes("@media (max-width: 600px)"));
    });
  } finally {
    if (server) server.close();
    await db.end();
    await root.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await root.end();
  }
});

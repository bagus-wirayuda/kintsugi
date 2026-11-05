import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";

test("Sistem Metode Pembayaran Admin dan COD Tanpa Duplikasi Xendit", async (t) => {
  const name = "liny_test_paymethods_" + Date.now();
  const root = await mysql.createConnection({
    ...databaseConfig(),
    database: undefined,
  });
  await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const db = createPool(name);

  let server;
  let adminCookie;
  let customerCookie;

  try {
    await initialize(db, true);

    server = createApp(db, {
      test: true,
      env: {
        NODE_ENV: "test",
        ADMIN_PHONE: "081111111111",
        WABLAS_API_HOST: "https://smg.wablas.com",
        WABLAS_TOKEN: "test-token",
        WABLAS_SECRET_KEY: "test-secret",
      },
      gateway: {
        configured: true,
        sandbox: true,
        create: async (o) => ({
          id: "inv-" + o.id,
          invoice_url: "https://checkout.xendit.co/web/inv-" + o.id,
          external_id: o.id,
          amount: o.total,
          currency: "IDR",
          expiry_date: new Date(Date.now() + 3600000).toISOString(),
        }),
      },
      waTransport: async () => new Response(JSON.stringify({ status: true, data: { id: "wa-1" } }), { status: 200 }),
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

    // Login Admin
    const adminLogin = await req("/auth/login", {
      identifier: "admin@linyjaya.test",
      password: "AdminLinyJaya2026!",
    });
    assert.equal(adminLogin.status, 200);
    adminCookie = adminLogin.cookie;

    // Login Customer
    const custLogin = await req("/auth/login", {
      identifier: "pelanggan@linyjaya.test",
      password: "BelanjaLiny2026!",
    });
    assert.equal(custLogin.status, 200);
    customerCookie = custLogin.cookie;

    await t.test("1. Pembersihan Data Bawaan: Hanya COD yang tersedia secara default", async () => {
      const res = await req("/admin/payment-methods", null, adminCookie, "GET");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data));

      // Memastikan hanya ada 1 metode default yaitu COD
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0].id, "COD");
      assert.equal(res.data[0].group, "COD");
      assert.equal(res.data[0].enabled, 1);

      // Memastikan channel lama (BCA, QRIS, DANA) sudah bersih
      const hasLegacy = res.data.some((m) => ["BCA", "QRIS", "DANA", "BNI"].includes(m.id));
      assert.equal(hasLegacy, false);
    });

    await t.test("2. Admin CRUD Metode Pembayaran (Tambah, Edit, Toggle, Hapus)", async () => {
      // A. Tambah metode Bank
      const addBank = await req(
        "/admin/payment-methods",
        {
          name: "Transfer Bank (Virtual Account)",
          group: "Bank",
          detail: "Virtual Account berbagai bank dengan verifikasi otomatis Xendit",
          enabled: true,
        },
        adminCookie,
        "POST"
      );
      assert.equal(addBank.status, 201);
      const bankId = addBank.data.id;
      assert.ok(bankId);

      // B. Tambah metode E-Wallet
      const addWallet = await req(
        "/admin/payment-methods",
        {
          name: "E-Wallet & QRIS",
          group: "E-Wallet",
          detail: "Bayar instan via QRIS, GoPay, OVO, DANA, ShopeePay",
          enabled: true,
        },
        adminCookie,
        "POST"
      );
      assert.equal(addWallet.status, 201);
      const walletId = addWallet.data.id;
      assert.ok(walletId);

      // C. Verifikasi ketiga kategori (Bank, E-Wallet, COD) muncul di settings
      const settingsRes = await req("/admin/settings", null, adminCookie, "GET");
      assert.equal(settingsRes.status, 200);
      const groups = settingsRes.data.paymentMethods.map((m) => m.group);
      assert.ok(groups.includes("Bank"));
      assert.ok(groups.includes("E-Wallet"));
      assert.ok(groups.includes("COD"));

      // D. Edit metode Bank
      const editRes = await req(
        `/admin/payment-methods/${bankId}`,
        {
          name: "Transfer Bank VA (Semua Bank)",
          detail: "BCA, BNI, BRI, Mandiri, Permata, BSI otomatis",
        },
        adminCookie,
        "PATCH"
      );
      assert.equal(editRes.status, 200);

      // E. Toggle status metode E-Wallet menjadi nonaktif
      const toggleRes = await req(
        `/admin/payment-methods/${walletId}`,
        {
          enabled: false,
        },
        adminCookie,
        "PATCH"
      );
      assert.equal(toggleRes.status, 200);

      // Periksa hasil toggle di public config
      const configRes = await req("/config", null, "", "GET");
      assert.equal(configRes.status, 200);
      const publicIds = configRes.data.paymentMethods.map((m) => m.id);
      assert.ok(publicIds.includes("COD"));
      assert.ok(publicIds.includes(bankId));
      assert.ok(!publicIds.includes(walletId), "Metode yang dinonaktifkan tidak boleh muncul di /config");

      // F. Hapus metode E-Wallet
      const delRes = await req(`/admin/payment-methods/${walletId}`, null, adminCookie, "DELETE");
      assert.equal(delRes.status, 200);
      const afterDel = await req("/admin/payment-methods", null, adminCookie, "GET");
      assert.ok(!afterDel.data.some((m) => m.id === walletId));
    });

    await t.test("3. Checkout Pelanggan dengan COD: Lewati Xendit & Langsung Diproses", async () => {
      const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
      const variant = (await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])).rows[0];

      const codOrder = await req(
        "/orders",
        {
          items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
          address: {
            name: "Budi Santoso",
            phone: "081234567890",
            email: "budi@example.com",
            street: "Jl. Merdeka No. 45",
            city: "Jakarta Pusat",
            postal: "10110",
          },
          shipping: "local",
          shippingOption: { courier: "TOKO", service: "Standar", cost: 15000 },
          payment: "COD",
          checkoutKey: "11111111-1111-4111-8111-111111111111",
        },
        customerCookie
      );

      assert.equal(codOrder.status, 201);
      assert.equal(codOrder.data.status, "Diproses", "Pesanan COD langsung berstatus Diproses");
      assert.equal(codOrder.data.payment_status, "PENDING");
      assert.equal(codOrder.data.payment_url, "/#account", "Pesanan COD tidak membuat invoice Xendit eksternal");
      assert.equal(codOrder.data.invoice_id, null);
    });

    await t.test("4. Validasi Backend: Tolak Metode Pembayaran yang Dinonaktifkan", async () => {
      // Nonaktifkan metode COD sementara
      await req("/admin/payment-methods/COD", { enabled: false }, adminCookie, "PATCH");

      const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
      const variant = (await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])).rows[0];

      const rejectedOrder = await req(
        "/orders",
        {
          items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
          address: {
            name: "Budi Santoso",
            phone: "081234567890",
            email: "budi@example.com",
            street: "Jl. Merdeka No. 45",
            city: "Jakarta Pusat",
            postal: "10110",
          },
          shipping: "local",
          shippingOption: { courier: "TOKO", service: "Standar", cost: 15000 },
          payment: "COD",
          checkoutKey: "22222222-2222-4222-8222-222222222222",
        },
        customerCookie
      );

      assert.equal(rejectedOrder.status, 400);

      // Aktifkan kembali COD
      await req("/admin/payment-methods/COD", { enabled: true }, adminCookie, "PATCH");
    });

    await t.test("5. Transisi Status Pesanan COD oleh Admin: Diproses -> Dikirim -> Selesai", async () => {
      const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
      const variant = (await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])).rows[0];

      // Buat pesanan COD baru
      const newCod = await req(
        "/orders",
        {
          items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
          address: {
            name: "Ahmad Dahlan",
            phone: "081987654321",
            email: "ahmad@example.com",
            street: "Jl. Sudirman No. 10",
            city: "Bandung",
            postal: "40111",
          },
          shipping: "local",
          shippingOption: { courier: "TOKO", service: "Standar", cost: 15000 },
          payment: "COD",
          checkoutKey: "33333333-3333-4333-8333-333333333333",
        },
        customerCookie
      );

      assert.equal(newCod.status, 201);
      const orderId = newCod.data.id;
      assert.equal(newCod.data.status, "Diproses");
      assert.equal(newCod.data.payment_status, "PENDING");

      // 1. Admin mengubah status ke 'Dikirim' tanpa memerlukan Xendit PAID
      const shipRes = await req(
        `/admin/orders/${orderId}`,
        {
          status: "Dikirim",
          trackingNumber: "LJ-COD-RESI-12345",
        },
        adminCookie,
        "PATCH"
      );
      assert.equal(shipRes.status, 200);

      const afterShip = (await db.query("SELECT status, payment_status, tracking_number FROM orders WHERE id=?", [orderId])).rows[0];
      assert.equal(afterShip.status, "Dikirim");
      assert.equal(afterShip.payment_status, "PENDING");
      assert.equal(afterShip.tracking_number, "LJ-COD-RESI-12345");

      // 2. Admin mengubah status ke 'Selesai' -> Otomatis tandai pembayaran lunas (PAID)
      const completeRes = await req(
        `/admin/orders/${orderId}`,
        {
          status: "Selesai",
        },
        adminCookie,
        "PATCH"
      );
      assert.equal(completeRes.status, 200);

      const afterComplete = (await db.query("SELECT status, payment_status, paid_at FROM orders WHERE id=?", [orderId])).rows[0];
      assert.equal(afterComplete.status, "Selesai");
      assert.equal(afterComplete.payment_status, "PAID", "Pesanan COD selesai harus ditandai PAID lunas");
      assert.ok(afterComplete.paid_at, "Waktu pelunasan paid_at harus terisi");
    });

    await t.test("6. Checkout Online Payment (Bank) Mengintegrasikan Pembuatan Invoice Xendit", async () => {
      // Tambah metode Bank aktif
      const addBank = await req(
        "/admin/payment-methods",
        {
          name: "Transfer Bank",
          group: "Bank",
          detail: "Virtual Account resmi Xendit",
          enabled: true,
        },
        adminCookie,
        "POST"
      );
      assert.equal(addBank.status, 201);
      const bankId = addBank.data.id;

      const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
      const variant = (await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])).rows[0];

      const onlineOrder = await req(
        "/orders",
        {
          items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
          address: {
            name: "Dewi Lestari",
            phone: "081234567899",
            email: "dewi@example.com",
            street: "Jl. Diponegoro No. 8",
            city: "Surabaya",
            postal: "60241",
          },
          shipping: "local",
          shippingOption: { courier: "TOKO", service: "Standar", cost: 15000 },
          payment: bankId,
          checkoutKey: "44444444-4444-4444-8444-444444444444",
        },
        customerCookie
      );

      assert.equal(onlineOrder.status, 201);
      assert.equal(onlineOrder.data.status, "Menunggu pembayaran");
      assert.equal(onlineOrder.data.payment_status, "PENDING");
      assert.ok(onlineOrder.data.invoice_id);
      assert.ok(onlineOrder.data.payment_url.startsWith("https://checkout.xendit.co/web/"));

      // Validasi: Status pesanan online TIDAK boleh ditransisikan ke 'Dikirim' sebelum payment_status PAID
      const prematureShip = await req(
        `/admin/orders/${onlineOrder.data.id}`,
        {
          status: "Dikirim",
          trackingNumber: "LJ-RESI-FAIL",
        },
        adminCookie,
        "PATCH"
      );
      assert.equal(prematureShip.status, 409, "Pesanan online belum lunas tidak boleh dikirim");
    });

    await t.test("7. Pembayaran Masa Lalu (Legacy Payment Names) Tetap Terbaca Utuh", async () => {
      const { paymentName } = await import("../src/payment-methods.js");
      assert.equal(paymentName("COD"), "Bayar di Tempat (COD)");
      assert.equal(paymentName("BCA"), "BCA Virtual Account");
      assert.equal(paymentName("QRIS"), "QRIS");
      assert.equal(paymentName("DANA"), "DANA");
      assert.equal(paymentName("BNI"), "BNI Virtual Account");
      assert.equal(paymentName("SHOPEEPAY"), "ShopeePay");
    });
  } finally {
    if (server) await new Promise((r) => server.close(r));
    await db.end();
    await root.query(`DROP DATABASE \`${name}\``);
    await root.end();
  }
});

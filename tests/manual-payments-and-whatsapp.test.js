import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp, DEFAULT_WA_TEMPLATES } from "../server/app.js";
import {
  normalizePhone,
  getWablasConfig,
  renderWhatsAppTemplate,
  queueWhatsApp,
  flushWhatsApp,
} from "../server/integrations.js";
import {
  isManualPaymentMethod,
  isManualQrisMethod,
  PAYMENT_TYPES,
} from "../src/payment-methods.js";

const sampleProofPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("Integrasi WhatsApp API, Pembayaran Manual, Notifikasi & Verifikasi Admin Kintsugi", async (t) => {
  const dbName = "lj_test_manual_wa_" + Date.now();
  const root = await mysql.createConnection({
    ...databaseConfig(),
    database: undefined,
  });
  await root.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();

  const pool = createPool(dbName);
  await initialize(pool, { seed: true });

  const waSent = [];
  let waShouldFail = false;

  const app = createApp(pool, {
    env: {
      NODE_ENV: "test",
      DB_NAME: dbName,
      APP_URL: "https://kintsugi-store.test",
      ADMIN_PHONE: "081111111111",
      STORE_CONTACT_PHONE: "081111111111",
      WABLAS_API_HOST: "https://smg.wablas.com",
      WABLAS_TOKEN: "yLpsh7kdI3KMvNnui1LURwQY18xKthfHjZggPBL5MumQVj5GvO3qJ2O",
      WABLAS_SECRET_KEY: "YxE8WJEH",
    },
    waTransport: async (url, init) => {
      if (waShouldFail) {
        throw new Error("Wablas connection timeout");
      }
      const parsed = JSON.parse(init.body || "{}");
      waSent.push({ url, headers: init.headers, body: parsed });
      return new Response(
        JSON.stringify({
          status: true,
          message: "success",
          data: { messages: [{ id: "wa-msg-" + Date.now() }] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port + "/api";

  async function req(pathName, body, cookie = "", method = "POST") {
    const r = await fetch(base + pathName, {
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

  t.after(async () => {
    server.close();
    await pool.end();
    const cleanup = await mysql.createConnection({
      ...databaseConfig(),
      database: undefined,
    });
    await cleanup.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await cleanup.end();
  });

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

  // Insert standard product with variants
  const createProd = await req(
    "/admin/products",
    {
      name: "Sprei Kintsugi Silk Satin",
      sku: "LJ-SILK-01",
      category: "Bedding",
      subcategory: "Set Sprei & Bedcover",
      image: sampleProofPng,
      isNew: true,
      sizes: ["180x200x30"],
      colors: ["Emerald Gold"],
      stock: 50,
      variants: [
        {
          size: "180x200x30",
          color: "Emerald Gold",
          stock: 50,
          price: 250000,
        },
      ],
      description: "Sprei mewah kualitas Kintsugi.",
    },
    adminCookie,
  );
  assert.equal(createProd.status, 201, JSON.stringify(createProd.data));
  const productId = createProd.data.id;

  await t.test("1. Audit WhatsApp: Normalisasi Nomor, Format Config, & Render Template", () => {
    assert.equal(normalizePhone("081234567890"), "6281234567890");
    assert.equal(normalizePhone("+62 812-3456-7890"), "6281234567890");
    assert.equal(normalizePhone("81234567890"), "6281234567890");
    assert.equal(normalizePhone("62081234567890"), "6281234567890");

    const conf = getWablasConfig({
      WABLAS_API_HOST: "https://smg.wablas.com/",
      WABLAS_TOKEN: "yLpsh7kdI3KMvNnui1LURwQY18xKthfHjZggPBL5MumQVj5GvO3qJ2O",
      WABLAS_SECRET_KEY: "YxE8WJEH",
    });
    assert.equal(conf.host, "https://smg.wablas.com");
    assert.equal(conf.token, "yLpsh7kdI3KMvNnui1LURwQY18xKthfHjZggPBL5MumQVj5GvO3qJ2O");
    assert.equal(conf.secret, "YxE8WJEH");

    const rendered = renderWhatsAppTemplate("Halo [nama], pesanan #[nomor_pesanan] sebesar [total] di [toko].", {
      nama: "Budi",
      nomor_pesanan: "LJ-999",
      total: "Rp250.000",
      toko: "Kintsugi",
    });
    assert.equal(rendered, "Halo Budi, pesanan #LJ-999 sebesar Rp250.000 di Kintsugi.");
  });

  await t.test("2. Helper isManualPaymentMethod Konsisten untuk Bank, E-Wallet, dan QRIS", () => {
    assert.equal(isManualPaymentMethod({ paymentType: PAYMENT_TYPES.MANUAL }), true);
    assert.equal(isManualPaymentMethod({ paymentType: PAYMENT_TYPES.QRIS_MANUAL }), true);
    assert.equal(isManualPaymentMethod({ id: "BANK_BCA_MANUAL", group: "Bank" }), true);
    assert.equal(isManualPaymentMethod({ id: "EWALLET_DANA_MANUAL", group: "E-Wallet" }), true);
    assert.equal(isManualPaymentMethod({ group: "COD" }), false);
    assert.equal(isManualPaymentMethod({ paymentType: PAYMENT_TYPES.STORE_PICKUP }), false);
  });

  let bcaOrderId = "";
  await t.test("3. Checkout Pembayaran Bank BCA Manual & Snapshot Rekening Tersimpan", async () => {
    const orderRes = await req(
      "/orders",
      {
        items: [{ id: productId, size: "180x200x30", color: "Emerald Gold", quantity: 1 }],
        payment: "BANK_BCA_MANUAL",
        shipping: "manual",
        shippingCost: 25000,
        checkoutKey: randomUUID(),
        address: {
          name: "Siti Rahma",
          email: "siti@linyjaya.test",
          phone: "081234567899",
          street: "Jl. Veteran No. 12",
          city: "Makassar",
          postal: "90111",
        },
      },
      customerCookie,
    );
    assert.equal(orderRes.status, 201, JSON.stringify(orderRes.data));
    bcaOrderId = orderRes.data.id;
    assert.ok(bcaOrderId);
    assert.equal(orderRes.data.payment_status, "PENDING");
    assert.equal(orderRes.data.account_number, "1234567890");
    assert.equal(orderRes.data.account_name, "PT Liny Jaya");
    assert.ok(orderRes.data.instructions.includes("BCA"));
  });

  await t.test("4. Tombol 'Saya Sudah Melakukan Pembayaran' -> WA 3.A Pelanggan & WA 3.B Admin", async () => {
    waSent.length = 0;
    const confirmRes = await req(
      `/orders/${bcaOrderId}/confirm-payment`,
      {
        proofData: sampleProofPng,
        note: "Transfer dari m-BCA a.n. Siti Rahma pukul 10:15",
      },
      customerCookie,
    );
    assert.equal(confirmRes.status, 200, JSON.stringify(confirmRes.data));
    assert.equal(confirmRes.data.payment_status, "WAITING_VERIFICATION");
    assert.ok(confirmRes.data.payment_proof_url);
    assert.equal(confirmRes.data.payment_proof_note, "Transfer dari m-BCA a.n. Siti Rahma pukul 10:15");

    // Flush background outbox
    const flushRes = await req("/admin/whatsapp/flush", {}, adminCookie);
    assert.equal(flushRes.status, 200);

    // Verify Customer Notification 3.A
    const custWa = waSent.find((m) => m.body.phone === "6281234567899");
    assert.ok(custWa, "Notifikasi WA pelanggan harus terkirim");
    assert.ok(custWa.body.message.includes("Terima kasih, Siti Rahma"));
    assert.ok(custWa.body.message.includes(bcaOrderId));
    assert.ok(custWa.body.message.includes("sedang dalam proses verifikasi"));

    // Verify Admin Notification 3.B
    const adminWa = waSent.find((m) => m.body.phone === "6281111111111");
    assert.ok(adminWa, "Notifikasi WA admin verifikasi harus terkirim");
    assert.ok(adminWa.body.message.includes("PERMINTAAN VERIFIKASI PEMBAYARAN"));
    assert.ok(adminWa.body.message.includes("Siti Rahma"));
    assert.ok(adminWa.body.message.includes(bcaOrderId));
    assert.ok(adminWa.body.message.includes("url_verifikasi") === false, "Placeholder URL verifikasi harus ter-render");
    assert.ok(adminWa.body.message.includes(bcaOrderId));
  });

  await t.test("5. Admin Menyetujui Pembayaran (Approve) -> Status Diproses & WA 3.C", async () => {
    waSent.length = 0;
    const approveRes = await req(
      `/admin/orders/${bcaOrderId}/verify-payment`,
      { action: "approve" },
      adminCookie,
    );
    assert.equal(approveRes.status, 200, JSON.stringify(approveRes.data));
    assert.equal(approveRes.data.payment_status, "PAID");
    assert.equal(approveRes.data.status, "Diproses");
    assert.ok(approveRes.data.paid_at);
    assert.ok(approveRes.data.payment_verified_at);

    // Flush background outbox
    await req("/admin/whatsapp/flush", {}, adminCookie);

    // Verify Customer Approval Notification 3.C
    const approvedWa = waSent.find((m) => m.body.phone === "6281234567899");
    assert.ok(approvedWa, "Notifikasi WA disetujui harus terkirim ke pelanggan");
    assert.ok(approvedWa.body.message.includes("berhasil diverifikasi"));
    assert.ok(approvedWa.body.message.includes("sedang diproses"));

    // Mencegah proses ganda pada pesanan yang sudah diverifikasi
    const reApprove = await req(
      `/admin/orders/${bcaOrderId}/verify-payment`,
      { action: "approve" },
      adminCookie,
    );
    assert.equal(reApprove.status, 409);
  });

  let danaOrderId = "";
  await t.test("6. Admin Menolak Pembayaran (Reject) dengan Alasan -> WA 3.D & Re-upload", async () => {
    // Buat pesanan kedua menggunakan E-Wallet DANA Manual
    const orderRes = await req(
      "/orders",
      {
        items: [{ id: productId, size: "180x200x30", color: "Emerald Gold", quantity: 1 }],
        payment: "EWALLET_DANA_MANUAL",
        shipping: "manual",
        shippingCost: 25000,
        checkoutKey: randomUUID(),
        address: {
          name: "Andi Saputra",
          email: "andi@linyjaya.test",
          phone: "081299998888",
          street: "Jl. Pengayoman No. 5",
          city: "Makassar",
          postal: "90222",
        },
      },
      customerCookie,
    );
    assert.equal(orderRes.status, 201);
    danaOrderId = orderRes.data.id;

    // Pelanggan konfirmasi pembayaran pertama kali
    await req(
      `/orders/${danaOrderId}/confirm-payment`,
      { proofData: sampleProofPng, note: "Transfer DANA" },
      customerCookie,
    );

    // Validasi penolakan tanpa alasan harus gagal
    const rejectWithoutReason = await req(
      `/admin/orders/${danaOrderId}/verify-payment`,
      { action: "reject", reason: "" },
      adminCookie,
    );
    assert.equal(rejectWithoutReason.status, 400);

    // Admin tolak dengan alasan jelas
    waSent.length = 0;
    const rejectionReason = "Nominal transfer sebesar Rp100.000 belum sesuai tagihan Rp275.000.";
    const rejectRes = await req(
      `/admin/orders/${danaOrderId}/verify-payment`,
      { action: "reject", reason: rejectionReason },
      adminCookie,
    );
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.data.payment_status, "REJECTED");
    assert.equal(rejectRes.data.payment_rejection_reason, rejectionReason);

    // Flush background outbox
    await req("/admin/whatsapp/flush", {}, adminCookie);

    // Verify Customer Rejection Notification 3.D
    const rejectWa = waSent.find((m) => m.body.phone === "6281299998888");
    assert.ok(rejectWa, "Notifikasi penolakan WA harus terkirim ke pelanggan");
    assert.ok(rejectWa.body.message.includes("belum dapat kami verifikasi"));
    assert.ok(rejectWa.body.message.includes(rejectionReason));
    assert.ok(rejectWa.body.message.includes("url_pesanan") === false, "Placeholder url_pesanan harus ter-render");

    // Pelanggan dapat mengunggah ulang bukti pembayaran yang benar
    const reuploadRes = await req(
      `/orders/${danaOrderId}/confirm-payment`,
      { proofData: sampleProofPng, note: "Sudah ditransfer sisa kekurangannya" },
      customerCookie,
    );
    assert.equal(reuploadRes.status, 200);
    assert.equal(reuploadRes.data.payment_status, "WAITING_VERIFICATION");
    assert.equal(reuploadRes.data.payment_rejection_reason, "");
  });

  await t.test("7. WhatsApp Failure Tidak Menggagalkan Pesanan / Pembayaran (Resilience)", async () => {
    waShouldFail = true; // Simulasi Wablas down / offline

    const orderRes = await req(
      "/orders",
      {
        items: [{ id: productId, size: "180x200x30", color: "Emerald Gold", quantity: 1 }],
        payment: "BANK_BCA_MANUAL",
        shipping: "manual",
        shippingCost: 25000,
        checkoutKey: randomUUID(),
        address: {
          name: "Rina Kusuma",
          email: "rina@linyjaya.test",
          phone: "081377776666",
          street: "Jl. Urip Sumoharjo",
          city: "Makassar",
          postal: "90111",
        },
      },
      customerCookie,
    );
    assert.equal(orderRes.status, 201, "Pembuatan pesanan harus tetap berhasil meski WA gateway down");

    const confirmRes = await req(
      `/orders/${orderRes.data.id}/confirm-payment`,
      { proofData: sampleProofPng },
      customerCookie,
    );
    assert.equal(confirmRes.status, 200, "Konfirmasi bayar harus tetap berhasil meski WA gateway down");
    assert.equal(confirmRes.data.payment_status, "WAITING_VERIFICATION");

    // Cek antrean outbox mencatat pesan pending
    const outboxRes = await req("/admin/whatsapp/outbox", undefined, adminCookie, "GET");
    assert.equal(outboxRes.status, 200);
    assert.ok(Array.isArray(outboxRes.data.outbox));
    assert.ok(outboxRes.data.outbox.length > 0);

    waShouldFail = false; // Pulihkan gateway
  });

  await t.test("8. Endpoint Admin WhatsApp Diagnostics (/test, /outbox, /flush)", async () => {
    const testSend = await req(
      "/admin/whatsapp/test",
      { phone: "081234567890", message: "Tes koneksi Wablas" },
      adminCookie,
    );
    assert.equal(testSend.status, 200, JSON.stringify(testSend.data));
    assert.equal(testSend.data.ok, true);

    const outbox = await req("/admin/whatsapp/outbox", undefined, adminCookie, "GET");
    assert.equal(outbox.status, 200);
    assert.ok(Array.isArray(outbox.data.outbox));

    const flush = await req("/admin/whatsapp/flush", {}, adminCookie);
    assert.equal(flush.status, 200);
    assert.equal(flush.data.ok, true);
  });
});

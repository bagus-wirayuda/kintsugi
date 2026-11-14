import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
import {
  SAMPLE_DANA_QRIS_PAYLOAD,
  assessQrisCompatibility,
  computeCrc16Ccitt,
  convertStaticQrisToDynamic,
  parseQris,
  parseTlv,
  serializeTlv,
  validateQrisPayload,
} from "../src/qris.js";

function decodeQrPngBuffer(buffer) {
  const png = PNG.sync.read(buffer);
  const clamped = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength);
  const decoded = jsQR(clamped, png.width, png.height);
  assert.ok(decoded && decoded.data, "QR PNG harus dapat dipindai dengan jsQR");
  return decoded.data;
}

function decodeQrDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  assert.ok(match, "QR data URL harus berformat image/png base64");
  return decodeQrPngBuffer(Buffer.from(match[1], "base64"));
}

test("Unit QRIS EMVCo TLV, CRC16, Konversi Dinamis & Pemindaian QR", async (t) => {
  await t.test("1. Parse TLV & Validasi CRC16 Payload Statis DANA Asli (BAGUS WIRAYUDA)", () => {
    const validation = validateQrisPayload(SAMPLE_DANA_QRIS_PAYLOAD);
    assert.equal(validation.valid, true, validation.errors.join("; "));
    const parsed = validation.parsed;
    assert.equal(parsed.formatIndicator, "01");
    assert.equal(parsed.pointOfInitiation, "11");
    assert.equal(parsed.isStatic, true);
    assert.equal(parsed.merchantName, "BAGUS WIRAYUDA");
    assert.equal(parsed.merchantCity, "Kab. Kolaka");
    assert.equal(parsed.postalCode, "93518");
    assert.equal(parsed.countryCode, "ID");
    assert.equal(parsed.currency, "360");
    assert.equal(parsed.mcc, "5499");
    assert.equal(parsed.provider, "DANA");
    assert.equal(parsed.merchantCriteria, "UMI");
    assert.equal(parsed.nmid, "ID1021080745719");
    assert.ok(parsed.acquirerDomains.includes("ID.DANA.WWW"));
    assert.ok(parsed.acquirerDomains.includes("ID.CO.QRIS.WWW"));
    assert.equal(parsed.actualCrc, "722D");
    assert.equal(parsed.crcValid, true);

    const compat = assessQrisCompatibility(parsed);
    assert.equal(compat.technicalReady, true);
    assert.equal(compat.isDana, true);
    assert.equal(compat.isUmi, true);
    assert.equal(compat.requiresFallback, true);
    assert.equal(compat.requiresLiveVerification, true);
  });

  await t.test("2. Konversi Dinamis Rp123.000 & Rp250.000 + Verifikasi Pemindaian Gambar QR", async () => {
    for (const amount of [123000, 250000]) {
      const converted = convertStaticQrisToDynamic(SAMPLE_DANA_QRIS_PAYLOAD, amount);
      const parsed = converted.parsed;
      assert.equal(parsed.pointOfInitiation, "12", "Tag 01 harus berubah menjadi 12 (dinamis)");
      assert.equal(parsed.amount, String(amount), `Tag 54 harus bernilai ${amount}`);
      assert.equal(parsed.crcValid, true, "Tag 63 CRC16 hasil konversi harus valid");
      assert.equal(parsed.merchantName, "BAGUS WIRAYUDA");
      assert.equal(parsed.merchantCity, "Kab. Kolaka");
      assert.equal(parsed.postalCode, "93518");
      assert.equal(parsed.provider, "DANA");

      // Pastikan seluruh panjang TLV valid dan CRC akhir cocok
      const recomputedCrc = computeCrc16Ccitt(converted.payload.slice(0, -4));
      assert.equal(converted.payload.slice(-4), recomputedCrc);

      // Generate PNG QR Code & pindai kembali memakai jsQR
      const pngBuffer = await QRCode.toBuffer(converted.payload, {
        type: "png",
        errorCorrectionLevel: "M",
        width: 320,
        margin: 2,
      });
      const scanned = decodeQrPngBuffer(pngBuffer);
      assert.equal(scanned, converted.payload, "Hasil scan QR Code harus identik dengan payload dinamis");
      const scannedParsed = parseQris(scanned);
      assert.equal(scannedParsed.amount, String(amount));
    }
  });

  await t.test("3. Tolak CRC Tidak Valid, TLV Rusak & Nominal Tidak Sah", () => {
    const tampered = SAMPLE_DANA_QRIS_PAYLOAD.slice(0, -4) + "FFFF";
    const invalidCheck = validateQrisPayload(tampered);
    assert.equal(invalidCheck.valid, false);
    assert.throws(() => convertStaticQrisToDynamic(tampered, 50000));
    assert.throws(() => parseTlv("00020101"));
    assert.throws(() => serializeTlv([]));
    assert.throws(() => convertStaticQrisToDynamic(SAMPLE_DANA_QRIS_PAYLOAD, 0));
    assert.throws(() => convertStaticQrisToDynamic(SAMPLE_DANA_QRIS_PAYLOAD, -1000));
    assert.throws(() => convertStaticQrisToDynamic(SAMPLE_DANA_QRIS_PAYLOAD, 12.5));
  });
});

test("Integrasi End-to-End QRIS Dinamis, Fallback Statis, Konfirmasi Bukti & Verifikasi Admin", async (t) => {
  const name = "liny_test_qris_" + Date.now();
  const root = await mysql.createConnection({
    ...databaseConfig(),
    database: undefined,
  });
  await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const db = createPool(name);

  let server;
  let adminCookie = "";
  let customerCookie = "";
  let xenditCalls = 0;
  const waSent = [];
  const uploadedFilesToClean = [];

  try {
    await initialize(db, true);

    server = createApp(db, {
      test: true,
      env: {
        NODE_ENV: "test",
        ADMIN_PHONE: "081111111111",
        APP_URL: "https://kintsugi.example.test",
        WABLAS_API_HOST: "https://smg.wablas.com",
        WABLAS_TOKEN: "test-token",
        WABLAS_SECRET_KEY: "test-secret",
      },
      gateway: {
        configured: false, // Pastikan QRIS manual tetap berjalan meski Xendit tidak dikonfigurasi
        sandbox: true,
        create: async () => {
          xenditCalls += 1;
          throw new Error("Xendit tidak boleh dipanggil untuk QRIS manual");
        },
        get: async () => {
          xenditCalls += 1;
          throw new Error("Xendit tidak boleh dipanggil untuk QRIS manual");
        },
      },
      waTransport: async (url, init) => {
        const parsed = JSON.parse(init.body || "{}");
        if (parsed.phone && parsed.message) {
          waSent.push(parsed);
        } else if (Array.isArray(parsed.data)) {
          waSent.push(...parsed.data);
        }
        return new Response(JSON.stringify({ status: true, data: { id: "wa-test" } }), { status: 200 });
      },
    }).listen(0, "127.0.0.1");

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

    const adminLogin = await req("/auth/login", {
      identifier: "admin@linyjaya.test",
      password: "AdminLinyJaya2026!",
    });
    assert.equal(adminLogin.status, 200);
    adminCookie = adminLogin.cookie;

    const custLogin = await req("/auth/login", {
      identifier: "pelanggan@linyjaya.test",
      password: "BelanjaLiny2026!",
    });
    assert.equal(custLogin.status, 200);
    customerCookie = custLogin.cookie;

    await t.test("1. Admin Inspeksi & Modifikasi Metode QRIS DANA Bawaan + Tambah Metode QRIS Lain", async () => {
      const inspectRes = await req(
        "/admin/qris/inspect",
        { payload: SAMPLE_DANA_QRIS_PAYLOAD, sampleAmount: 123000 },
        adminCookie,
        "POST",
      );
      assert.equal(inspectRes.status, 200);
      assert.equal(inspectRes.data.valid, true);
      assert.equal(inspectRes.data.parsed.merchantName, "BAGUS WIRAYUDA");
      assert.equal(inspectRes.data.parsed.provider, "DANA");
      assert.ok(inspectRes.data.sampleQrDataUrl.startsWith("data:image/png;base64,"));
      assert.equal(decodeQrDataUrl(inspectRes.data.sampleQrDataUrl), inspectRes.data.sampleDynamicPayload);

      // Edit metode sampel bawaan
      const patchRes = await req(
        "/admin/payment-methods/QRIS_DANA_MANUAL",
        {
          name: "QRIS DANA Toko (BAGUS WIRAYUDA)",
          detail: "Scan QRIS nominal otomatis DANA, lalu unggah bukti bayar.",
          qrisMode: "dynamic",
        },
        adminCookie,
        "PATCH",
      );
      assert.equal(patchRes.status, 200);

      // Tambah metode QRIS kedua dalam mode static fallback untuk menguji reusability & mode statis
      const addSecond = await req(
        "/admin/payment-methods",
        {
          name: "QRIS Statis Cadangan",
          group: "QRIS",
          paymentType: "qris_manual",
          qrisPayload: SAMPLE_DANA_QRIS_PAYLOAD,
          qrisMode: "static",
          detail: "Mode statis cadangan (input nominal manual)",
          enabled: true,
        },
        adminCookie,
        "POST",
      );
      assert.equal(addSecond.status, 201);
      assert.ok(addSecond.data.id.startsWith("QRIS_"));
    });

    let createdOrder;
    await t.test("2. Checkout Pelanggan Menggunakan QRIS Dinamis Menghitung Nominal Dari Backend & Scan Valid", async () => {
      const product = (await db.query("SELECT id, price FROM products LIMIT 1")).rows[0];
      const variant = (
        await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])
      ).rows[0];

      const orderRes = await req(
        "/orders",
        {
          items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 2 }],
          address: {
            name: "Siti Rahmawati",
            phone: "082233445566",
            email: "siti@example.test",
            street: "Jl. Sam Ratulangi No. 12",
            city: "Kolaka",
            postal: "93511",
          },
          shipping: "local",
          shippingOption: { courier: "TOKO", service: "Standar", cost: 15000 },
          payment: "QRIS_DANA_MANUAL",
          // Uji nilai total klien palsu tidak dipakai server
          total: 100,
          checkoutKey: "33333333-3333-4333-8333-333333333333",
        },
        customerCookie,
      );

      assert.equal(orderRes.status, 201);
      createdOrder = orderRes.data;
      assert.equal(createdOrder.payment_type, "qris_manual");
      assert.equal(createdOrder.payment_status, "PENDING");
      assert.equal(createdOrder.status, "Menunggu pembayaran");
      assert.equal(createdOrder.qris_mode, "dynamic");
      assert.equal(createdOrder.qris_merchant_name, "BAGUS WIRAYUDA");
      assert.equal(createdOrder.qris_provider, "DANA");
      assert.equal(createdOrder.invoice_id, null);
      assert.equal(xenditCalls, 0, "Tidak boleh memanggil Xendit gateway untuk QRIS manual");

      // Pastikan nominal di QRIS adalah total tervalidasi backend (bukan 100!)
      assert.ok(createdOrder.total > 15000);
      const parsedDynamic = parseQris(createdOrder.qris_payload);
      assert.equal(parsedDynamic.crcValid, true);
      assert.equal(parsedDynamic.pointOfInitiation, "12");
      assert.equal(parsedDynamic.amount, String(createdOrder.total));

      // Scan gambar QR Code dinamis dan fallback statis
      const scannedDynamic = decodeQrDataUrl(createdOrder.qrisQrDataUrl);
      assert.equal(scannedDynamic, createdOrder.qris_payload);
      const scannedStatic = decodeQrDataUrl(createdOrder.qrisStaticQrDataUrl);
      assert.equal(scannedStatic, SAMPLE_DANA_QRIS_PAYLOAD);
    });

    await t.test("3. Keamanan: Admin Dilarang Tandai Lunas / Dikirim Sebelum Pelanggan Unggah Bukti", async () => {
      const prematureShip = await req(
        `/admin/orders/${createdOrder.id}`,
        { status: "Dikirim", trackingNumber: "RESI001" },
        adminCookie,
        "PATCH",
      );
      assert.equal(prematureShip.status, 409);

      const prematureApprove = await req(
        `/admin/orders/${createdOrder.id}/verify-payment`,
        { action: "approve" },
        adminCookie,
        "POST",
      );
      assert.equal(prematureApprove.status, 409);
    });

    // Buat gambar PNG 1x1 valid untuk bukti transfer
    const sampleProofBase64 =
      "data:image/png;base64," +
      PNG.sync.write(new PNG({ width: 4, height: 4 })).toString("base64");

    await t.test("4. Pelanggan Unggah Bukti & Konfirmasi Pembayaran -> Menunggu Verifikasi + Notifikasi WA Admin", async () => {
      const confirmRes = await req(
        `/orders/${createdOrder.id}/confirm-payment`,
        {
          proofData: sampleProofBase64,
          note: "Transfer DANA a.n. Siti Rahmawati",
        },
        customerCookie,
      );

      assert.equal(confirmRes.status, 200);
      assert.equal(confirmRes.data.payment_status, "WAITING_VERIFICATION");
      assert.equal(confirmRes.data.status, "Menunggu pembayaran");
      assert.ok(confirmRes.data.payment_proof_url.startsWith("/uploads/proofs/"));
      uploadedFilesToClean.push(confirmRes.data.payment_proof_url);

      // Verifikasi notifikasi WhatsApp terkirim ke Admin (isi pesan + status sent di outbox)
      const adminWa = waSent.find(
        (m) => m.phone === "6281111111111" && m.message.includes(createdOrder.id),
      );
      assert.ok(adminWa, "Notifikasi WhatsApp harus dikirim ke Admin");
      assert.ok(adminWa.message.includes("Siti Rahmawati"));
      assert.ok(adminWa.message.includes("QRIS DANA Toko"));
      assert.ok(adminWa.message.includes(`Rp${Number(createdOrder.total).toLocaleString("id-ID")}`));
      assert.ok(adminWa.message.includes(`https://kintsugi.example.test/#admin/orders/${createdOrder.id}`));

      const outboxRows = (
        await db.query("SELECT id, phone, status, message FROM wa_outbox WHERE id LIKE ?", [`qris_confirm/${createdOrder.id}/%`])
      ).rows;
      assert.equal(outboxRows.length, 1);
      assert.equal(outboxRows[0].status, "sent");
    });

    await t.test("5. Admin Tolak & Setujui Verifikasi -> Status Baru Berubah Lunas Setelah Disetujui", async () => {
      // Admin reject terlebih dahulu
      const rejectRes = await req(
        `/admin/orders/${createdOrder.id}/verify-payment`,
        { action: "reject", reason: "Nominal belum terlihat pada tangkapan layar." },
        adminCookie,
      );
      assert.equal(rejectRes.status, 200);
      assert.ok(["REJECTED", "PENDING"].includes(rejectRes.data.payment_status));
      assert.equal(rejectRes.data.status, "Menunggu pembayaran");
      assert.equal(rejectRes.data.payment_rejection_reason, "Nominal belum terlihat pada tangkapan layar.");

      // Pelanggan unggah ulang bukti baru
      const reconfirmRes = await req(
        `/orders/${createdOrder.id}/confirm-payment`,
        { proofData: sampleProofBase64, note: "Bukti baru yang lebih jelas" },
        customerCookie,
      );
      assert.equal(reconfirmRes.status, 200);
      assert.equal(reconfirmRes.data.payment_status, "WAITING_VERIFICATION");
      uploadedFilesToClean.push(reconfirmRes.data.payment_proof_url);

      // Admin menyetujui transaksi setelah memeriksa mutasi DANA
      const approveRes = await req(
        `/admin/orders/${createdOrder.id}/verify-payment`,
        { action: "approve" },
        adminCookie,
      );
      assert.equal(approveRes.status, 200);
      assert.equal(approveRes.data.payment_status, "PAID");
      assert.equal(approveRes.data.status, "Diproses");
      assert.ok(approveRes.data.paid_at);
      assert.ok(approveRes.data.payment_verified_at);

      // Kini Admin diizinkan mengirim pesanan
      const shipRes = await req(
        `/admin/orders/${createdOrder.id}`,
        { status: "Dikirim", trackingNumber: "JNE123456789" },
        adminCookie,
        "PATCH",
      );
      assert.equal(shipRes.status, 200);
      assert.equal(xenditCalls, 0);
    });

    await t.test("6. Mode QRIS Statis Fallback & Pembatalan Pesanan QRIS Manual", async () => {
      const cfg = await req("/config", null, "", "GET");
      const staticMethod = cfg.data.paymentMethods.find((m) => m.qrisMode === "static");
      assert.ok(staticMethod);

      const product = (await db.query("SELECT id FROM products LIMIT 1")).rows[0];
      const variant = (
        await db.query("SELECT size, color FROM product_variants WHERE product_id=? LIMIT 1", [product.id])
      ).rows[0];

      const staticOrderRes = await req(
        "/orders",
        {
          items: [{ id: product.id, size: variant.size, color: variant.color, quantity: 1 }],
          address: {
            name: "BudiFallback",
            phone: "081234567890",
            email: "budi@example.test",
            street: "Jl. Jenderal Sudirman No. 10",
            city: "Kendari",
            postal: "93111",
          },
          shipping: "local",
          shippingOption: { courier: "TOKO", service: "Pengiriman Lokal Toko", cost: 25000 },
          payment: staticMethod.id,
          checkoutKey: "44444444-4444-4444-8444-444444444444",
        },
        customerCookie,
      );
      assert.equal(staticOrderRes.status, 201);
      assert.equal(staticOrderRes.data.qris_mode, "static_fallback");
      assert.equal(staticOrderRes.data.qris_payload, SAMPLE_DANA_QRIS_PAYLOAD);
      assert.equal(decodeQrDataUrl(staticOrderRes.data.qrisQrDataUrl), SAMPLE_DANA_QRIS_PAYLOAD);

      // Pelanggan membatalkan pesanan QRIS statis sebelum dibayar -> stok kembali, Xendit tidak dipanggil
      const cancelRes = await req(`/orders/${staticOrderRes.data.id}/cancel`, {}, customerCookie);
      assert.equal(cancelRes.status, 200);
      assert.equal(xenditCalls, 0);
    });
  } finally {
    if (server) server.close();
    await db.end();
    await root.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await root.end();
    for (const relUrl of uploadedFilesToClean) {
      const absPath = fileURLToPath(new URL(`../public${relUrl}`, import.meta.url));
      await unlink(absPath).catch(() => {});
    }
  }
});

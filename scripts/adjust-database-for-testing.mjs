import { pool } from "../server/db.js";
import { SAMPLE_DANA_QRIS_PAYLOAD } from "../src/qris.js";
import { convertStaticQrisToDynamic } from "../src/qris.js";
import { randomUUID } from "node:crypto";

async function adjustDatabase() {
  console.log("=== PENYESUAIAN DATABASE KINTSUGI UNTUK TESTING ===");

  // 1. Pengaturan Toko (Store Settings)
  console.log("1. Mengatur store_settings (Alamat toko, nomor WhatsApp, info pengambilan)...");
  const storeSettings = {
    brand: "Kintsugi Living & Fashion",
    contactEmail: "kintsugi@gmail.com",
    contactPhone: "081234567890",
    storeAddress: "Jl. Sam Ratulangi No. 88, Kemaraya, Kec. Kendari Barat, Kota Kendari, Sulawesi Tenggara 93111",
    pickupInfo: "Pengambilan pesanan tersedia setiap hari pukul 09.00 - 20.00 WITA di Toko Kintsugi Kendari. Tunjukkan nomor pesanan kepada petugas kasir saat mengambil pesanan dan melakukan pembayaran langsung di toko.",
    announcementText: "Koleksi tekstil & busana berkualitas untuk kenyamanan ruang hidup Anda.",
    logo: "/brand/kintsugi-logo-transparent-v2.png",
    localDeliveryFee: 15000,
    manualShippingFee: 25000,
  };

  for (const [key, val] of Object.entries(storeSettings)) {
    await pool.query(
      `INSERT INTO store_settings(setting_key, setting_value) VALUES(?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, JSON.stringify(val)]
    );
  }

  // 2. Metode Pembayaran (Store Payment Methods)
  console.log("2. Memastikan metode pembayaran QRIS Dinamis DANA, COD, dan Gateway aktif...");
  const methods = [
    {
      id: "QRIS_DANA_MANUAL",
      name: "QRIS (DANA - BAGUS WIRAYUDA)",
      group_name: "QRIS",
      payment_type: "qris_manual",
      qris_payload: SAMPLE_DANA_QRIS_PAYLOAD,
      qris_merchant_name: "BAGUS WIRAYUDA",
      qris_provider: "DANA",
      qris_mode: "dynamic",
      detail: "Scan QRIS nominal otomatis sesuai total belanja Anda. Setelah bayar di DANA / e-wallet, unggah bukti transfer untuk diverifikasi Admin.",
      enabled: 1,
      sort_order: 1,
    },
    {
      id: "COD",
      name: "Bayar di Tempat (COD)",
      group_name: "COD",
      payment_type: "cod",
      qris_payload: "",
      qris_merchant_name: "",
      qris_provider: "",
      qris_mode: "dynamic",
      detail: "Bayar tunai langsung kepada kurir saat pesanan sampai di alamat Anda.",
      enabled: 1,
      sort_order: 2,
    },
    {
      id: "BCA_VA",
      name: "BCA Virtual Account",
      group_name: "Bank",
      payment_type: "gateway",
      qris_payload: "",
      qris_merchant_name: "",
      qris_provider: "",
      qris_mode: "dynamic",
      detail: "Transfer dari ATM BCA, BCA Mobile, atau KlikBCA melalui nomor Virtual Account.",
      enabled: 1,
      sort_order: 3,
    },
    {
      id: "MANDIRI_VA",
      name: "Mandiri Virtual Account",
      group_name: "Bank",
      payment_type: "gateway",
      qris_payload: "",
      qris_merchant_name: "",
      qris_provider: "",
      qris_mode: "dynamic",
      detail: "Transfer melalui Livin' by Mandiri, ATM Mandiri, atau Internet Banking.",
      enabled: 1,
      sort_order: 4,
    },
    {
      id: "EWALLET_XENDIT",
      name: "E-Wallet (GoPay, OVO, ShopeePay)",
      group_name: "E-Wallet",
      payment_type: "gateway",
      qris_payload: "",
      qris_merchant_name: "",
      qris_provider: "",
      qris_mode: "dynamic",
      detail: "Bayar langsung menggunakan aplikasi dompet digital pilihan Anda.",
      enabled: 1,
      sort_order: 5,
    },
  ];

  for (const m of methods) {
    await pool.query(
      `INSERT INTO store_payment_methods(id, name, group_name, payment_type, qris_payload, qris_merchant_name, qris_provider, qris_mode, detail, enabled, sort_order)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name),
         group_name=VALUES(group_name),
         payment_type=VALUES(payment_type),
         qris_payload=VALUES(qris_payload),
         qris_merchant_name=VALUES(qris_merchant_name),
         qris_provider=VALUES(qris_provider),
         qris_mode=VALUES(qris_mode),
         detail=VALUES(detail),
         enabled=VALUES(enabled),
         sort_order=VALUES(sort_order)`,
      [m.id, m.name, m.group_name, m.payment_type, m.qris_payload, m.qris_merchant_name, m.qris_provider, m.qris_mode, m.detail, m.enabled, m.sort_order]
    );
  }

  // 3. Gambar Varian Produk Dinamis & Multi-Gambar Galeri
  console.log("3. Menghubungkan gambar variasi warna dan galeri foto ke product_variants...");
  
  // Mapping gambar warna Bedding
  function getBeddingVariantImage(color, productBaseImage) {
    const c = String(color || "").toLowerCase();
    if (c.includes("biru") || c.includes("navy") || c.includes("teal")) {
      return { main: "/images/seprai/sprei-02.jpg", gallery: ["/images/seprai/sprei-02.jpg", "/images/seprai/sprei-11.jpg"] };
    }
    if (c.includes("hijau") || c.includes("mint") || c.includes("sage")) {
      return { main: "/images/seprai/sprei-03.jpg", gallery: ["/images/seprai/sprei-03.jpg", "/images/seprai/sprei-12.jpg"] };
    }
    if (c.includes("putih") || c.includes("krem") || c.includes("champagne") || c.includes("awan") || c.includes("ivory")) {
      return { main: "/images/seprai/sprei-04.jpg", gallery: ["/images/seprai/sprei-04.jpg", "/images/seprai/sprei-13.jpg"] };
    }
    if (c.includes("abu") || c.includes("charcoal") || c.includes("batu") || c.includes("oatmeal")) {
      return { main: "/images/seprai/sprei-05.jpg", gallery: ["/images/seprai/sprei-05.jpg", "/images/seprai/sprei-14.jpg"] };
    }
    if (c.includes("pink") || c.includes("rose")) {
      return { main: "/images/seprai/sprei-06.jpg", gallery: ["/images/seprai/sprei-06.jpg", "/images/seprai/sprei-15.jpg"] };
    }
    if (c.includes("kuning") || c.includes("terracotta") || c.includes("mocha")) {
      return { main: "/images/seprai/sprei-01.jpg", gallery: ["/images/seprai/sprei-01.jpg", "/images/seprai/sprei-10.jpg"] };
    }
    return { main: productBaseImage || "/images/seprai/sprei-01.jpg", gallery: [productBaseImage || "/images/seprai/sprei-01.jpg"] };
  }

  // Mapping gambar warna Fashion berdasarkan subkategori
  function getFashionVariantImage(subcategory, color, productBaseImage) {
    const sub = String(subcategory || "").toLowerCase();
    const c = String(color || "").toLowerCase();

    if (sub.includes("celana")) {
      if (c.includes("hitam") || c.includes("washed")) return { main: "/images/fashion/fsh-celana-01.jpg", gallery: ["/images/fashion/fsh-celana-01.jpg"] };
      if (c.includes("khaki") || c.includes("cokelat")) return { main: "/images/fashion/fsh-celana-02.jpg", gallery: ["/images/fashion/fsh-celana-02.jpg"] };
      if (c.includes("navy") || c.includes("indigo") || c.includes("biru")) return { main: "/images/fashion/fsh-celana-03.jpg", gallery: ["/images/fashion/fsh-celana-03.jpg"] };
      if (c.includes("abu")) return { main: "/images/fashion/fsh-celana-04.jpg", gallery: ["/images/fashion/fsh-celana-04.jpg"] };
      return { main: "/images/fashion/fsh-celana-05.jpg", gallery: ["/images/fashion/fsh-celana-05.jpg"] };
    }
    if (sub.includes("dress")) {
      if (c.includes("hijau") || c.includes("emerald")) return { main: "/images/fashion/fsh-dress-01.jpg", gallery: ["/images/fashion/fsh-dress-01.jpg"] };
      if (c.includes("terracotta") || c.includes("maroon") || c.includes("rose")) return { main: "/images/fashion/fsh-dress-02.jpg", gallery: ["/images/fashion/fsh-dress-02.jpg"] };
      if (c.includes("navy") || c.includes("hitam")) return { main: "/images/fashion/fsh-dress-03.jpg", gallery: ["/images/fashion/fsh-dress-03.jpg"] };
      if (c.includes("pink") || c.includes("lilac")) return { main: "/images/fashion/fsh-dress-04.jpg", gallery: ["/images/fashion/fsh-dress-04.jpg"] };
      return { main: "/images/fashion/fsh-dress-05.jpg", gallery: ["/images/fashion/fsh-dress-05.jpg"] };
    }
    if (sub.includes("kaos")) {
      if (c.includes("hitam")) return { main: "/images/fashion/fsh-kaos-01.jpg", gallery: ["/images/fashion/fsh-kaos-01.jpg"] };
      if (c.includes("putih") || c.includes("krem")) return { main: "/images/fashion/fsh-kaos-02.jpg", gallery: ["/images/fashion/fsh-kaos-02.jpg"] };
      if (c.includes("navy") || c.includes("biru")) return { main: "/images/fashion/fsh-kaos-03.jpg", gallery: ["/images/fashion/fsh-kaos-03.jpg"] };
      if (c.includes("sage") || c.includes("hijau") || c.includes("olive")) return { main: "/images/fashion/fsh-kaos-04.jpg", gallery: ["/images/fashion/fsh-kaos-04.jpg"] };
      return { main: "/images/fashion/fsh-kaos-05.jpg", gallery: ["/images/fashion/fsh-kaos-05.jpg"] };
    }
    if (sub.includes("kemeja")) {
      if (c.includes("putih")) return { main: "/images/fashion/fsh-kemeja-01.jpg", gallery: ["/images/fashion/fsh-kemeja-01.jpg"] };
      if (c.includes("biru") || c.includes("navy")) return { main: "/images/fashion/fsh-kemeja-02.jpg", gallery: ["/images/fashion/fsh-kemeja-02.jpg"] };
      if (c.includes("sage") || c.includes("hijau")) return { main: "/images/fashion/fsh-kemeja-03.jpg", gallery: ["/images/fashion/fsh-kemeja-03.jpg"] };
      if (c.includes("hitam")) return { main: "/images/fashion/fsh-kemeja-04.jpg", gallery: ["/images/fashion/fsh-kemeja-04.jpg"] };
      return { main: "/images/fashion/fsh-kemeja-05.jpg", gallery: ["/images/fashion/fsh-kemeja-05.jpg"] };
    }
    if (sub.includes("lounge")) {
      if (c.includes("navy") || c.includes("biru")) return { main: "/images/fashion/fsh-lounge-01.jpg", gallery: ["/images/fashion/fsh-lounge-01.jpg"] };
      if (c.includes("sage") || c.includes("hijau")) return { main: "/images/fashion/fsh-lounge-02.jpg", gallery: ["/images/fashion/fsh-lounge-02.jpg"] };
      if (c.includes("pink") || c.includes("rose")) return { main: "/images/fashion/fsh-lounge-03.jpg", gallery: ["/images/fashion/fsh-lounge-03.jpg"] };
      if (c.includes("abu")) return { main: "/images/fashion/fsh-lounge-04.jpg", gallery: ["/images/fashion/fsh-lounge-04.jpg"] };
      return { main: "/images/fashion/fsh-lounge-05.jpg", gallery: ["/images/fashion/fsh-lounge-05.jpg"] };
    }
    if (sub.includes("outer")) {
      if (c.includes("hitam")) return { main: "/images/fashion/fsh-outer-01.jpg", gallery: ["/images/fashion/fsh-outer-01.jpg"] };
      if (c.includes("army") || c.includes("hijau") || c.includes("olive")) return { main: "/images/fashion/fsh-outer-02.jpg", gallery: ["/images/fashion/fsh-outer-02.jpg"] };
      if (c.includes("khaki") || c.includes("cokelat") || c.includes("tan")) return { main: "/images/fashion/fsh-outer-03.jpg", gallery: ["/images/fashion/fsh-outer-03.jpg"] };
      if (c.includes("navy") || c.includes("biru")) return { main: "/images/fashion/fsh-outer-04.jpg", gallery: ["/images/fashion/fsh-outer-04.jpg"] };
      return { main: "/images/fashion/fsh-outer-05.jpg", gallery: ["/images/fashion/fsh-outer-05.jpg"] };
    }
    return { main: productBaseImage, gallery: [productBaseImage] };
  }

  const allVariants = (await pool.query(`
    SELECT v.id, v.product_id, v.size, v.color, p.category, p.subcategory, p.image, p.price as base_price
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
  `)).rows;

  let updatedCount = 0;
  for (const v of allVariants) {
    let imgData;
    if (v.category === "fashion") {
      imgData = getFashionVariantImage(v.subcategory, v.color, v.image);
    } else {
      imgData = getBeddingVariantImage(v.color, v.image);
    }

    // Variasi harga khusus untuk ukuran besar (Bedding King/180/200 atau Fashion XXL)
    let customPrice = null;
    const s = String(v.size || "");
    if (s.includes("180×200") || s.includes("King")) {
      customPrice = Number(v.base_price) + 25000;
    } else if (s.includes("200×200") || s.includes("200×220")) {
      customPrice = Number(v.base_price) + 45000;
    } else if (s.includes("XXL") || s === "36") {
      customPrice = Number(v.base_price) + 15000;
    }

    await pool.query(
      `UPDATE product_variants
       SET image_url = ?,
           images_json = ?,
           price = ?,
           stock = GREATEST(stock, 25)
       WHERE id = ?`,
      [imgData.main, JSON.stringify(imgData.gallery), customPrice, v.id]
    );
    updatedCount++;
  }
  console.log(`-> Berhasil memperbarui ${updatedCount} varian dengan gambar dan harga dinamis.`);

  // 4. Profil Pelanggan Demo (customer_profiles)
  console.log("4. Mengisi customer_profiles untuk akun demo agar checkout prefilled...");
  const custUsers = (await pool.query("SELECT id FROM users WHERE email='pelanggan@linyjaya.test'")).rows[0];
  if (custUsers) {
    await pool.query(
      `INSERT INTO customer_profiles(user_id, phone, street, city, postal)
       VALUES(?, '081299990000', 'Jl. Merpati Putih No. 12 RT 02 RW 05', 'Kota Kendari', '93111')
       ON DUPLICATE KEY UPDATE
         phone=VALUES(phone),
         street=VALUES(street),
         city=VALUES(city),
         postal=VALUES(postal)`,
      [custUsers.id]
    );
  }

  // 5. Sampel Pesanan Siap Uji (Orders for Live Testing)
  console.log("5. Menyiapkan sampel pesanan untuk pengujian fitur Admin & Pelanggan...");
  
  // A. Pesanan Store Pickup (Menunggu Pengambilan & Pembayaran di Toko)
  const pickupOrderId = "LJ-TEST-PICKUP-01";
  const pickupTotal = 275000;
  await pool.query(`DELETE FROM order_items WHERE order_id IN ('${pickupOrderId}', 'LJ-TEST-QRIS-02', 'LJ-TEST-COD-03')`);
  await pool.query(`DELETE FROM orders WHERE id IN ('${pickupOrderId}', 'LJ-TEST-QRIS-02', 'LJ-TEST-COD-03')`);

  const sampleProd1 = (await pool.query("SELECT id, name, price FROM products WHERE category='fashion' LIMIT 1")).rows[0];
  const sampleVar1 = (await pool.query("SELECT id, size, color FROM product_variants WHERE product_id=? LIMIT 1", [sampleProd1.id])).rows[0];

  await pool.query(
    `INSERT INTO orders(id, user_id, address, shipping, shipping_name, payment, payment_type, payment_method_name, subtotal, discount, delivery, total, status, payment_status, checkout_key, created_at)
     VALUES(?, ?, ?, 'pickup', 'Ambil Langsung di Toko', 'store_pickup', 'store_pickup', 'Bayar di Toko (Store Pickup)', ?, 0, 0, ?, 'Menunggu Pengambilan & Pembayaran', 'PENDING', ?, UTC_TIMESTAMP(3))`,
    [
      pickupOrderId,
      custUsers?.id || "demo-user",
      JSON.stringify({
        name: "Siti Rahma",
        phone: "081299112233",
        email: "siti.rahma@linyjaya.test",
        street: "Ambil Langsung di Toko Fisik",
        city: "Kendari",
        postal: "93111",
      }),
      pickupTotal,
      pickupTotal,
      randomUUID(),
    ]
  );
  await pool.query(
    `INSERT INTO order_items(id, order_id, product_id, variant_id, name, image, size, length_cm, width_cm, height_cm, variation_label, color, quantity, price, cost_price)
     VALUES(?, ?, ?, ?, ?, '/images/fashion/fsh-kemeja-01.jpg', ?, 0, 0, 0, 'Warna', ?, 1, ?, 120000)`,
    [randomUUID(), pickupOrderId, sampleProd1.id, sampleVar1.id, sampleProd1.name, sampleVar1.size, sampleVar1.color, pickupTotal]
  );

  // B. Pesanan QRIS Dinamis Menunggu Verifikasi Pembayaran (Admin Verification)
  const qrisOrderId = "LJ-TEST-QRIS-02";
  const qrisTotal = 315000;
  const convertedQris = convertStaticQrisToDynamic(SAMPLE_DANA_QRIS_PAYLOAD, qrisTotal);
  await pool.query(
    `INSERT INTO orders(id, user_id, address, shipping, shipping_name, payment, payment_type, payment_method_name, subtotal, discount, delivery, total, status, payment_status, qris_mode, qris_payload, qris_merchant_name, qris_provider, payment_proof_url, payment_proof_note, payment_submitted_at, checkout_key, created_at)
     VALUES(?, ?, ?, 'local', 'Pengiriman Standar Kurir Toko', 'QRIS_DANA_MANUAL', 'qris_manual', 'QRIS (DANA - BAGUS WIRAYUDA)', 290000, 0, 25000, ?, 'Menunggu pembayaran', 'WAITING_VERIFICATION', 'dynamic', ?, 'BAGUS WIRAYUDA', 'DANA', '/images/seprai/sprei-01.jpg', 'Sudah transfer DANA Rp315.000 a.n. Siti Rahmawati', UTC_TIMESTAMP(3), ?, UTC_TIMESTAMP(3))`,
    [
      qrisOrderId,
      custUsers?.id || "demo-user",
      JSON.stringify({
        name: "Budi Santoso",
        phone: "081233445566",
        email: "budi.santoso@linyjaya.test",
        street: "Jl. Jenderal Sudirman No. 45 RT 03 RW 02",
        city: "Kendari",
        postal: "93111",
      }),
      qrisTotal,
      convertedQris.payload,
      randomUUID(),
    ]
  );
  await pool.query(
    `INSERT INTO order_items(id, order_id, product_id, variant_id, name, image, size, length_cm, width_cm, height_cm, variation_label, color, quantity, price, cost_price)
     VALUES(?, ?, ?, ?, 'Sprei Aesthetic Motif Kotak Minimalis', '/images/seprai/sprei-02.jpg', '160×200×30', 160, 200, 30, 'Warna', 'Biru Kabut', 1, 290000, 150000)`,
    [randomUUID(), qrisOrderId, "lj-1-1", "lj-1-1-var-1"]
  );

  // C. Pesanan COD yang Sedang Diproses (Ready for Dispatch)
  const codOrderId = "LJ-TEST-COD-03";
  const codTotal = 185000;
  await pool.query(
    `INSERT INTO orders(id, user_id, address, shipping, shipping_name, payment, payment_type, payment_method_name, subtotal, discount, delivery, total, status, payment_status, checkout_key, created_at)
     VALUES(?, ?, ?, 'local', 'Pengiriman Standar Kurir Toko', 'COD', 'cod', 'Bayar di Tempat (COD)', 160000, 0, 25000, ?, 'Diproses', 'PENDING', ?, UTC_TIMESTAMP(3))`,
    [
      codOrderId,
      custUsers?.id || "demo-user",
      JSON.stringify({
        name: "Ahmad Fauzi",
        phone: "081388776655",
        email: "ahmad.fauzi@linyjaya.test",
        street: "Jl. MT Haryono No. 10",
        city: "Kendari",
        postal: "93111",
      }),
      codTotal,
      randomUUID(),
    ]
  );
  await pool.query(
    `INSERT INTO order_items(id, order_id, product_id, variant_id, name, image, size, length_cm, width_cm, height_cm, variation_label, color, quantity, price, cost_price)
     VALUES(?, ?, ?, ?, 'Kaos Polos Katun Combed 30s Premium', '/images/fashion/fsh-kaos-01.jpg', 'L', 0, 0, 0, 'Warna', 'Hitam', 2, 80000, 45000)`,
    [randomUUID(), codOrderId, "lj-fsh-kaos-1", "lj-fsh-kaos-1-var-1"]
  );

  console.log("-> Sampel pesanan live testing berhasil ditambahkan:");
  console.log(`   * ${pickupOrderId}: Status "Menunggu Pengambilan & Pembayaran" (Store Pickup)`);
  console.log(`   * ${qrisOrderId}: Status "Menunggu pembayaran" / WAITING_VERIFICATION (QRIS Dinamis Rp315.000)`);
  console.log(`   * ${codOrderId}: Status "Diproses" (COD Kurir Lokal)`);

  console.log("\n=== DATABASE KINTSUGI BERHASIL DISESUAIKAN SECARA KESELURUHAN ===");
  await pool.end();
}

adjustDatabase().catch((err) => {
  console.error("Gagal menyesuaikan database:", err);
  process.exitCode = 1;
});

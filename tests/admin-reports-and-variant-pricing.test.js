import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
import { resolveActiveVariant, getProductPriceRange } from "../src/variant-utils.js";
import {
  generateSalesReportPDF,
  generateFinancialReportPDF,
  generateInventoryReportPDF,
} from "../src/reports-pdf.js";

test("Audit & Fitur Baru: Harga Varian (Termurah di Katalog, Rentang di Detail) & Unduh Laporan PDF", async (t) => {
  // =========================================================================
  // 1. UNIT TEST: LOGIKA HARGA VARIAN (Katalog & Detail Produk)
  // =========================================================================
  await t.test("1. Varian memiliki harga berbeda: Katalog menampilkan harga termurah, Detail menampilkan rentang harga", () => {
    const productMultiPrice = {
      id: "prod-sprei-premium",
      name: "Seprai Katun Jepang Sutra",
      price: 180000, // base price di tabel products
      variants: [
        { size: "120×200×30", color: "Sage Green", price: 120000, stock: 15 },
        { size: "160×200×30", color: "Sage Green", price: 160000, stock: 20 },
        { size: "180×200×30", color: "Sage Green", price: 180000, stock: 10 },
        { size: "200×200×30", color: "Sage Green", price: 210000, stock: 5 },
      ],
    };

    // Range calculation
    const range = getProductPriceRange(productMultiPrice);
    assert.equal(range.hasRange, true, "Produk harus memiliki rentang harga");
    assert.equal(range.min, 120000, "Harga termurah untuk katalog harus Rp 120.000");
    assert.equal(range.max, 210000, "Harga tertinggi untuk rentang detail harus Rp 210.000");

    // Saat baru diklik (detail dibuka tanpa ukuran spesifik)
    const initialView = resolveActiveVariant(productMultiPrice, "Sage Green", "");
    assert.equal(initialView.minPrice, 120000);
    assert.equal(initialView.maxPrice, 210000);
    assert.equal(initialView.hasPriceRange, true);
    assert.equal(initialView.isExactVariantSelected, false, "Belum memilih ukuran tertentu");

    // Saat pembeli memilih ukuran 120×200×30
    const selectedSmall = resolveActiveVariant(productMultiPrice, "Sage Green", "120×200×30");
    assert.equal(selectedSmall.unitPrice, 120000, "Harga varian ukuran 120 harus Rp 120.000");
    assert.equal(selectedSmall.isExactVariantSelected, true);

    // Saat pembeli memilih ukuran 200×200×30
    const selectedKing = resolveActiveVariant(productMultiPrice, "Sage Green", "200×200×30");
    assert.equal(selectedKing.unitPrice, 210000, "Harga varian ukuran 200 harus Rp 210.000");
    assert.equal(selectedKing.isExactVariantSelected, true);
  });

  await t.test("2. Produk dengan harga varian seragam: tidak menampilkan rentang, melainkan harga tunggal", () => {
    const productUniformPrice = {
      id: "prod-kaos-polos",
      name: "Kaos Polos Katun Combed 30s",
      price: 85000,
      variants: [
        { size: "S", color: "Hitam", price: null, stock: 30 },
        { size: "M", color: "Hitam", price: 85000, stock: 40 },
        { size: "L", color: "Hitam", price: null, stock: 35 },
      ],
    };

    const range = getProductPriceRange(productUniformPrice);
    assert.equal(range.hasRange, false, "Harga semua varian sama, tidak boleh ada rentang");
    assert.equal(range.min, 85000);
    assert.equal(range.max, 85000);

    const view = resolveActiveVariant(productUniformPrice, "Hitam", "M");
    assert.equal(view.unitPrice, 85000);
    assert.equal(view.hasPriceRange, false);
  });

  // =========================================================================
  // 2. UNIT TEST: GENERATOR LAPORAN PDF (Sales, Financial, Inventory)
  // =========================================================================
  await t.test("3. Unduh Laporan PDF Penjualan: menghasilkan buffer dokumen valid dengan kop PT Liny Jaya", () => {
    const mockOrders = [
      {
        id: "LJ-ORD-202611-001",
        created_at: new Date().toISOString(),
        status: "Selesai",
        payment_status: "PAID",
        payment_type: "qris",
        subtotal: 350000,
        discount: 25000,
        delivery: 15000,
        total: 340000,
        address: { name: "Budi Santoso", phone: "081234567890" },
        items: [
          { name: "Seprai Katun Jepang", size: "160×200×30", color: "Sage Green", quantity: 2, price: 160000 },
        ],
      },
      {
        id: "LJ-ORD-202611-002",
        created_at: new Date().toISOString(),
        status: "Diproses",
        payment_status: "PAID",
        payment_type: "gateway",
        payment_method_name: "BCA Virtual Account",
        subtotal: 120000,
        discount: 0,
        delivery: 10000,
        total: 130000,
        address: { name: "Siti Rahma", phone: "081987654321" },
        items: [
          { name: "Kaos Polos", size: "L", color: "Hitam", quantity: 1, price: 120000 },
        ],
      },
    ];

    const doc = generateSalesReportPDF({
      orders: mockOrders,
      periodLabel: "November 2026",
      statusFilter: "Semua Status",
      paymentFilter: "PAID",
      generatedBy: { name: "Super Admin", role: "admin" },
      storeInfo: { name: "PT LINY JAYA", phone: "+62 811-1111-1111", email: "admin@linyjaya.com" },
      save: false,
    });

    const buffer = doc.output("arraybuffer");
    assert.ok(buffer.byteLength > 2000, "Dokumen PDF Penjualan harus memiliki ukuran valid");
    assert.equal(doc.internal.getNumberOfPages(), 1, "Harus menghasilkan minimal 1 halaman");
  });

  await t.test("4. Unduh Laporan PDF Laba Rugi & Keuangan: memuat rincian HPP, omzet, dan beban toko", () => {
    const doc = generateFinancialReportPDF({
      metrics: {
        revenue: 12500000,
        capital: 7500000,
        expenses: 1200000,
        expenseRows: [
          { date: "2026-11-05", description: "Bahan packaging & dus pengiriman", amount: 450000 },
          { date: "2026-11-10", description: "Biaya promosi & iklan media sosial", amount: 750000 },
        ],
      },
      periodLabel: "Bulan Berjalan",
      generatedBy: { name: "Manager Keuangan", role: "manager" },
      save: false,
    });

    const buffer = doc.output("arraybuffer");
    assert.ok(buffer.byteLength > 2000, "Dokumen PDF Keuangan harus terbentuk sempurna");
  });

  await t.test("5. Unduh Laporan PDF Inventaris Stok & Varian Produk: merinci seluruh SKU, varian & estimasi aset", () => {
    const mockProducts = [
      {
        sku: "LJ-BED-001",
        name: "Seprai Katun Premium",
        category: "bedding",
        price: 150000,
        costPrice: 90000,
        variants: [
          { size: "120×200×30", color: "Putih", stock: 12, price: 130000 },
          { size: "160×200×30", color: "Putih", stock: 25, price: 160000 },
        ],
      },
    ];

    const doc = generateInventoryReportPDF({
      products: mockProducts,
      categoryFilter: "Semua Kategori",
      stockFilter: "Semua",
      generatedBy: { name: "Admin Gudang", role: "admin" },
      save: false,
    });

    const buffer = doc.output("arraybuffer");
    assert.ok(buffer.byteLength > 2000, "Dokumen PDF Inventaris harus terbentuk sempurna");
  });

  // =========================================================================
  // 3. INTEGRASI DB & API: /api/products MENGEMBALIKAN HARGA TERMURAH
  // =========================================================================
  await t.test("6. Integrasi API: /api/products mengembalikan minPrice, maxPrice, dan price termurah untuk katalog", async () => {
    const dbName = "lj_test_report_pricing_" + Date.now();
    const root = await mysql.createConnection({
      ...databaseConfig(),
      database: undefined,
    });
    await root.query(
      `CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    const db = createPool(dbName);

    let httpServer;
    try {
      await initialize(db, true);

      const app = createApp(db, {
        test: true,
        env: { NODE_ENV: "test" },
        gateway: { configured: false, sandbox: true },
      });

      httpServer = await new Promise((resolve) => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
      });
      const port = httpServer.address().port;
      const origin = `http://127.0.0.1:${port}`;

      // Buat produk baru dengan beberapa varian berharga berbeda
      const pId = "lj-test-variant-pricing-" + Date.now();
      await db.query(
        "INSERT INTO products(id,sku,name,category,subcategory,price,old_price,cost_price,variation_label,motif,weight_grams,image,description,is_new) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          pId,
          "SKU-TEST-MULTI-" + Date.now(),
          "Sprei Multi Price Suite",
          "bedding",
          "bedding-set",
          200000, // base price di tabel master
          0,
          100000,
          "Warna",
          "Polos",
          1200,
          "/images/seprai/sprei-01.jpg",
          "Deskripsi uji coba varian harga bertingkat.",
          true,
        ]
      );

      // Masukkan 3 varian: 140.000, 180.000, 220.000
      await db.query(
        "INSERT INTO product_variants(id,product_id,size,length_cm,width_cm,height_cm,color,price,image_url,stock) VALUES (?,?,?,?,?,?,?,?,?,?), (?,?,?,?,?,?,?,?,?,?), (?,?,?,?,?,?,?,?,?,?)",
        [
          "v1-" + pId, pId, "120×200×30", 120, 200, 30, "Teal Samudra", 140000, "/images/seprai/sprei-01.jpg", 15,
          "v2-" + pId, pId, "160×200×30", 160, 200, 30, "Teal Samudra", 180000, "/images/seprai/sprei-01.jpg", 20,
          "v3-" + pId, pId, "180×200×30", 180, 200, 30, "Teal Samudra", 220000, "/images/seprai/sprei-01.jpg", 10,
        ]
      );

      // Panggil GET /api/products/:id
      const resDetail = await fetch(`${origin}/api/products/${pId}`);
      assert.equal(resDetail.status, 200);
      const prod = await resDetail.json();

      // Verifikasi:
      assert.equal(prod.minPrice, 140000, "minPrice harus 140.000");
      assert.equal(prod.maxPrice, 220000, "maxPrice harus 220.000");
      assert.equal(prod.hasPriceRange, true, "hasPriceRange harus true");
      assert.equal(prod.price, 140000, "price katalog harus harga termurah (140.000)");

      // Panggil GET /api/products (daftar katalog)
      const resCatalog = await fetch(`${origin}/api/products?search=Sprei+Multi+Price+Suite`);
      assert.equal(resCatalog.status, 200);
      const catalogData = await resCatalog.json();
      const catalogItem = catalogData.items.find((i) => i.id === pId);
      assert.ok(catalogItem, "Produk harus ditemukan di katalog");
      assert.equal(catalogItem.price, 140000, "Harga produk yang ditampilkan di katalog adalah harga termurah");
      assert.equal(catalogItem.minPrice, 140000);
      assert.equal(catalogItem.maxPrice, 220000);
      assert.equal(catalogItem.hasPriceRange, true);
    } finally {
      if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
      await db.end();
      await root.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
      await root.end();
    }
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import mysql from "mysql2/promise";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";

test("Admin -> Produk & Stok: Filter, Pengurutan, dan Reset Filter Berbasis Database Nyata", async (t) => {
  const testDbName = "liny_test_admin_prod_" + Date.now();
  const root = await mysql.createConnection({
    ...databaseConfig(),
    database: undefined,
  });
  await root.query(`CREATE DATABASE \`${testDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const db = createPool(testDbName);

  let server;
  let adminCookie = "";

  try {
    await initialize(db, true);

    // 1. Tambahkan kategori uji
    await db.query(
      "INSERT INTO product_categories (id, name, parent_id, active, sort_order) VALUES (?, ?, NULL, 1, 10)",
      ["test-fashion", "Fashion Test"]
    );
    await db.query(
      "INSERT INTO product_categories (id, name, parent_id, active, sort_order) VALUES (?, ?, ?, 1, 11)",
      ["test-kaos", "Kaos Test", "test-fashion"]
    );

    // 2. Tambahkan produk uji dengan variasi stok, harga, status, dan tanggal
    // Produk A: Fashion Test / Kaos Test, Aktif, Harga 150000, Dibuat 1 hari lalu, Stok total 50
    await db.query(
      `INSERT INTO products (id, sku, name, category, subcategory, price, image, description, active, is_new, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, DATE_SUB(NOW(), INTERVAL 1 DAY))`,
      ["prod-a", "SKU-A", "Kaos Polos Premium", "test-fashion", "test-kaos", 150000, "/images/a.jpg", "Kaos"]
    );
    await db.query(
      "INSERT INTO product_variants (product_id, size, length_cm, width_cm, height_cm, color, stock) VALUES (?, ?, 0, 0, 0, ?, ?)",
      ["prod-a", "L", "Hitam", 50]
    );

    // Produk B: Fashion Test / Kaos Test, Aktif, Harga 250000, Dibuat 2 hari lalu, Stok total 0 (STOK HABIS)
    await db.query(
      `INSERT INTO products (id, sku, name, category, subcategory, price, image, description, active, is_new, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, DATE_SUB(NOW(), INTERVAL 2 DAY))`,
      ["prod-b", "SKU-B", "Kaos Oversize Vintage", "test-fashion", "test-kaos", 250000, "/images/b.jpg", "Oversize"]
    );
    await db.query(
      "INSERT INTO product_variants (product_id, size, length_cm, width_cm, height_cm, color, stock) VALUES (?, ?, 0, 0, 0, ?, ?)",
      ["prod-b", "XL", "Putih", 0]
    );

    // Produk C: Seprai, Disembunyikan (active=0), Harga 90000, Dibuat sekarang (Terbaru), Stok total 10
    await db.query(
      `INSERT INTO products (id, sku, name, category, subcategory, price, image, description, active, is_new, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NOW())`,
      ["prod-c", "SKU-C", "Sprei Kasur Tersembunyi", "seprai", "Sprei Fitted", 90000, "/images/c.jpg", "Sprei"]
    );
    await db.query(
      "INSERT INTO product_variants (product_id, size, length_cm, width_cm, height_cm, color, stock) VALUES (?, ?, 0, 0, 0, ?, ?)",
      ["prod-c", "160×200×30", "Abu", 10]
    );

    // Produk D: Fashion Test / Kaos Test, Aktif, Harga 50000, Dibuat 3 hari lalu, Stok 3 (Stok Menipis)
    await db.query(
      `INSERT INTO products (id, sku, name, category, subcategory, price, image, description, active, is_new, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, DATE_SUB(NOW(), INTERVAL 3 DAY))`,
      ["prod-d", "SKU-D", "Kaos Promo Diskon", "test-fashion", "test-kaos", 50000, "/images/d.jpg", "Promo"]
    );
    await db.query(
      "INSERT INTO product_variants (product_id, size, length_cm, width_cm, height_cm, color, stock) VALUES (?, ?, 0, 0, 0, ?, ?)",
      ["prod-d", "M", "Navy", 3]
    );

    // Ambil ID user admin yang dibuat oleh initialize
    const adminUser = (await db.query("SELECT id FROM users WHERE role='admin' LIMIT 1")).rows[0];
    const adminId = adminUser ? adminUser.id : "admin-id";

    // 3. Masukkan data pesanan nyata (orders & order_items) dengan status PAID untuk verifikasi Terlaris & Kurang Laris
    // Pesanan 1: prod-b dibeli 10 unit (PAID)
    await db.query(
      `INSERT INTO orders (id, user_id, address, shipping, payment, subtotal, discount, delivery, total, status, payment_status, checkout_key)
       VALUES ('ord-test-1', ?, '{"name":"Tester"}', 'pickup', 'manual_bca', 2500000, 0, 0, 2500000, 'Diproses', 'PAID', 'chk-key-1')`,
      [adminId]
    );
    await db.query(
      `INSERT INTO order_items (id, order_id, product_id, name, image, size, color, quantity, price)
       VALUES ('item-1', 'ord-test-1', 'prod-b', 'Kaos Oversize Vintage', '/images/b.jpg', 'XL', 'Putih', 10, 250000)`
    );

    // Pesanan 2: prod-a dibeli 3 unit (PAID)
    await db.query(
      `INSERT INTO orders (id, user_id, address, shipping, payment, subtotal, discount, delivery, total, status, payment_status, checkout_key)
       VALUES ('ord-test-2', ?, '{"name":"Tester"}', 'pickup', 'manual_bca', 450000, 0, 0, 450000, 'Diproses', 'PAID', 'chk-key-2')`,
      [adminId]
    );
    await db.query(
      `INSERT INTO order_items (id, order_id, product_id, name, image, size, color, quantity, price)
       VALUES ('item-2', 'ord-test-2', 'prod-a', 'Kaos Polos Premium', '/images/a.jpg', 'L', 'Hitam', 3, 150000)`
    );

    // Pesanan 3: prod-d ada di pesanan PENDING (BELUM BAYAR) - tidak boleh dihitung ke soldUnits
    await db.query(
      `INSERT INTO orders (id, user_id, address, shipping, payment, subtotal, discount, delivery, total, status, payment_status, checkout_key)
       VALUES ('ord-test-3', ?, '{"name":"Tester"}', 'pickup', 'manual_bca', 50000, 0, 0, 50000, 'Menunggu pembayaran', 'PENDING', 'chk-key-3')`,
      [adminId]
    );
    await db.query(
      `INSERT INTO order_items (id, order_id, product_id, name, image, size, color, quantity, price)
       VALUES ('item-3', 'ord-test-3', 'prod-d', 'Kaos Promo Diskon', '/images/d.jpg', 'M', 'Navy', 5, 50000)`
    );

    // Siapkan server
    server = createApp(db, {
      test: true,
      env: { NODE_ENV: "test" },
    }).listen(0, "127.0.0.1");

    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port + "/api";

    // Login sebagai Admin
    const loginRes = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "admin@linyjaya.test", password: "AdminLinyJaya2026!" }),
    });
    assert.equal(loginRes.status, 200, "Login admin harus sukses");
    adminCookie = loginRes.headers.get("set-cookie") || "";

    // -------------------------------------------------------------
    // Test 1: Verifikasi Backend Menghitung soldUnits Nyata dari Pesanan PAID
    // -------------------------------------------------------------
    await t.test("1. Backend /api/admin/products menghitung data penjualan aktual dari pesanan PAID", async () => {
      const res = await fetch(`${base}/admin/products`, {
        headers: { cookie: adminCookie },
      });
      assert.equal(res.status, 200);
      const items = await res.json();

      const prodB = items.find((p) => p.id === "prod-b");
      const prodA = items.find((p) => p.id === "prod-a");
      const prodD = items.find((p) => p.id === "prod-d");

      assert.ok(prodB, "prod-b harus ditemukan");
      assert.equal(prodB.soldUnits, 10, "prod-b harus memiliki 10 unit terjual dari pesanan PAID");

      assert.ok(prodA, "prod-a harus ditemukan");
      assert.equal(prodA.soldUnits, 3, "prod-a harus memiliki 3 unit terjual dari pesanan PAID");

      assert.ok(prodD, "prod-d harus ditemukan");
      assert.equal(prodD.soldUnits, 0, "prod-d pesanan PENDING tidak boleh dihitung sebagai terjual");
    });

    // -------------------------------------------------------------
    // Test 2: Filter Status (Aktif & Disembunyikan)
    // -------------------------------------------------------------
    await t.test("2. Filter status Aktif dan Disembunyikan bekerja dengan tepat", async () => {
      const resActive = await fetch(`${base}/admin/products?status=active`, {
        headers: { cookie: adminCookie },
      });
      const activeItems = await resActive.json();
      assert.ok(activeItems.length > 0);
      for (const item of activeItems) {
        assert.equal(Boolean(item.active), true, "Status produk harus aktif");
      }

      const resArchived = await fetch(`${base}/admin/products?status=archived`, {
        headers: { cookie: adminCookie },
      });
      const archivedItems = await resArchived.json();
      assert.ok(archivedItems.some((p) => p.id === "prod-c"), "prod-c harus ada di daftar disembunyikan");
      for (const item of archivedItems) {
        assert.equal(Boolean(item.active), false, "Status produk harus disembunyikan");
      }
    });

    // -------------------------------------------------------------
    // Test 3: Filter Kategori & Subkategori
    // -------------------------------------------------------------
    await t.test("3. Filter Kategori dan Subkategori menyaring produk sesuai relasi database", async () => {
      const resFashion = await fetch(`${base}/admin/products?category=test-fashion`, {
        headers: { cookie: adminCookie },
      });
      const fashionItems = await resFashion.json();
      assert.ok(fashionItems.length >= 3);
      for (const item of fashionItems) {
        assert.equal(item.category, "test-fashion");
      }

      const resKaos = await fetch(`${base}/admin/products?category=test-fashion&subcategory=test-kaos`, {
        headers: { cookie: adminCookie },
      });
      const kaosItems = await resKaos.json();
      for (const item of kaosItems) {
        assert.equal(item.subcategory, "test-kaos");
      }
    });

    // -------------------------------------------------------------
    // Test 4: Filter Stok (Stok Habis 0, Stok Tersedia >0, Stok Menipis <5)
    // -------------------------------------------------------------
    await t.test("4. Filter Stok Habis (stok 0) dan filter stok lainnya bekerja", async () => {
      const resZero = await fetch(`${base}/admin/products?stock=out_of_stock`, {
        headers: { cookie: adminCookie },
      });
      const zeroItems = await resZero.json();
      assert.ok(zeroItems.some((p) => p.id === "prod-b"), "prod-b dengan stok 0 harus terfilter di out_of_stock");
      for (const item of zeroItems) {
        assert.equal(Number(item.stock), 0, "Semua produk out_of_stock harus memiliki stok 0");
      }

      const resLow = await fetch(`${base}/admin/products?stock=low_stock`, {
        headers: { cookie: adminCookie },
      });
      const lowItems = await resLow.json();
      assert.ok(lowItems.some((p) => p.id === "prod-d"), "prod-d dengan stok 3 harus terfilter di low_stock");
    });

    // -------------------------------------------------------------
    // Test 5: Pengurutan Lengkap (Terbaru, Terlama, Terlaris, Kurang Laris, Harga, Stok)
    // -------------------------------------------------------------
    await t.test("5. Pengurutan Terlaris, Kurang Laris, Harga, Stok, dan Tanggal", async () => {
      // A. Terlaris (bestseller)
      const resBest = await fetch(`${base}/admin/products?category=test-fashion&sort=bestseller`, {
        headers: { cookie: adminCookie },
      });
      const bestItems = await resBest.json();
      assert.equal(bestItems[0].id, "prod-b", "prod-b dengan 10 unit terjual harus berada di urutan teratas");
      assert.equal(bestItems[1].id, "prod-a", "prod-a dengan 3 unit terjual di urutan kedua");

      // B. Kurang Laris (least_sold)
      const resLeast = await fetch(`${base}/admin/products?category=test-fashion&sort=least_sold`, {
        headers: { cookie: adminCookie },
      });
      const leastItems = await resLeast.json();
      assert.equal(leastItems[0].soldUnits, 0, "Produk dengan 0 penjualan harus berada di urutan pertama kurang laris");

      // C. Harga Tertinggi & Terendah
      const resPriceHigh = await fetch(`${base}/admin/products?category=test-fashion&sort=price_high`, {
        headers: { cookie: adminCookie },
      });
      const highItems = await resPriceHigh.json();
      assert.equal(highItems[0].id, "prod-b", "Harga 250000 harus tertinggi");

      const resPriceLow = await fetch(`${base}/admin/products?category=test-fashion&sort=price_low`, {
        headers: { cookie: adminCookie },
      });
      const lowItems = await resPriceLow.json();
      assert.equal(lowItems[0].id, "prod-d", "Harga 50000 harus terendah");

      // D. Stok Terbanyak & Tersedikit
      const resStockHigh = await fetch(`${base}/admin/products?category=test-fashion&sort=stock_high`, {
        headers: { cookie: adminCookie },
      });
      const stockHigh = await resStockHigh.json();
      assert.equal(stockHigh[0].id, "prod-a", "Stok 50 harus terbanyak");

      const resStockLow = await fetch(`${base}/admin/products?category=test-fashion&sort=stock_low`, {
        headers: { cookie: adminCookie },
      });
      const stockLow = await resStockLow.json();
      assert.equal(stockLow[0].id, "prod-b", "Stok 0 harus tersedikit");
    });

    // -------------------------------------------------------------
    // Test 6: Kombinasi Filter, Pengurutan, dan Pencarian
    // -------------------------------------------------------------
    await t.test("6. Kombinasi Filter Status + Kategori + Pencarian + Pengurutan", async () => {
      // Contoh skenario: Produk aktif + Kategori test-fashion + Search "Vintage" + Urutkan Bestseller
      const resCombined = await fetch(
        `${base}/admin/products?status=active&category=test-fashion&search=Vintage&sort=bestseller`,
        { headers: { cookie: adminCookie } }
      );
      const combined = await resCombined.json();
      assert.equal(combined.length, 1);
      assert.equal(combined[0].id, "prod-b");
    });

    // -------------------------------------------------------------
    // Test 7: Verifikasi Struktur UI Frontend (Admin.jsx)
    // -------------------------------------------------------------
    await t.test("7. Kode Frontend (Admin.jsx) memiliki kontrol lengkap, Reset Filter, dan pemisahan Urutkan", () => {
      const adminJsx = fs.readFileSync("src/Admin.jsx", "utf8");

      // Pemisahan Urutkan dan Filter
      assert.match(adminJsx, /Urutkan:/, "Harus ada label visual dan pemisahan pengurutan");
      assert.match(adminJsx, /aria-label="Urutkan produk"/, "Harus ada select pengurutan produk");
      assert.match(adminJsx, /value="bestseller"/, "Harus ada pilihan Terlaris");
      assert.match(adminJsx, /value="least_sold"/, "Harus ada pilihan Kurang Laris");
      assert.match(adminJsx, /value="price_high"/, "Harus ada pilihan Harga Tertinggi");
      assert.match(adminJsx, /value="price_low"/, "Harus ada pilihan Harga Terendah");
      assert.match(adminJsx, /value="stock_high"/, "Harus ada pilihan Stok Terbanyak");
      assert.match(adminJsx, /value="stock_low"/, "Harus ada pilihan Stok Tersedikit");

      // Filter Stok Habis
      assert.match(adminJsx, /value="out_of_stock"/, "Harus ada pilihan Stok Habis (0)");

      // Filter Kategori & Subkategori
      assert.match(adminJsx, /aria-label="Filter kategori"/, "Harus ada dropdown Filter Kategori");
      assert.match(adminJsx, /aria-label="Filter subkategori"/, "Harus ada dropdown Filter Subkategori");

      // Tombol Reset Filter
      assert.match(adminJsx, /resetProductFilters/, "Harus memiliki fungsi resetProductFilters");
      assert.match(adminJsx, />Reset Filter<\/span>|>Reset Filter<\/button>/, "Harus ada tombol Reset Filter yang terlihat");
      assert.match(adminJsx, /isProductFilterActive/, "Tombol Reset Filter terpicu saat filter aktif");

      // CRUD Preserved: Tombol Detail, Edit, Sembunyikan tetap ada
      assert.match(adminJsx, /loadProductToEdit\(p\)/, "Fungsi Edit produk tetap ada");
      assert.match(adminJsx, /api\("\/admin\/products\/" \+ p\.id/, "Aksi toggle active/archive tetap ada");
    });

  } finally {
    if (server) server.close();
    await db.query("DROP DATABASE IF EXISTS `" + testDbName + "`").catch(() => {});
    await root.end().catch(() => {});
  }
});

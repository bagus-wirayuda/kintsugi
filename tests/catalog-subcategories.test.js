import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import mysql from "mysql2/promise";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
import {
  catalogCategories,
  getMainCategories,
  getSubcategories,
  categoryLabel,
  mainCategoryLabel,
} from "../src/catalog.js";

test("Sidebar Katalog Produk: Mekanisme Penampilan Subkategori Sesuai Kategori Utama", async (t) => {
  // -------------------------------------------------------------
  // Bagian 1: Unit Test Fungsi Katalog (catalog.js)
  // -------------------------------------------------------------
  await t.test("1. Subkategori hanya menampilkan item yang terhubung ke kategori utama aktif", () => {
    // Kategori bedding hanya boleh mengembalikan subkategori bedding
    const beddingSubs = getSubcategories(catalogCategories, "bedding");
    assert.ok(beddingSubs.length > 0, "Bedding harus memiliki subkategori");
    for (const sub of beddingSubs) {
      assert.equal(sub.parentId || sub.parent_id, "bedding", `Subkategori ${sub.id} harus memiliki parentId 'bedding'`);
    }

    // Kompatibilitas alias 'seprai' tetap merujuk ke bedding
    const sepraiSubs = getSubcategories(catalogCategories, "seprai");
    assert.equal(sepraiSubs.length, beddingSubs.length, "Alias seprai harus memetakan ke subkategori bedding");

    // Pastikan tidak ada subkategori fashion di bedding
    const fashionInBedding = beddingSubs.find((s) => s.id.includes("fashion") || s.parentId === "fashion");
    assert.equal(fashionInBedding, undefined, "Bedding tidak boleh mengandung subkategori fashion");

    // Kategori fashion hanya mengembalikan subkategori fashion
    const fashionSubs = getSubcategories(catalogCategories, "fashion");
    assert.ok(fashionSubs.length > 0, "Fashion harus memiliki subkategori");
    for (const sub of fashionSubs) {
      assert.equal(sub.parentId || sub.parent_id, "fashion", `Subkategori ${sub.id} harus memiliki parentId 'fashion'`);
    }
  });

  await t.test("2. Pengambilan relasi dinamis untuk kategori baru dari Admin / Database (misal: Kebutuhan Bayi)", () => {
    const customCategories = [
      ...catalogCategories,
      { id: "kebutuhan-bayi", name: "Kebutuhan Bayi", label: "Kebutuhan Bayi", parentId: null, parent_id: null, active: 1 },
      { id: "baju-bayi", name: "Pakaian & Jumper Bayi", label: "Pakaian & Jumper Bayi", parentId: "kebutuhan-bayi", parent_id: "kebutuhan-bayi", active: 1 },
      { id: "selimut-bayi", name: "Selimut & Bedding Bayi", label: "Selimut & Bedding Bayi", parentId: "kebutuhan-bayi", parent_id: "kebutuhan-bayi", active: 1 },
    ];

    // Cek dengan ID kategori
    const bayiSubsById = getSubcategories(customCategories, "kebutuhan-bayi");
    assert.equal(bayiSubsById.length, 2, "Kebutuhan Bayi harus memiliki tepat 2 subkategori");
    assert.deepEqual(
      bayiSubsById.map((s) => s.id),
      ["baju-bayi", "selimut-bayi"]
    );

    // Cek dengan Nama/Label kategori (case-insensitive)
    const bayiSubsByName = getSubcategories(customCategories, "Kebutuhan Bayi");
    assert.equal(bayiSubsByName.length, 2, "Pencarian dengan nama kategori harus cocok dengan subkategori relasinya");

    // Pastikan Seprai & Bedding tidak tercampur ke Kebutuhan Bayi
    const sepraiInBayi = bayiSubsById.find((s) => s.parentId === "seprai" || s.id === "Sprei Fitted");
    assert.equal(sepraiInBayi, undefined, "Kebutuhan Bayi tidak boleh meminjam subkategori dari Seprai");
  });

  await t.test("3. Kategori tanpa subkategori menghasilkan array kosong (tidak meminjam dari kategori lain)", () => {
    const customCategories = [
      ...catalogCategories,
      { id: "elektronik", name: "Elektronik Rumah", label: "Elektronik Rumah", parentId: null, parent_id: null, active: 1 },
    ];

    const emptySubs = getSubcategories(customCategories, "elektronik");
    assert.ok(Array.isArray(emptySubs), "Harus mengembalikan array");
    assert.equal(emptySubs.length, 0, "Kategori tanpa subkategori harus menghasilkan array kosong ([])");
  });

  await t.test("4. mainCategoryLabel dan categoryLabel mengenali ID maupun Name", () => {
    assert.equal(mainCategoryLabel("bedding"), "Bedding");
    assert.equal(mainCategoryLabel("fashion"), "Fashion");
    assert.equal(mainCategoryLabel("Semua"), "Semua Departemen");

    assert.equal(categoryLabel("bedding-fitted"), "Sprei Fitted & Karet");
    assert.equal(categoryLabel("fashion-kaos"), "Kaos & T-Shirt");
    assert.equal(categoryLabel("Semua"), "Semua koleksi");
  });

  // -------------------------------------------------------------
  // Bagian 2: Verifikasi Markup & Logika UI Frontend (main.jsx)
  // -------------------------------------------------------------
  await t.test("5. Kode Frontend (main.jsx) memiliki header kategori aktif, tombol semua produk, dan kondisi kosong rapi", () => {
    const mainJsx = fs.readFileSync("src/main.jsx", "utf8");

    // Memastikan `isMainCat` memeriksa kumpulan kategori dinamis (tidak hanya 3 kategori hardcode)
    assert.match(
      mainJsx,
      /const catsPool = config\?\.categories\?\.length \? config\.categories : catalogCategories;/,
      "shop() harus menggunakan daftar kategori dinamis dari config"
    );

    // Memastikan Desktop Sidebar memiliki Header Nama Kategori Aktif
    assert.match(
      mainJsx,
      /mainCategoryLabel\(activeCategory, allCategories\)/,
      "Sidebar harus menampilkan nama kategori utama aktif sebagai header"
    );

    // Memastikan tombol Semua Produk dalam Kategori ada
    assert.match(
      mainJsx,
      /Semua \{mainCategoryLabel\(activeCategory, allCategories\)\}/,
      "Sidebar harus menyediakan tombol untuk melihat seluruh produk kategori aktif"
    );

    // Memastikan empty state ditampilkan jika tidak ada subkategori
    assert.match(
      mainJsx,
      /catalog-empty-subs/,
      "Harus ada elemen empty state (.catalog-empty-subs) saat kategori tidak memiliki subkategori"
    );
    assert.match(
      mainJsx,
      /Belum ada subkategori untuk/,
      "Teks empty state harus informatif menyatakan belum ada subkategori"
    );

    // Memastikan Mobile view juga memiliki struktur yang konsisten
    assert.match(
      mainJsx,
      /catalog-mobile-only/,
      "Tampilan mobile harus memiliki filter kategori responsif"
    );
    assert.match(
      mainJsx,
      /catalog-mobile-cat-options/,
      "Dropdown kategori mobile harus menyajikan pilihan yang sejalan dengan desktop"
    );
  });

  // -------------------------------------------------------------
  // Bagian 3: Integrasi API Produk (/api/products)
  // -------------------------------------------------------------
  await t.test("6. API Backend: Filter kategori dan subkategori secara ketat", async () => {
    const testDbName = "liny_test_cats_" + Date.now();
    const root = await mysql.createConnection({
      ...databaseConfig(),
      database: undefined,
    });
    await root.query(`CREATE DATABASE \`${testDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const db = createPool(testDbName);

    let server;
    try {
      await initialize(db, true);

      // Tambahkan kategori kustom "Kebutuhan Bayi" dan subkategori "Baju Bayi"
      await db.query(
        "INSERT INTO product_categories (id, name, parent_id, active, sort_order) VALUES (?, ?, NULL, 1, 10)",
        ["kebutuhan-bayi", "Kebutuhan Bayi"]
      );
      await db.query(
        "INSERT INTO product_categories (id, name, parent_id, active, sort_order) VALUES (?, ?, ?, 1, 11)",
        ["baju-bayi", "Baju Bayi", "kebutuhan-bayi"]
      );

      // Tambahkan produk uji di bawah "kebutuhan-bayi"
      await db.query(
        "INSERT INTO products (id, sku, name, category, subcategory, price, image, description, is_new, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)",
        ["prod-bayi-1", "SKU-BAYI-1", "Jumper Bayi Katun Organik", "kebutuhan-bayi", "baju-bayi", 75000, "/images/bayi1.jpg", "Deskripsi baju bayi"]
      );

      server = createApp(db, {
        test: true,
        env: { NODE_ENV: "test" },
      }).listen(0, "127.0.0.1");

      await new Promise((r) => server.once("listening", r));
      const base = "http://127.0.0.1:" + server.address().port + "/api";

      // A. Query dengan category="kebutuhan-bayi"
      const resBayi = await fetch(`${base}/products?category=kebutuhan-bayi`);
      const dataBayi = await resBayi.json();
      assert.equal(resBayi.status, 200);
      assert.ok(dataBayi.items.length >= 1, "Harus menemukan produk Kebutuhan Bayi");
      for (const item of dataBayi.items) {
        assert.equal(item.category, "kebutuhan-bayi", "Hanya produk dengan kategori kebutuhan-bayi yang dikembalikan");
      }

      // B. Query dengan category="kebutuhan-bayi" dan subcategory="baju-bayi"
      const resSub = await fetch(`${base}/products?category=kebutuhan-bayi&subcategory=baju-bayi`);
      assert.equal(resSub.status, 200);
      const dataSub = await resSub.json();
      assert.equal(dataSub.items.length, 1, "Harus menemukan tepat 1 produk baju bayi");
      assert.equal(dataSub.items[0].id, "prod-bayi-1");

      // C. Query dengan category="kebutuhan-bayi" dan subcategory lain yang tidak cocok
      const resNonMatch = await fetch(`${base}/products?category=kebutuhan-bayi&subcategory=Sprei Fitted`);
      assert.equal(resNonMatch.status, 200);
      const dataNonMatch = await resNonMatch.json();
      assert.equal(dataNonMatch.items.length, 0, "Subkategori yang tidak cocok tidak boleh menghasilkan produk");

      // D. Query dengan category="seprai" tidak boleh mencampur produk bayi
      const resSeprai = await fetch(`${base}/products?category=seprai`);
      assert.equal(resSeprai.status, 200);
      const dataSeprai = await resSeprai.json();
      const bayiInSeprai = dataSeprai.items.find((p) => p.category === "kebutuhan-bayi");
      assert.equal(bayiInSeprai, undefined, "Kategori seprai tidak boleh memuat produk kebutuhan bayi");

    } catch (err) {
      console.error("DEBUG TEST 6 ERROR STACK:", err);
      throw err;
    } finally {
      if (server) server.close();
      await db.query("DROP DATABASE IF EXISTS `" + testDbName + "`").catch(() => {});
      await root.end().catch(() => {});
    }
  });
});

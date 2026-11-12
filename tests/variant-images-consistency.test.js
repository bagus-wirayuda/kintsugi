import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
import {
  collectVariantImages,
  getGalleryForSelection,
  resolveActiveVariant,
  resolveColorHex,
  resolveVariationDisplayMode,
} from "../src/variant-utils.js";

test("Unit Variasi: Konsistensi Tampilan, Multi-Gambar Galeri & Fallback", async (t) => {
  await t.test("1. Grup warna solid selalu seragam swatch dan tidak pernah bercampur tombol teks", () => {
    const pureSwatches = resolveVariationDisplayMode(
      ["Biru Langit", "Hijau Mint", "Kuning Ceria"],
      [
        { id: "v-1", size: "160×200×30", color: "Biru Langit", stock: 10 },
        { id: "v-2", size: "160×200×30", color: "Hijau Mint", stock: 12 },
        { id: "v-3", size: "160×200×30", color: "Kuning Ceria", stock: 8 },
      ],
      "Warna",
    );
    assert.equal(pureSwatches.mode, "swatch");
    assert.equal(pureSwatches.items.length, 3);
    assert.ok(pureSwatches.items.every((item) => Boolean(item.hex)));

    // Jika ada 1 saja opsi yang bukan warna solid, seluruh kelompok otomatis seragam menjadi mode "text"
    const mixedGroup = resolveVariationDisplayMode(
      ["Biru Langit", "Custom Motif Polkadot Eksklusif"],
      [
        { id: "v-1", size: "S", color: "Biru Langit", stock: 5 },
        { id: "v-2", size: "S", color: "Custom Motif Polkadot Eksklusif", stock: 5 },
      ],
      "Warna",
    );
    assert.equal(mixedGroup.mode, "text");
    assert.equal(mixedGroup.items.length, 2);
  });

  await t.test("2. Grup Motif/Jenis tampil seragam thumbnail jika seluruh varian bergambar, atau teks jika parsial", () => {
    const fullThumbMotif = resolveVariationDisplayMode(
      ["Floral Daisy", "Botanical Wave"],
      [
        { id: "m-1", size: "160×200×30", color: "Floral Daisy", image_url: "/images/seprai/sprei-02.jpg", stock: 5 },
        { id: "m-2", size: "160×200×30", color: "Botanical Wave", image_url: "/images/seprai/sprei-03.jpg", stock: 5 },
      ],
      "Motif",
    );
    assert.equal(fullThumbMotif.mode, "thumbnail");
    assert.ok(fullThumbMotif.items.every((item) => Boolean(item.thumb)));

    const partialThumbMotif = resolveVariationDisplayMode(
      ["Floral Daisy", "Motif Baru"],
      [
        { id: "m-1", size: "160×200×30", color: "Floral Daisy", image_url: "/images/seprai/sprei-02.jpg", stock: 5 },
        { id: "m-2", size: "160×200×30", color: "Motif Baru", image_url: null, stock: 5 },
      ],
      "Motif",
    );
    assert.equal(partialThumbMotif.mode, "text");
  });

  await t.test("3. Gambar dinamis mengikuti variasi aktif, mendukung galeri multi-foto, dan fallback ke gambar utama produk", () => {
    const product = {
      id: "prod-1",
      name: "Sprei Katun Premium",
      price: 249000,
      oldPrice: 299000,
      image: "/images/seprai/sprei-01.jpg",
      variants: [
        {
          id: "var-biru-160",
          size: "160×200×30",
          color: "Biru Langit",
          stock: 8,
          price: 269000,
          image_url: "/images/seprai/sprei-biru-1.jpg",
          images: ["/images/seprai/sprei-biru-1.jpg", "/images/seprai/sprei-biru-2.jpg"],
        },
        {
          id: "var-biru-180",
          size: "180×200×30",
          color: "Biru Langit",
          stock: 4,
          price: 289000,
          image_url: "/images/seprai/sprei-biru-1.jpg",
          images: ["/images/seprai/sprei-biru-1.jpg", "/images/seprai/sprei-biru-2.jpg"],
        },
        {
          id: "var-hijau-160",
          size: "160×200×30",
          color: "Hijau Mint",
          stock: 11,
          image_url: "/images/seprai/sprei-hijau.jpg",
        },
        {
          id: "var-kuning-160",
          size: "160×200×30",
          color: "Kuning Ceria",
          stock: 6,
          image_url: null,
        },
      ],
    };

    const biru = resolveActiveVariant(product, "Biru Langit", "160×200×30");
    assert.equal(biru.variantId, "var-biru-160");
    assert.equal(biru.hasVariantImage, true);
    assert.equal(biru.image, "/images/seprai/sprei-biru-1.jpg");
    assert.deepEqual(biru.gallery, ["/images/seprai/sprei-biru-1.jpg", "/images/seprai/sprei-biru-2.jpg"]);
    assert.equal(biru.unitPrice, 269000);
    assert.equal(biru.stock, 8);

    // Ganti ukuran mempertahankan warna & mengupdate ID variasi, harga, serta stok
    const biru180 = resolveActiveVariant(product, "Biru Langit", "180×200×30");
    assert.equal(biru180.variantId, "var-biru-180");
    assert.equal(biru180.unitPrice, 289000);
    assert.equal(biru180.stock, 4);

    // Ganti ke Hijau Mint -> gambar langsung berpindah ke gambar Hijau Mint
    const hijau = resolveActiveVariant(product, "Hijau Mint", "160×200×30");
    assert.equal(hijau.variantId, "var-hijau-160");
    assert.equal(hijau.image, "/images/seprai/sprei-hijau.jpg");
    assert.equal(hijau.unitPrice, 249000);

    // Ganti ke Kuning Ceria (tanpa gambar variasi) -> fallback ke gambar utama produk, TIDAK nyangkut di Hijau Mint
    const kuning = getGalleryForSelection(product, "Kuning Ceria", "160×200×30");
    assert.equal(kuning.hasVariantImage, false);
    assert.equal(kuning.mainImage, "/images/seprai/sprei-01.jpg");
    assert.deepEqual(kuning.gallery, ["/images/seprai/sprei-01.jpg"]);
    assert.equal(collectVariantImages(product.variants[0]).length, 2);
    assert.equal(resolveColorHex("#b7c8d5"), "#B7C8D5");
  });
});

test("Integrasi DB & API: Normalisasi Seed, CRUD Gambar & Harga Variasi Admin, serta Sinkronisasi Checkout/Order", async (t) => {
  const name = "liny_test_variant_" + Date.now();
  const root = await mysql.createConnection({
    ...databaseConfig(),
    database: undefined,
  });
  await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const db = createPool(name);

  let server;
  let adminCookie = "";
  let customerCookie = "";
  let createdProductId = "";

  try {
    await initialize(db, true);

    server = createApp(db, {
      test: true,
      env: { NODE_ENV: "test" },
      gateway: { configured: false, sandbox: true },
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
        body: body !== undefined ? JSON.stringify(body) : undefined,
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

    await t.test("1. Database seed bersih: tidak ada duplikat kode #HEX bercampur label warna dan seluruh varian punya ID", async () => {
      const badHexRows = (
        await db.query("SELECT product_id, color FROM product_variants WHERE color REGEXP '^#[0-9A-Fa-f]{3,6}$'")
      ).rows;
      assert.equal(badHexRows.length, 0, "Tidak boleh ada warna #HEX mentah tersisa di product_variants");

      const nullIdRows = (
        await db.query("SELECT product_id, size, color FROM product_variants WHERE id IS NULL OR id=''")
      ).rows;
      assert.equal(nullIdRows.length, 0, "Seluruh baris product_variants wajib memiliki id unik");

      const productsRes = await req("/products?pageSize=48", undefined, "", "GET");
      assert.equal(productsRes.status, 200);
      const page1Items = productsRes.data.items || [];
      const page2Res = await req("/products?page=2&pageSize=48", undefined, "", "GET");
      assert.equal(page2Res.status, 200);
      const productList = [...page1Items, ...(page2Res.data.items || [])];
      assert.ok(productList.length > 0);
      for (const p of productList) {
        const hasHex = (p.colors || []).some((c) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c));
        const hasNamed = (p.colors || []).some((c) => !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c));
        assert.equal(hasHex && hasNamed, false, `Produk ${p.id} masih mencampur warna #HEX dan nama warna`);
      }
    });

    await t.test("2. Admin membuat produk dengan galeri multi-gambar per variasi + harga khusus variasi", async () => {
      const catsRes = await req("/categories", undefined, "", "GET");
      assert.equal(catsRes.status, 200);
      const cats = Array.isArray(catsRes.data) ? catsRes.data : [];
      const mainCat = cats.find((c) => !c.parent_id && !c.parentId && c.active);
      const subCat = cats.find((c) => (c.parent_id || c.parentId) === mainCat?.id && c.active);
      assert.ok(mainCat && subCat, "Kategori & subkategori aktif wajib tersedia");

      const createRes = await req(
        "/admin/products",
        {
          name: "Sprei Kintsugi Multi-Variasi Uji",
          sku: "KTS-VAR-901",
          category: mainCat.id,
          subcategory: subCat.id,
          price: 250000,
          oldPrice: 0,
          costPrice: 150000,
          weightGrams: 1200,
          variationLabel: "Warna",
          image: "/images/seprai/sprei-01.jpg",
          description: "Sprei uji dengan gambar berbeda setiap variasi warna dan ukuran.",
          isNew: true,
          variants: [
            {
              size: "160×200×30",
              color: "Biru Langit",
              stock: 15,
              price: 275000,
              imageUrl: "/images/seprai/sprei-02.jpg",
              images: ["/images/seprai/sprei-02.jpg", "/images/seprai/sprei-03.jpg"],
            },
            {
              size: "160×200×30",
              color: "Hijau Mint",
              stock: 12,
              price: null,
              imageUrl: "/images/seprai/sprei-04.jpg",
              images: ["/images/seprai/sprei-04.jpg"],
            },
            {
              size: "160×200×30",
              color: "Kuning Ceria",
              stock: 9,
              price: null,
              imageUrl: null,
              images: [],
            },
          ],
        },
        adminCookie,
        "POST",
      );
      assert.equal(createRes.status, 201, JSON.stringify(createRes.data));
      createdProductId = createRes.data.id;

      const detailRes = await req(`/products/${createdProductId}`, undefined, "", "GET");
      assert.equal(detailRes.status, 200);
      const prod = detailRes.data;
      assert.equal(prod.variants.length, 3);
      const vBiru = prod.variants.find((v) => v.color === "Biru Langit");
      const vHijau = prod.variants.find((v) => v.color === "Hijau Mint");
      const vKuning = prod.variants.find((v) => v.color === "Kuning Ceria");

      assert.ok(vBiru?.id);
      assert.equal(vBiru.price, 275000);
      assert.deepEqual(vBiru.images, ["/images/seprai/sprei-02.jpg", "/images/seprai/sprei-03.jpg"]);
      assert.equal(vHijau.image_url, "/images/seprai/sprei-04.jpg");
      assert.equal(vKuning.image_url, null);
      assert.deepEqual(vKuning.images, []);
    });

    await t.test("3. Admin dapat menghapus gambar variasi (tidak lengket COALESCE) lalu memulihkannya", async () => {
      const detailBefore = await req(`/products/${createdProductId}`, undefined, "", "GET");
      const variantsBefore = detailBefore.data.variants;
      const vBiru = variantsBefore.find((v) => v.color === "Biru Langit");
      const vHijau = variantsBefore.find((v) => v.color === "Hijau Mint");
      const vKuning = variantsBefore.find((v) => v.color === "Kuning Ceria");

      // Hapus gambar Hijau Mint via PATCH
      const clearRes = await req(
        `/admin/products/${createdProductId}`,
        {
          variants: [
            { id: vBiru.id, size: vBiru.size, color: vBiru.color, stock: vBiru.stock, price: vBiru.price, imageUrl: vBiru.image_url, images: vBiru.images },
            { id: vHijau.id, size: vHijau.size, color: vHijau.color, stock: vHijau.stock, price: null, imageUrl: null, images: [] },
            { id: vKuning.id, size: vKuning.size, color: vKuning.color, stock: vKuning.stock, price: null, imageUrl: null, images: [] },
          ],
        },
        adminCookie,
        "PATCH",
      );
      assert.equal(clearRes.status, 200);

      const afterClear = await req(`/products/${createdProductId}`, undefined, "", "GET");
      const clearedHijau = afterClear.data.variants.find((v) => v.color === "Hijau Mint");
      assert.equal(clearedHijau.image_url, null);
      assert.deepEqual(clearedHijau.images, []);
      assert.equal(clearedHijau.id, vHijau.id, "ID variasi tetap stabil saat edit");

      // Pulihkan gambar Hijau Mint
      const restoreRes = await req(
        `/admin/products/${createdProductId}`,
        {
          variants: [
            { id: vBiru.id, size: vBiru.size, color: vBiru.color, stock: vBiru.stock, price: vBiru.price, imageUrl: vBiru.image_url, images: vBiru.images },
            { id: vHijau.id, size: vHijau.size, color: vHijau.color, stock: vHijau.stock, price: null, imageUrl: "/images/seprai/sprei-04.jpg", images: ["/images/seprai/sprei-04.jpg"] },
            { id: vKuning.id, size: vKuning.size, color: vKuning.color, stock: vKuning.stock, price: null, imageUrl: null, images: [] },
          ],
        },
        adminCookie,
        "PATCH",
      );
      assert.equal(restoreRes.status, 200);
    });

    await t.test("4. Quote & Order backend menyinkronkan variantId, gambar variasi/fallback, dan harga variasi", async () => {
      const prodRes = await req(`/products/${createdProductId}`, undefined, "", "GET");
      const prod = prodRes.data;
      const vBiru = prod.variants.find((v) => v.color === "Biru Langit");
      const vKuning = prod.variants.find((v) => v.color === "Kuning Ceria");

      const itemsPayload = [
        { id: prod.id, variantId: vBiru.id, size: vBiru.size, color: vBiru.color, quantity: 2 },
        { id: prod.id, variantId: vKuning.id, size: vKuning.size, color: vKuning.color, quantity: 1 },
      ];

      const quoteRes = await req(
        "/checkout/quote",
        { items: itemsPayload, shipping: "local" },
        customerCookie,
        "POST",
      );
      assert.equal(quoteRes.status, 200, JSON.stringify(quoteRes.data));
      // 2 * 275000 + 1 * 250000 = 800000
      assert.equal(quoteRes.data.subtotal, 800000);
      assert.equal(quoteRes.data.items.length, 2);
      const qBiru = quoteRes.data.items.find((i) => i.color === "Biru Langit");
      const qKuning = quoteRes.data.items.find((i) => i.color === "Kuning Ceria");
      assert.equal(qBiru.variantId, vBiru.id);
      assert.equal(qBiru.image, "/images/seprai/sprei-02.jpg");
      assert.equal(qBiru.price, 275000);
      assert.equal(qKuning.variantId, vKuning.id);
      assert.equal(qKuning.image, "/images/seprai/sprei-01.jpg");
      assert.equal(qKuning.price, 250000);

      const orderRes = await req(
        "/orders",
        {
          items: itemsPayload,
          address: {
            name: "Rina Variasi",
            phone: "081234567890",
            email: "rina@example.test",
            street: "Jl. Sam Ratulangi No. 8",
            city: "Kendari",
            postal: "93111",
          },
          shipping: "local",
          shippingOption: { courier: "TOKO", service: "Kurir Toko", cost: 0 },
          payment: "QRIS_DANA_MANUAL",
          checkoutKey: "77777777-7777-4777-8777-777777777777",
        },
        customerCookie,
        "POST",
      );
      assert.equal(orderRes.status, 201, JSON.stringify(orderRes.data));
      assert.equal(orderRes.data.total, 800000);

      const orderItemsDb = (
        await db.query("SELECT * FROM order_items WHERE order_id=?", [orderRes.data.id])
      ).rows;
      assert.equal(orderItemsDb.length, 2);
      const dbBiru = orderItemsDb.find((row) => row.color === "Biru Langit");
      const dbKuning = orderItemsDb.find((row) => row.color === "Kuning Ceria");
      assert.equal(dbBiru.variant_id, vBiru.id);
      assert.equal(dbBiru.image, "/images/seprai/sprei-02.jpg");
      assert.equal(dbBiru.price, 275000);
      assert.equal(dbBiru.quantity, 2);

      assert.equal(dbKuning.variant_id, vKuning.id);
      assert.equal(dbKuning.image, "/images/seprai/sprei-01.jpg");
      assert.equal(dbKuning.price, 250000);
      assert.equal(dbKuning.quantity, 1);
    });
  } finally {
    if (server) server.close();
    await db.end();
    await root.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await root.end();
  }
});

test("Audit UI/UX: Komponen Variasi Seragam, Interaksi Kartu, Galeri Detail & Admin", async () => {
  const [variantSummarySrc, mainSrc, homeSrc, adminSrc, cssSrc] = await Promise.all([
    readFile("src/VariantSummary.jsx", "utf8"),
    readFile("src/main.jsx", "utf8"),
    readFile("src/Home.jsx", "utf8"),
    readFile("src/Admin.jsx", "utf8"),
    readFile("src/kintsugi.css", "utf8"),
  ]);

  assert.match(variantSummarySrc, /resolveVariationDisplayMode/, "VariantSummary harus memakai resolveVariationDisplayMode");
  assert.match(variantSummarySrc, /e\.stopPropagation\(\)/, "Klik chip variasi di kartu tidak boleh memicu klik kartu");
  assert.match(variantSummarySrc, /ks-variant-thumb-btn/, "Mode thumbnail motif harus memiliki class konsisten");

  assert.match(mainSrc, /resolveActiveVariant/, "main.jsx harus menyinkronkan variasi aktif via resolveActiveVariant");
  assert.match(mainSrc, /ks-detail-gallery-thumb/, "Detail produk harus menampilkan thumbnail strip multi-gambar variasi");
  assert.match(mainSrc, /openProduct\(p,\s*['"]cart['"],\s*activeCardColor\)/, "Buka detail dari kartu katalog harus mempertahankan variasi yang dipilih di kartu");
  assert.match(mainSrc, /variantId:\s*resolvedVariantId/, "Item keranjang/directPurchase harus membawa variantId");

  assert.match(homeSrc, /openProduct\(p,\s*['"]cart['"],\s*activeColor\)/, "Kartu Beranda harus meneruskan variasi aktif ke detail produk");
  assert.match(homeSrc, /resolveVariationDisplayMode/, "Promo banner Home harus merender pilihan variasi dengan mode seragam");

  assert.match(adminSrc, /collectVariantImages/, "Admin harus memuat galeri multi-gambar variasi");
  assert.match(adminSrc, /ws-variant-thumb-remove/, "Admin harus mendukung penghapusan tiap gambar variasi");
  assert.match(adminSrc, /variantPrice/, "Admin harus mendukung input harga khusus per variasi");

  assert.match(cssSrc, /\.ks-variant-swatch\.is-active/, "CSS harus menandai indikator aktif pada color swatch");
  assert.match(cssSrc, /\.ks-detail-gallery-thumb\.active/, "CSS harus menandai thumbnail galeri aktif pada detail produk");
  assert.match(cssSrc, /\.ks-variant-live-img/, "CSS harus memberikan transisi halus tanpa flicker saat gambar berubah");
});

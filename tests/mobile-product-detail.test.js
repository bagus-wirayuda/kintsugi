import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Detail Produk Mode Ponsel: Layout, Pemisahan Teks/Gambar, dan Navigasi", async (t) => {
  const kintsugiCss = fs.readFileSync("src/kintsugi.css", "utf8");
  const stylesCss = fs.readFileSync("src/styles.css", "utf8");
  const mainJsx = fs.readFileSync("src/main.jsx", "utf8");

  // 1. Pemisahan Teks dari Gambar pada Mode Ponsel
  await t.test("Gambar produk ditampilkan mandiri dan informasi ditempatkan di bawahnya dengan latar jelas", () => {
    // Memastikan wadah gambar mobile terpisah secara mandiri
    assert.match(
      kintsugiCss,
      /\.detail-image\s*\{[^}]*background:\s*#f8fafc/i,
      "Wadah gambar produk harus memiliki latar belakang netral mandiri"
    );
    assert.match(
      kintsugiCss,
      /\.detail-image\s*img\s*\{[^}]*object-fit:\s*contain/i,
      "Gambar produk tidak boleh terpotong dan menggunakan object-fit: contain"
    );

    // Memastikan informasi produk berada di bawah dengan background solid
    assert.match(
      kintsugiCss,
      /\.detail-info\s*\{[^}]*background:\s*#ffffff/i,
      "Informasi produk harus memiliki background putih yang jelas"
    );
    assert.match(
      kintsugiCss,
      /\.product-dialog\s*\{[^}]*flex-direction:\s*column/i,
      "Modal harus menumpuk gambar dan informasi produk secara vertikal di ponsel"
    );
  });

  // 2. Posisi Modal dan Tombol Tutup (X) yang Selalu Terlihat & Mudah Diklik
  await t.test("Tombol Tutup (X) selalu terlihat (sticky), tidak tertutup header, dan z-index aman", () => {
    // Tombol close sticky di pojok kanan atas dialog
    assert.match(
      kintsugiCss,
      /\.product-dialog\s*>\s*\.close\s*\{[^}]*position:\s*sticky/i,
      "Tombol close harus berposisi sticky agar selalu terlihat saat konten di-scroll"
    );
    assert.match(
      kintsugiCss,
      /\.product-dialog\s*>\s*\.close\s*\{[^}]*min-width:\s*40px/i,
      "Tombol close harus memiliki ukuran target sentuh minimal 40px"
    );

    // Z-index overlay lebih tinggi dari header (40) dan bottom nav (110)
    assert.match(
      kintsugiCss,
      /\.overlay\s*\{[^}]*z-index:\s*1200/i,
      "Overlay detail produk harus memiliki z-index tinggi agar tidak tertutup elemen navigasi"
    );

    // Jarak aman dari header atas
    assert.match(
      kintsugiCss,
      /\.overlay\s*\{[^}]*safe-area-inset-top/i,
      "Overlay harus memperhitungkan safe-area-inset-top untuk memberi jarak dari header/notch"
    );
  });

  // 3. Ruang di Bagian Bawah agar Tidak Tertutup Bottom Nav
  await t.test("Konten terakhir memiliki padding bawah yang cukup dan memperhitungkan safe-area-inset-bottom", () => {
    assert.match(
      kintsugiCss,
      /\.detail-info\s*\{[^}]*safe-area-inset-bottom/i,
      "Detail info harus memiliki padding bawah yang memperhitungkan safe-area-inset-bottom"
    );
    assert.match(
      kintsugiCss,
      /\.overlay\s*\{[^}]*safe-area-inset-bottom/i,
      "Overlay harus memiliki padding bawah agar modal tidak tertutup bottom nav"
    );
  });

  // 4. Kerapian Tipografi dan Tata Letak
  await t.test("Jarak dan kontras teks proporsional dan mudah dibaca", () => {
    assert.match(
      kintsugiCss,
      /\.detail-info\s*h1\s*\{[^}]*font-size:\s*21px/i,
      "Judul produk harus memiliki ukuran font yang nyaman dibaca pada layar ponsel"
    );
    assert.match(
      kintsugiCss,
      /\.detail-price\s*\{[^}]*font-size:\s*22px/i,
      "Harga produk harus jelas dan kontras"
    );
  });

  // 5. Tampilan Desktop Tetap Tidak Berubah
  await t.test("Tampilan desktop tetap menggunakan grid 2 kolom dan min-height 600px", () => {
    assert.match(
      stylesCss,
      /\.product-dialog\s*\{[^}]*grid-template-columns:\s*1fr\s*1fr/i,
      "Desktop harus tetap menggunakan layout 2 kolom (grid 1fr 1fr)"
    );
    assert.match(
      stylesCss,
      /\.detail-image\s*\{[^}]*min-height:\s*600px/i,
      "Desktop harus tetap menggunakan min-height 600px untuk gambar produk"
    );
  });

  // 6. Fungsi Pembelian dan Interaksi Modal Tetap Berfungsi Penuh
  await t.test("Fungsi pembelian, variasi, dan tombol pada productDialog di main.jsx tetap utuh", () => {
    assert.ok(mainJsx.includes("onAddToCart="), "Handler add to cart harus ada");
    assert.ok(mainJsx.includes("purchaseIntent === 'buy'"), "Pilihan beli langsung vs keranjang harus aktif");
    assert.ok(mainJsx.includes("toggleWish(detail.id)"), "Toggle wishlist harus tetap berfungsi");
    assert.ok(mainJsx.includes("colorLabel(color)"), "Pilihan varian warna tetap berfungsi");
    assert.ok(mainJsx.includes("dimensionLabel(s)"), "Pilihan ukuran dimensi tetap berfungsi");
  });
});

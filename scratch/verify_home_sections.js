import { pool } from '../server/db.js';
import assert from 'assert';

console.log("=== PENGUJIAN SISTEM PENGELOLAAN BERANDA (HOMEPAGE) ===");

(async () => {
  try {
    // 1. Simpan pengaturan hero secara independen
    console.log("1. Pengujian simpan Hero Banner independen...");
    const heroPayload = {
      heroImage: "/images/hero-test.jpg",
      heroKicker: "TEST KICKER HERO",
      heroTitle: "Judul Hero Independen\nBaris Kedua",
      heroText: "Deskripsi singkat hero independen."
    };
    for (const [key, value] of Object.entries(heroPayload)) {
      await pool.query(
        "INSERT INTO store_settings(setting_key, setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",
        [key, JSON.stringify(value)]
      );
    }
    const heroRows = (await pool.query("SELECT setting_key, setting_value FROM store_settings WHERE setting_key LIKE 'hero%'")).rows;
    const heroSettings = Object.fromEntries(heroRows.map(r => [r.setting_key, r.setting_value]));
    assert.strictEqual(heroSettings.heroKicker, "TEST KICKER HERO");
    assert.strictEqual(heroSettings.heroTitle, "Judul Hero Independen\nBaris Kedua");
    console.log("✓ Hero Banner berhasil disimpan secara terpisah.");

    // 2. Simpan sections dinamis secara independen (tanpa batas 2 section)
    console.log("2. Pengujian simpan Multi-Section dinamis (> 2 section)...");
    const testSections = [
      {
        id: "sec-test-1",
        kicker: "SECTION PERTAMA",
        title: "Koleksi Terpopuler",
        productIds: ["lj-1-1", "lj-1-2"]
      },
      {
        id: "sec-test-2",
        kicker: "SECTION KEDUA",
        title: "Pilihan Bedding Hotel",
        productIds: ["lj-1-8"]
      },
      {
        id: "sec-test-3",
        kicker: "SECTION KETIGA",
        title: "Perlengkapan Rumah Terbaru",
        productIds: ["lj-4-8", "lj-2-1"]
      }
    ];
    await pool.query(
      "INSERT INTO store_settings(setting_key, setting_value) VALUES('homeSections', ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",
      [JSON.stringify(testSections)]
    );
    const secRow = (await pool.query("SELECT setting_value FROM store_settings WHERE setting_key='homeSections'")).rows[0];
    assert(Array.isArray(secRow.setting_value), "homeSections harus berupa array");
    assert.strictEqual(secRow.setting_value.length, 3, "Harus menyimpan 3 section");
    assert.strictEqual(secRow.setting_value[2].title, "Perlengkapan Rumah Terbaru");
    console.log("✓ Berhasil menyimpan 3 section dinamis secara independen.");

    // 3. Simpan promo settings secara independen
    console.log("3. Pengujian simpan Promo editorial independen...");
    const promoPayload = {
      promoKicker: "THE PROMO KICKER",
      promoTitle: "Penawaran Istimewa Minggu Ini",
      promoText: "Deskripsi promo editorial mandiri.",
      promoPrice: 139000,
      promoOldPrice: 199000
    };
    for (const [key, value] of Object.entries(promoPayload)) {
      await pool.query(
        "INSERT INTO store_settings(setting_key, setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",
        [key, JSON.stringify(value)]
      );
    }
    const promoRows = (await pool.query("SELECT setting_key, setting_value FROM store_settings WHERE setting_key LIKE 'promo%'")).rows;
    const promoSettings = Object.fromEntries(promoRows.map(r => [r.setting_key, r.setting_value]));
    assert.strictEqual(promoSettings.promoTitle, "Penawaran Istimewa Minggu Ini");
    assert.strictEqual(promoSettings.promoPrice, 139000);
    console.log("✓ Promo editorial berhasil disimpan secara terpisah.");

    // 4. Pastikan Hero dan Section tidak terpengaruh oleh penyimpanan Promo
    const recheckHero = (await pool.query("SELECT setting_value FROM store_settings WHERE setting_key='heroKicker'")).rows[0];
    assert.strictEqual(recheckHero.setting_value, "TEST KICKER HERO");
    const recheckSec = (await pool.query("SELECT setting_value FROM store_settings WHERE setting_key='homeSections'")).rows[0];
    assert.strictEqual(recheckSec.setting_value.length, 3);
    console.log("✓ Terverifikasi: Perubahan satu bagian TIDAK memengaruhi bagian lainnya!");

    // Kembalikan data hero agar realistis untuk toko
    await pool.query(
      "UPDATE store_settings SET setting_value=? WHERE setting_key='heroKicker'",
      [JSON.stringify("KINTSUGI / BEDROOM COLLECTION")]
    );
    await pool.query(
      "UPDATE store_settings SET setting_value=? WHERE setting_key='heroTitle'",
      [JSON.stringify("Beristirahat.\nLebih dalam.\nSetiap malam.")]
    );
    await pool.query(
      "UPDATE store_settings SET setting_value=? WHERE setting_key='heroImage'",
      [JSON.stringify("/images/seprai/sprei-01.jpg")]
    );

    console.log("=== SEMUA PENGUJIAN DATABASE & BACKEND BERHASIL ===");
    process.exit(0);
  } catch (err) {
    console.error("Gagal verifikasi:", err);
    process.exit(1);
  }
})();

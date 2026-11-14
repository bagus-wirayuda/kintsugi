import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { databaseConfig } from "../server/db.js";
import { normalizePhone } from "../server/integrations.js";

async function cleanDatabaseForRelease() {
  const config = databaseConfig();
  console.log(`Menghubungkan ke database MySQL '${config.database}' pada ${config.host}:${config.port}...`);

  const db = await mysql.createConnection(config);

  try {
    console.log("\n=======================================================");
    console.log("  PEMBERSIHAN TOTAL DATABASE PT LINY JAYA UNTUK RILIS   ");
    console.log("=======================================================\n");

    await db.query("SET FOREIGN_KEY_CHECKS = 0");

    // 1. Bersihkan transaksi dan pesanan
    console.log("1. Mengosongkan tabel transaksi, pesanan & log pembayaran...");
    await db.query("TRUNCATE TABLE payment_events");
    await db.query("TRUNCATE TABLE order_items");
    await db.query("TRUNCATE TABLE orders");
    console.log("   ✓ payment_events, order_items, orders dikosongkan (0 baris).");

    // 2. Bersihkan catatan keuangan dummy
    console.log("2. Mengosongkan tabel beban & pengeluaran toko...");
    await db.query("TRUNCATE TABLE store_expenses");
    console.log("   ✓ store_expenses dikosongkan (0 baris).");

    // 3. Bersihkan log antrian komunikasi & subscriber
    console.log("3. Mengosongkan antrian pesan, tantangan auth, profil, dan sesi...");
    await db.query("TRUNCATE TABLE wa_outbox");
    await db.query("TRUNCATE TABLE email_outbox");
    await db.query("TRUNCATE TABLE newsletter_subscribers");
    await db.query("TRUNCATE TABLE auth_challenges");
    await db.query("TRUNCATE TABLE sessions");
    await db.query("TRUNCATE TABLE customer_profiles");
    console.log("   ✓ wa_outbox, email_outbox, newsletter_subscribers, auth_challenges, sessions, customer_profiles dikosongkan (0 baris).");

    // 4. Bersihkan promosi toko
    console.log("4. Mengosongkan promo toko...");
    await db.query("TRUNCATE TABLE store_promotions");
    console.log("   ✓ store_promotions dikosongkan (0 baris).");

    // 5. Bersihkan seluruh produk, varian, dan kategori katalog demo
    console.log("5. Mengosongkan seluruh katalog produk, variasi, dan kategori demo...");
    await db.query("TRUNCATE TABLE product_variants");
    await db.query("TRUNCATE TABLE products");
    await db.query("TRUNCATE TABLE product_categories");
    console.log("   ✓ product_variants, products, product_categories dikosongkan (0 baris).");

    // 6. Bersihkan user dummy & sisakan HANYA user Admin resmi
    console.log("6. Mengosongkan user non-admin & memverifikasi akun Admin tunggal...");
    const adminEmail = (process.env.ADMIN_EMAIL || "admin@linyjaya.test").trim().toLowerCase();
    const adminPhone = normalizePhone(process.env.ADMIN_PHONE || "6281111111111");
    const adminPassword = process.env.ADMIN_PASSWORD || "AdminLinyJaya2026!";
    const adminHash = await bcrypt.hash(adminPassword, 12);

    // Hapus seluruh pengguna selain admin resmi
    await db.query("DELETE FROM users WHERE email != ? OR role != 'admin'", [adminEmail]);

    // Pastikan user admin resmi tersedia dengan data kredensial yang valid
    const [existingAdmin] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [adminEmail]);
    let adminId = existingAdmin[0]?.id;

    if (!adminId) {
      adminId = randomUUID();
      await db.query(
        "INSERT INTO users (id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'admin')",
        [adminId, "Admin PT Liny Jaya", adminEmail, adminPhone, adminHash]
      );
      console.log(`   ✓ Akun Admin dibuat baru: ${adminEmail} (Role: admin)`);
    } else {
      await db.query(
        "UPDATE users SET name = 'Admin PT Liny Jaya', phone = ?, password_hash = ?, role = 'admin' WHERE id = ?",
        [adminPhone, adminHash, adminId]
      );
      console.log(`   ✓ Akun Admin diverifikasi: ${adminEmail} (Role: admin)`);
    }

    // 7. Reset referensi produk lama & konten demo pada store_settings
    console.log("7. Mengosongkan banner hero, promo, dan konten demo pada pengaturan toko...");
    const emptyStringSettings = [
      'heroImage', 'heroKicker', 'heroTitle', 'heroText',
      'promoImage', 'promoKicker', 'promoTitle', 'promoText', 'promoProductId',
      'departmentKicker', 'departmentTitle', 'essentialsKicker', 'essentialsTitle',
      'announcementText', 'storeAddress', 'pickupInfo', 'logo'
    ];
    for (const key of emptyStringSettings) {
      await db.query("UPDATE store_settings SET setting_value = ? WHERE setting_key = ?", [JSON.stringify(""), key]);
    }
    await db.query("UPDATE store_settings SET setting_value = ? WHERE setting_key = 'promoPrice'", [JSON.stringify(0)]);
    await db.query("UPDATE store_settings SET setting_value = ? WHERE setting_key = 'promoOldPrice'", [JSON.stringify(0)]);
    await db.query("UPDATE store_settings SET setting_value = ? WHERE setting_key = 'brand'", [JSON.stringify("PT Liny Jaya")]);
    await db.query("UPDATE store_settings SET setting_value = ? WHERE setting_key = 'contactEmail'", [JSON.stringify(adminEmail)]);
    await db.query("UPDATE store_settings SET setting_value = ? WHERE setting_key = 'contactPhone'", [JSON.stringify(adminPhone)]);
    await db.query(
      "UPDATE store_settings SET setting_value = ? WHERE setting_key IN ('departmentProducts', 'essentialsProducts', 'homeSections')",
      [JSON.stringify([])]
    );
    console.log("   ✓ Pengaturan toko (store_settings) dibersihkan total dari seluruh banner hero dan promo demo.");

    await db.query("SET FOREIGN_KEY_CHECKS = 1");

    // 8. Verifikasi akhir seluruh tabel database
    console.log("\n=======================================================");
    console.log("         STATUS SELURUH TABEL DATABASE SAAT INI        ");
    console.log("=======================================================");
    const [tables] = await db.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [config.database]);

    for (const row of tables) {
      const [countResult] = await db.query(`SELECT COUNT(*) as cnt FROM \`${row.TABLE_NAME}\``);
      const actualCount = countResult[0].cnt;
      console.log(` - ${row.TABLE_NAME.padEnd(25)}: ${actualCount} baris`);
    }

    console.log("\n✓ SELURUH DATABASE BERHASIL DIKOSONGKAN SECARA TOTAL!");
    console.log(`✓ SATU-SATUNYA USER YANG TERSISA:`);
    const [users] = await db.query("SELECT id, name, email, phone, role FROM users");
    console.table(users);

  } catch (err) {
    console.error("Gagal membersihkan database:", err);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

cleanDatabaseForRelease();

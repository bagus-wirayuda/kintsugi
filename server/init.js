import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool, databaseConfig } from "./db.js";
import { products } from "../src/data.js";
import { normalizePhone } from "./integrations.js";
import { parseDimensions } from "../src/dimensions.js";
import { catalogCategories } from "../src/catalog.js";
import { paymentMethods } from "../src/payment-methods.js";

const dimensionSize = (value) => {
  const d = parseDimensions(value);
  if (!d) return { size: String(value).trim(), length: 0, width: 0, height: 0 };
  return { size: `${d.length}×${d.width}×${d.height}`, ...d };
};

function seedProductDetails(product) {
  const name = product.name.toLowerCase();
  const motif = name.includes("dino") ? "Dinosaurus" : name.includes("bintang") || name.includes("moon") || name.includes("cloud") ? "Langit & bintang" : name.includes("animal") || name.includes("safari") || name.includes("bear") ? "Karakter" : name.includes("floral") || name.includes("botanical") || name.includes("daisy") ? "Floral" : name.includes("kotak") || name.includes("gingham") ? "Kotak" : name.includes("geometrik") ? "Geometrik" : name.includes("stripe") || name.includes("dobby") ? "Stripe" : name.includes("rumbai") || name.includes("rempel") ? "Rumbai" : name.includes("quilted") ? "Quilted" : name.includes("embos") ? "Embos" : name.includes("waterproof") || name.includes("anti air") ? "Waterproof" : name.includes("motif") ? "Motif dekoratif" : "Polos";
  const weightGrams = product.category === "Sarung Bantal & Guling" ? 450 : product.category === "Pelindung Kasur" ? 1100 : product.category === "Set Sprei" ? 1700 : name.includes("bayi") || name.includes("baby") ? 700 : 1000;
  return { costPrice: Math.round(product.price * 0.58 / 1000) * 1000, motif, weightGrams };
}

function stableDemoStock(productId, size, color) {
  const seed = `${productId}|${size}|${color}`;
  const hash = [...seed].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
  return 8 + (hash % 32);
}

async function syncSepraiCatalog(target) {
  const client = await target.connect();
  try {
    await client.query("START TRANSACTION");
    for (const p of products) {
      const details = seedProductDetails(p);
      await client.query(
        `INSERT INTO products(id,sku,name,category,price,old_price,cost_price,variation_label,motif,weight_grams,image,description,rating,reviews,is_new,active)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
         ON DUPLICATE KEY UPDATE id=VALUES(id)`,
        [
          p.id,
          p.sku,
          p.name,
          p.category,
          p.price,
          p.oldPrice,
          details.costPrice,
          "Warna",
          details.motif,
          details.weightGrams,
          p.image,
          p.description,
          p.rating,
          p.reviews,
          p.isNew,
        ],
      );
      for (const size of p.sizes) {
        const d = dimensionSize(size);
        for (const color of p.colors) {
          await client.query(
            "INSERT IGNORE INTO product_variants(product_id,size,length_cm,width_cm,height_cm,color,stock) VALUES(?,?,?,?,?,?,?)",
            [p.id, d.size, d.length, d.width, d.height, color, stableDemoStock(p.id, d.size, color)],
          );
        }
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function initialize(target = pool, seed = true) {
  const source = await readFile(
    new URL("../database/schema.sql", import.meta.url),
    "utf8",
  );
  for (const sql of source.split(";").filter((s) => s.trim()))
    await target.query(sql);

  await target.query(
    "CREATE TABLE IF NOT EXISTS app_migrations (id VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  const extensibleStoreMigration = (await target.query(
    "SELECT id FROM app_migrations WHERE id=?",
    ["2026_extensible_store_roles_catalog"],
  )).rows[0];
  if (!extensibleStoreMigration) {
    const ensureColumn = async (table, name, sql) => {
      const columns = (await target.query(`SHOW COLUMNS FROM ${table}`)).rows;
      if (!columns.some((column) => column.Field === name))
        await target.query(`ALTER TABLE ${table} ADD COLUMN ${sql}`);
    };
    await target.query("ALTER TABLE users MODIFY role VARCHAR(20) NOT NULL DEFAULT 'customer'");
    await ensureColumn("products", "cost_price", "cost_price INT NOT NULL DEFAULT 0");
    await ensureColumn("products", "variation_label", "variation_label VARCHAR(80) NOT NULL DEFAULT 'Warna'");
    await ensureColumn("products", "motif", "motif VARCHAR(100) NOT NULL DEFAULT ''");
    await ensureColumn("products", "weight_grams", "weight_grams INT UNSIGNED NOT NULL DEFAULT 1000");
    await ensureColumn("product_variants", "image_url", "image_url TEXT NULL");
    await target.query("ALTER TABLE product_variants MODIFY color VARCHAR(100) NOT NULL");
    await ensureColumn("orders", "shipping_name", "shipping_name VARCHAR(150) NOT NULL DEFAULT ''");
    await ensureColumn("orders", "tracking_number", "tracking_number VARCHAR(100) NOT NULL DEFAULT ''");
    await target.query("ALTER TABLE orders MODIFY shipping VARCHAR(100) NOT NULL");
    await target.query("ALTER TABLE orders MODIFY payment VARCHAR(60) NOT NULL DEFAULT 'xendit'");
    await target.query("ALTER TABLE order_items MODIFY color VARCHAR(100) NOT NULL");
    await ensureColumn("order_items", "cost_price", "cost_price INT NOT NULL DEFAULT 0");
    await ensureColumn("order_items", "variation_label", "variation_label VARCHAR(80) NOT NULL DEFAULT 'Variasi'");
    for (const category of catalogCategories) {
      await target.query(
        "INSERT IGNORE INTO product_categories(id,name,sort_order) VALUES(?,?,?)",
        [category.id, category.label, catalogCategories.indexOf(category)],
      );
    }
    for (const [index, method] of paymentMethods.entries()) {
      await target.query(
        "INSERT IGNORE INTO store_payment_methods(id,name,group_name,detail,enabled,sort_order) VALUES(?,?,?,?,TRUE,?)",
        [method.id, method.name, method.group, method.detail, index],
      );
    }
    const defaults = {
      brand: "Kintsugi",
      announcementText: "Ruang tidur yang tenang, dimulai dari tekstil yang baik.",
      contactEmail: process.env.STORE_CONTACT_EMAIL || "wirayuda101101@gmail.com",
      storeAddress: "",
      logo: "/brand/kintsugi-logo-transparent-v2.png",
      heroImage: "/images/seprai/sprei-01.jpg",
      heroKicker: "KINTSUGI / BEDROOM COLLECTION",
      heroTitle: "Beristirahat. Lebih dalam. Setiap malam.",
      heroText: "Tekstil kamar yang lembut untuk menjaga setiap momen istirahat.",
      departmentKicker: "TEMUKAN PILIHAN ANDA",
      departmentTitle: "Untuk setiap ruang. Untuk istirahat yang utuh.",
      essentialsKicker: "SLEEP ESSENTIALS",
      essentialsTitle: "Pilihan untuk tidur yang lebih baik.",
      essentialsProducts: [],
      departmentProducts: [],
      promoKicker: "THE KINTSUGI WAY",
      promoTitle: "Keindahan ada di setiap cerita.",
      promoText: "Pilihan tekstil kamar yang lembut untuk ruang istirahat Anda.",
      promoImage: "/images/seprai/sprei-16.jpg",
      promoProductId: "",
      promoPrice: 0,
      promoOldPrice: 0,
      localDeliveryFee: 15000,
      packageWeightGrams: 1000,
      rajaOriginId: "",
      waTemplates: {
        purchased: "Halo [nama], pembayaran pesanan [nomor_pesanan] berhasil dan sedang kami proses. Total: [total].",
        shipped: "Halo [nama], pesanan [nomor_pesanan] telah dikirim. Nomor resi: [nomor_resi]. Kurir: [kurir].",
        delivered: "Halo [nama], pesanan [nomor_pesanan] telah sampai. Terima kasih telah berbelanja di [toko].",
        processing: "Halo [nama], pesanan [nomor_pesanan] sedang kami siapkan. Terima kasih telah berbelanja di [toko].",
      },
    };
    for (const [key, value] of Object.entries(defaults))
      await target.query("INSERT IGNORE INTO store_settings(setting_key,setting_value) VALUES(?,?)", [key, JSON.stringify(value)]);
    await target.query("INSERT INTO app_migrations(id) VALUES(?)", ["2026_extensible_store_roles_catalog"]);
  }
  await target.query(
    "INSERT IGNORE INTO store_settings(setting_key,setting_value) VALUES(?,?)",
    ["announcementText", JSON.stringify("Ruang tidur yang tenang, dimulai dari tekstil yang baik.")],
  );
  const dimensionMigration = (await target.query(
    "SELECT id FROM app_migrations WHERE id=?",
    ["2026_seprai_dimensions_categories"],
  )).rows[0];
  if (!dimensionMigration) {
  // Migrasi bertahap mempertahankan stok dan pesanan lama sambil menyimpan ukuran sebagai trio dimensi.
  for (const table of ["product_variants", "order_items"]) {
    const columns = (await target.query(`SHOW COLUMNS FROM ${table}`)).rows;
    const names = new Set(columns.map((column) => column.Field));
    if (!names.has("length_cm"))
      await target.query(`ALTER TABLE ${table} ADD COLUMN length_cm SMALLINT UNSIGNED NOT NULL DEFAULT 0`);
    if (!names.has("width_cm"))
      await target.query(`ALTER TABLE ${table} ADD COLUMN width_cm SMALLINT UNSIGNED NOT NULL DEFAULT 0`);
    if (!names.has("height_cm"))
      await target.query(`ALTER TABLE ${table} ADD COLUMN height_cm SMALLINT UNSIGNED NOT NULL DEFAULT 0`);
    await target.query(`ALTER TABLE ${table} MODIFY size VARCHAR(30) NOT NULL`);
  }
  const legacyVariants = (await target.query("SELECT product_id,size,color,stock FROM product_variants")).rows;
  for (const row of legacyVariants) {
    const d = dimensionSize(row.size);
    if (row.size !== d.size) {
      const duplicate = (await target.query(
        "SELECT stock FROM product_variants WHERE product_id=? AND size=? AND color=?",
        [row.product_id, d.size, row.color],
      )).rows[0];
      if (duplicate) {
        await target.query(
          "UPDATE product_variants SET stock=stock+? WHERE product_id=? AND size=? AND color=?",
          [row.stock, row.product_id, d.size, row.color],
        );
        await target.query(
          "DELETE FROM product_variants WHERE product_id=? AND size=? AND color=?",
          [row.product_id, row.size, row.color],
        );
      } else {
        await target.query(
          "UPDATE product_variants SET size=?,length_cm=?,width_cm=?,height_cm=? WHERE product_id=? AND size=? AND color=?",
          [d.size, d.length, d.width, d.height, row.product_id, row.size, row.color],
        );
      }
    } else {
      await target.query(
        "UPDATE product_variants SET length_cm=?,width_cm=?,height_cm=? WHERE product_id=? AND size=? AND color=?",
        [d.length, d.width, d.height, row.product_id, row.size, row.color],
      );
    }
  }
  const legacyItems = (await target.query("SELECT id,size FROM order_items")).rows;
  for (const row of legacyItems) {
    const d = dimensionSize(row.size);
    await target.query(
      "UPDATE order_items SET size=?,length_cm=?,width_cm=?,height_cm=? WHERE id=?",
      [d.size, d.length, d.width, d.height, row.id],
    );
  }
  await target.query(`UPDATE products SET category=CASE category
    WHEN 'T-Shirt' THEN 'Sprei Fitted' WHEN 'Kemeja & Blus' THEN 'Set Sprei'
    WHEN 'Celana' THEN 'Sprei Karet' WHEN 'Luaran' THEN 'Sprei Hotel'
    WHEN 'Sweater & Cardigan' THEN 'Sarung Bantal & Guling'
    WHEN 'Rok & Gaun' THEN 'Sprei Motif' WHEN 'Aksesoris' THEN 'Pelindung Kasur'
    ELSE category END`);
  await target.query("INSERT INTO app_migrations(id) VALUES(?)", ["2026_seprai_dimensions_categories"]);
  }

  const taxonomyMigration = (await target.query(
    "SELECT id FROM app_migrations WHERE id=?",
    ["2026_seprai_product_categories"],
  )).rows[0];
  if (!taxonomyMigration) {
    await target.query("UPDATE products SET category='Sprei Motif' WHERE category='Sprei Anak'");
    await target.query(`UPDATE products SET category=CASE category
      WHEN 'T-Shirt' THEN 'Sprei Fitted' WHEN 'Kemeja & Blus' THEN 'Set Sprei'
      WHEN 'Celana' THEN 'Sprei Karet' WHEN 'Luaran' THEN 'Sprei Hotel'
      WHEN 'Sweater & Cardigan' THEN 'Sarung Bantal & Guling'
      WHEN 'Rok & Gaun' THEN 'Sprei Motif' WHEN 'Aksesoris' THEN 'Pelindung Kasur'
      ELSE category END`);
    const genderColumn = (await target.query("SHOW COLUMNS FROM products LIKE 'gender'")).rows[0];
    if (genderColumn) {
      const indexes = (await target.query("SHOW INDEX FROM products")).rows;
      const genderIndexes = [...new Set(indexes.filter((index) => index.Column_name === "gender").map((index) => index.Key_name))];
      for (const index of genderIndexes)
        await target.query(`ALTER TABLE products DROP INDEX \`${index.replaceAll("`", "``")}\``);
      await target.query("ALTER TABLE products DROP COLUMN gender");
    }
    const categoryIndex = (await target.query("SHOW INDEX FROM products WHERE Column_name='category'")).rows[0];
    if (!categoryIndex) await target.query("ALTER TABLE products ADD INDEX idx_products_category (category)");
    await target.query("INSERT INTO app_migrations(id) VALUES(?)", ["2026_seprai_product_categories"]);
  }

  // NULL mempertahankan akun email lama tanpa benturan indeks unik
  const userPhone = (await target.query("SHOW COLUMNS FROM users LIKE 'phone'"))
    .rows[0];
  if (!userPhone)
    await target.query(
      "ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL DEFAULT NULL AFTER email",
    );
  else if (userPhone.Null !== "YES")
    await target.query(
      "ALTER TABLE users MODIFY phone VARCHAR(20) NULL DEFAULT NULL",
    );
  await target.query("UPDATE users SET phone=NULL WHERE phone=''");
  if (
    !(
      await target.query(
        "SHOW INDEX FROM users WHERE Column_name='phone' AND Non_unique=0",
      )
    ).rows.length
  )
    await target.query("ALTER TABLE users ADD UNIQUE INDEX idx_phone (phone)");

  const userEmail = (await target.query("SHOW COLUMNS FROM users LIKE 'email'"))
    .rows[0];
  if (userEmail?.Null !== "YES")
    await target.query(
      "ALTER TABLE users MODIFY email VARCHAR(254) NULL DEFAULT NULL",
    );

  const authPhone = (
    await target.query("SHOW COLUMNS FROM auth_challenges LIKE 'phone'")
  ).rows[0];
  if (!authPhone)
    await target.query(
      "ALTER TABLE auth_challenges ADD COLUMN phone VARCHAR(20) NULL DEFAULT NULL AFTER id",
    );
  else if (authPhone.Null !== "YES")
    await target.query(
      "ALTER TABLE auth_challenges MODIFY phone VARCHAR(20) NULL DEFAULT NULL",
    );
  await target.query("UPDATE auth_challenges SET phone=NULL WHERE phone=''");
  if (
    !(
      await target.query(
        "SHOW INDEX FROM auth_challenges WHERE Column_name='phone' AND Non_unique=0",
      )
    ).rows.length
  )
    await target.query(
      "ALTER TABLE auth_challenges ADD UNIQUE INDEX idx_phone_purpose (phone,purpose)",
    );

  const authEmail = (
    await target.query("SHOW COLUMNS FROM auth_challenges LIKE 'email'")
  ).rows[0];
  if (authEmail?.Null === "NO")
    await target.query(
      "ALTER TABLE auth_challenges MODIFY email VARCHAR(254) NULL DEFAULT NULL",
    );

  // Sinkronisasi katalog seprai
  await syncSepraiCatalog(target);

  if (!seed) return;
  const client = await target.connect();
  try {
    await client.query("START TRANSACTION");

    const adminEmail = process.env.ADMIN_EMAIL || "admin@linyjaya.test";
    const adminPhone = normalizePhone(process.env.ADMIN_PHONE || "6281111111111");
    const adminPassword = process.env.ADMIN_PASSWORD || "AdminLinyJaya2026!";

    const customerEmail = "pelanggan@linyjaya.test";
    const customerPhone = "6282222222222";
    const customerPassword = "BelanjaLiny2026!";

    const accounts = [
      [adminEmail, adminPhone, adminPassword, "Admin Liny Jaya", "admin"],
      [customerEmail, customerPhone, customerPassword, "Pelanggan Liny Jaya", "customer"],
    ];

    for (const [email, phone, password, name, role] of accounts) {
      if (password.length < 12)
        throw new Error("Password seed minimal 12 karakter.");
      await client.query(
        `INSERT INTO users(id,name,email,phone,password_hash,role)
         VALUES(?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE phone=VALUES(phone),name=VALUES(name)`,
        [
          randomUUID(),
          name,
          email.toLowerCase(),
          phone,
          await bcrypt.hash(password, 12),
          role,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/server/init.js")) {
  try {
    const config = databaseConfig();
    const connection = await mysql.createConnection({
      ...config,
      database: undefined,
    });
    await connection.query(
      "CREATE DATABASE IF NOT EXISTS `" +
        config.database +
        "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    );
    await connection.end();
    await initialize();
    console.log(
      "Database MySQL " +
        config.database +
        " siap: 32 produk katalog sprei spring bed, varian lengkap, akun admin dan pelanggan demo.",
    );
  } catch (e) {
    console.error("Inisialisasi gagal:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

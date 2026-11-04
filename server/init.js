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
  const homeSectionsRow = (await target.query(
    "SELECT setting_value FROM store_settings WHERE setting_key='homeSections'"
  )).rows[0];
  if (!homeSectionsRow) {
    const essentialsRow = (await target.query("SELECT setting_value FROM store_settings WHERE setting_key='essentialsProducts'")).rows[0];
    const kickerRow = (await target.query("SELECT setting_value FROM store_settings WHERE setting_key='essentialsKicker'")).rows[0];
    const titleRow = (await target.query("SELECT setting_value FROM store_settings WHERE setting_key='essentialsTitle'")).rows[0];
    const initialSections = [
      {
        id: "section-1",
        kicker: (kickerRow?.setting_value && typeof kickerRow.setting_value === "string") ? kickerRow.setting_value : "SLEEP ESSENTIALS",
        title: (titleRow?.setting_value && typeof titleRow.setting_value === "string") ? titleRow.setting_value : "Pilihan untuk tidur yang lebih baik.",
        productIds: Array.isArray(essentialsRow?.setting_value) && essentialsRow.setting_value.length ? essentialsRow.setting_value : ["lj-1-1", "lj-1-2", "lj-1-8", "lj-2-1"]
      }
    ];
    await target.query(
      "INSERT IGNORE INTO store_settings(setting_key,setting_value) VALUES(?,?)",
      ["homeSections", JSON.stringify(initialSections)]
    );
  }
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

  const hierarchyMigration = (await target.query(
    "SELECT id FROM app_migrations WHERE id=?",
    ["2026_hierarchical_catalog_categories"],
  )).rows[0];
  if (!hierarchyMigration) {
    const catCols = (await target.query("SHOW COLUMNS FROM product_categories")).rows;
    if (!catCols.some((col) => col.Field === "parent_id")) {
      await target.query("ALTER TABLE product_categories ADD COLUMN parent_id VARCHAR(80) NULL DEFAULT NULL AFTER name");
      await target.query("ALTER TABLE product_categories ADD INDEX idx_parent_id (parent_id)");
    }
    // Drop unique index on name if it exists to allow flexibility with subcategories
    const catIndexes = (await target.query("SHOW INDEX FROM product_categories WHERE Key_name='idx_category_name'")).rows;
    if (catIndexes.length) {
      await target.query("ALTER TABLE product_categories DROP INDEX idx_category_name");
    }

    const prodCols = (await target.query("SHOW COLUMNS FROM products")).rows;
    if (!prodCols.some((col) => col.Field === "subcategory")) {
      await target.query("ALTER TABLE products ADD COLUMN subcategory VARCHAR(100) NOT NULL DEFAULT '' AFTER category");
      await target.query("ALTER TABLE products ADD INDEX idx_subcategory (subcategory)");
    }

    // Seed hierarchical categories
    for (const [index, cat] of catalogCategories.entries()) {
      await target.query(
        `INSERT INTO product_categories(id,name,parent_id,active,sort_order)
         VALUES(?,?,?,1,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), parent_id=VALUES(parent_id), active=1, sort_order=VALUES(sort_order)`,
        [cat.id, cat.name || cat.label, cat.parentId || null, index],
      );
    }

    // Update existing seprai products so subcategory = old category, and main category = 'seprai'
    await target.query(`UPDATE products SET subcategory = category WHERE subcategory = '' OR subcategory IS NULL`);
    await target.query(`UPDATE products SET category = 'seprai' WHERE category IN ('Sprei Fitted','Set Sprei','Sprei Karet','Sprei Hotel','Sarung Bantal & Guling','Sprei Motif','Pelindung Kasur')`);

    // Insert sample Fashion & Home Living products
    const sampleFashionAndHome = [
      {
        id: "lj-fashion-1",
        sku: "KTS-FSH-01",
        name: "Kaos Polos Cotton Combed 24s Premium Soft",
        category: "fashion",
        subcategory: "fashion-kaos",
        price: 69000,
        oldPrice: 89000,
        costPrice: 38000,
        image: "/images/tshirt.jpg",
        description: "Kaos oblong polos berbahan 100% cotton combed 24s gramasi tebal tidak menerawang, menyerap keringat maksimal, dan lembut di kulit. Jahitan rantai standar distro.",
        colors: ["Hitam", "Putih Ivory", "Hijau Sage", "Navy Gelap"],
        sizes: ["S", "M", "L", "XL", "XXL"],
        weightGrams: 220,
        variationLabel: "Warna",
        motif: "Polos",
      },
      {
        id: "lj-fashion-kaos-2",
        sku: "KTS-FSH-01B",
        name: "Kaos Heavyweight Oversize 20s Streetwear",
        category: "fashion",
        subcategory: "fashion-kaos",
        price: 89000,
        oldPrice: 119000,
        costPrice: 42000,
        image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=85",
        description: "Kaos potongan boxy oversize berbahan 100% cotton combed 20s tebal, kokoh, dan tidak tembus pandang. Gaya streetwear modern dengan rib leher rapat.",
        colors: ["Hitam", "Putih", "Hijau Sage", "Abu Charcoal"],
        sizes: ["M", "L", "XL", "XXL"],
        weightGrams: 280,
        variationLabel: "Warna",
        motif: "Polos Boxy",
      },
      {
        id: "lj-fashion-kaos-3",
        sku: "KTS-FSH-01C",
        name: "Kaos Polo Pique Katun Kerah Casual Pria",
        category: "fashion",
        subcategory: "fashion-kaos",
        price: 115000,
        oldPrice: 145000,
        costPrice: 55000,
        image: "https://images.unsplash.com/photo-1625910513413-5bc2174c3e80?auto=format&fit=crop&w=900&q=85",
        description: "Baju polo berkerah dengan rajutan pique katun sejuk berpori udara. Memberi tampilan rapi semi-kasual untuk acara santai maupun kantor santai.",
        colors: ["Navy Gelap", "Putih", "Hitam", "Maroon"],
        sizes: ["S", "M", "L", "XL"],
        weightGrams: 260,
        variationLabel: "Warna",
        motif: "Pique Waffle",
      },
      {
        id: "lj-fashion-kaos-4",
        sku: "KTS-FSH-01D",
        name: "Kaos Henley Katun Slub Kancing Tiga",
        category: "fashion",
        subcategory: "fashion-kaos",
        price: 95000,
        oldPrice: 125000,
        costPrice: 45000,
        image: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=900&q=85",
        description: "Kaos kerah henley tanpa kerah lipat dengan aksen 3 kancing kayu. Berbahan katun slub tekstur unik yang lentur dan sangat adem.",
        colors: ["Oatmeal Beige", "Biru Indigo", "Hijau Zaitun"],
        sizes: ["M", "L", "XL"],
        weightGrams: 230,
        variationLabel: "Warna",
        motif: "Tekstur Slub",
      },
      {
        id: "lj-fashion-2",
        sku: "KTS-FSH-02",
        name: "Kemeja Linen Kerah Shanghai Casual Pria",
        category: "fashion",
        subcategory: "fashion-kemeja",
        price: 159000,
        oldPrice: 199000,
        costPrice: 85000,
        image: "/images/linen.jpg",
        description: "Kemeja santai kerah sanghai dengan bahan katun linen rami bertekstur alami yang breathable. Sangat cocok untuk hangout akhir pekan, ibadah, maupun semi-formal.",
        colors: ["Putih Ivory", "Oatmeal Beige", "Biru Kabut"],
        sizes: ["M", "L", "XL", "XXL"],
        weightGrams: 280,
        variationLabel: "Warna",
        motif: "Tekstur Linen",
      },
      {
        id: "lj-fashion-kemeja-2",
        sku: "KTS-FSH-02B",
        name: "Kemeja Oxford Button-Down Slim Fit Lengan Panjang",
        category: "fashion",
        subcategory: "fashion-kemeja",
        price: 175000,
        oldPrice: 219000,
        costPrice: 85000,
        image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=85",
        description: "Kemeja oxford klasik berkerah kancing button-down dengan potongan slim fit. Bahan katun oxford tebal bertekstur, cocok untuk kerja harian.",
        colors: ["Putih Bersih", "Biru Muda", "Abu Terang"],
        sizes: ["S", "M", "L", "XL", "XXL"],
        weightGrams: 320,
        variationLabel: "Warna",
        motif: "Anyaman Oxford",
      },
      {
        id: "lj-fashion-kemeja-3",
        sku: "KTS-FSH-02C",
        name: "Kemeja Flanel Katun Kotak Vintage Tartan",
        category: "fashion",
        subcategory: "fashion-kemeja",
        price: 165000,
        oldPrice: 199000,
        costPrice: 78000,
        image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=85",
        description: "Kemeja flanel katun lembut brushed finish motif kotak-kotak klasik vintage. Hangat dan nyaman dijadikan kemeja mandiri maupun outer kasual.",
        colors: ["Merah Hitam Tartan", "Hijau Hutan Kotak", "Navy Cokelat"],
        sizes: ["M", "L", "XL", "XXL"],
        weightGrams: 350,
        variationLabel: "Warna",
        motif: "Kotak Tartan",
      },
      {
        id: "lj-fashion-kemeja-4",
        sku: "KTS-FSH-02D",
        name: "Kemeja Pantai Tropis Katun Rayon Lengan Pendek",
        category: "fashion",
        subcategory: "fashion-kemeja",
        price: 139000,
        oldPrice: 175000,
        costPrice: 65000,
        image: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=900&q=85",
        description: "Kemeja pantai hawaiian style dengan motif dedaunan tropis estetik. Bahan katun rayon sangat halus, jatuh lembut, dan ekstra sejuk.",
        colors: ["Hitam Floral", "Hijau Sage Tropis", "Krem Daun"],
        sizes: ["M", "L", "XL"],
        weightGrams: 220,
        variationLabel: "Warna",
        motif: "Bunga Tropis",
      },
      {
        id: "lj-fashion-3",
        sku: "KTS-FSH-03",
        name: "Celana Panjang Chino Slim Fit Stretch",
        category: "fashion",
        subcategory: "fashion-celana",
        price: 189000,
        oldPrice: 229000,
        costPrice: 98000,
        image: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=900&q=85",
        description: "Celana chino panjang potongan slim fit fleksibel berbahan katun twill stretch premium. Nyaman bergerak sepanjang hari dengan pinggang kancing berkualiatas.",
        colors: ["Abu Charcoal", "Mocha Hangat", "Navy Gelap"],
        sizes: ["28", "30", "32", "34", "36"],
        weightGrams: 450,
        variationLabel: "Warna",
        motif: "Polos",
      },
      {
        id: "lj-fashion-celana-2",
        sku: "KTS-FSH-03B",
        name: "Celana Ankle Smart Pants Relaxed Fit Stretch",
        category: "fashion",
        subcategory: "fashion-celana",
        price: 199000,
        oldPrice: 245000,
        costPrice: 95000,
        image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=85",
        description: "Celana panjang ankle semata kaki modern dengan pinggang karet elastis tersembunyi. Siluet rapi yang nyaman untuk gaya smart casual kantor.",
        colors: ["Hitam", "Abu Charcoal", "Navy Gelap", "Beige"],
        sizes: ["28", "30", "32", "34", "36"],
        weightGrams: 420,
        variationLabel: "Warna",
        motif: "Polos Semata Kaki",
      },
      {
        id: "lj-fashion-celana-3",
        sku: "KTS-FSH-03C",
        name: "Celana Pendek Chino Cargo Katun Twill Daily",
        category: "fashion",
        subcategory: "fashion-celana",
        price: 135000,
        oldPrice: 169000,
        costPrice: 62000,
        image: "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&w=900&q=85",
        description: "Celana pendek santai dengan saku samping cargo fungsional berbahan katun twill tebal tapi adem. Jahitan bar-tack kuat untuk pemakaian aktif.",
        colors: ["Hijau Army", "Khaki", "Hitam"],
        sizes: ["29", "31", "33", "35"],
        weightGrams: 340,
        variationLabel: "Warna",
        motif: "Cargo Twill",
      },
      {
        id: "lj-fashion-celana-4",
        sku: "KTS-FSH-03D",
        name: "Celana Jeans Denim Slim Tapered Stretch Dark Blue",
        category: "fashion",
        subcategory: "fashion-celana",
        price: 229000,
        oldPrice: 279000,
        costPrice: 110000,
        image: "https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=900&q=85",
        description: "Jeans denim katun elastis 12.5 oz dengan cuci dark indigo elegan. Potongan slim tapered yang memberi kesan kaki jenjang tanpa rasa sesak.",
        colors: ["Dark Indigo", "Medium Wash Blue", "Hitam Pekat"],
        sizes: ["28", "30", "32", "34", "36"],
        weightGrams: 580,
        variationLabel: "Warna",
        motif: "Denim Wash",
      },
      {
        id: "lj-fashion-4",
        sku: "KTS-FSH-04",
        name: "Midi Dress Katun Rayon Floral Flowy",
        category: "fashion",
        subcategory: "fashion-dress",
        price: 179000,
        oldPrice: 219000,
        costPrice: 92000,
        image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=900&q=85",
        description: "Dress santai wanita motif bunga vintage elegan dengan bahan rayon premium yang jatuh, adem, dan ringan dipakai saat cuaca tropis.",
        colors: ["Rose Dust", "Hijau Sage", "Putih Ivory"],
        sizes: ["All Size", "XL"],
        weightGrams: 320,
        variationLabel: "Warna",
        motif: "Floral",
      },
      {
        id: "lj-fashion-dress-2",
        sku: "KTS-FSH-04B",
        name: "Gamis Tunik Plisket Elegan Premium Silk Katun",
        category: "fashion",
        subcategory: "fashion-dress",
        price: 189000,
        oldPrice: 235000,
        costPrice: 95000,
        image: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=85",
        description: "Tunik panjang wanita dengan aksen plisket lipit rapi dan jatuh anggun. Bahan campuran sutra katun bertekstur mewah yang tidak menerawang.",
        colors: ["Mocca Beige", "Dusty Pink", "Navy", "Hitam"],
        sizes: ["All Size", "XL"],
        weightGrams: 380,
        variationLabel: "Warna",
        motif: "Plisket Lipit",
      },
      {
        id: "lj-fashion-dress-3",
        sku: "KTS-FSH-04C",
        name: "Sleeveless A-Line Summer Dress Katun Linen",
        category: "fashion",
        subcategory: "fashion-dress",
        price: 165000,
        oldPrice: 199000,
        costPrice: 82000,
        image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=85",
        description: "Dress tanpa lengan siluet A-line bernuansa liburan musim panas. Dibuat dari linen katun natural berpori dengan saku samping tersembunyi.",
        colors: ["Kuning Mustard", "Putih Natural", "Hijau Sage"],
        sizes: ["S", "M", "L"],
        weightGrams: 290,
        variationLabel: "Warna",
        motif: "Linen Polos",
      },
      {
        id: "lj-fashion-dress-4",
        sku: "KTS-FSH-04D",
        name: "Kaftan Modern Busui Friendly Katun Rayon",
        category: "fashion",
        subcategory: "fashion-dress",
        price: 195000,
        oldPrice: 249000,
        costPrice: 98000,
        image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=85",
        description: "Kaftan longgar mewah dengan ritsleting depan ramah menyusui. Aksen tali serut pinggang yang fleksibel untuk berbagai ukuran tubuh.",
        colors: ["Terracotta", "Emerald Green", "Abu Silver"],
        sizes: ["All Size"],
        weightGrams: 360,
        variationLabel: "Warna",
        motif: "Batik Modern",
      },
      {
        id: "lj-fashion-5",
        sku: "KTS-FSH-05",
        name: "Cardigan Knit Oversize Casual Korea",
        category: "fashion",
        subcategory: "fashion-outerwear",
        price: 149000,
        oldPrice: 185000,
        costPrice: 75000,
        image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=900&q=85",
        description: "Outerwear cardigan rajut tebal halus dengan siluet oversize ala Korea. Kancing batok kelapa estetik yang memberi kesan vintage hangat.",
        colors: ["Krem Susu", "Mocha Hangat", "Abu Charcoal"],
        sizes: ["All Size"],
        weightGrams: 420,
        variationLabel: "Warna",
        motif: "Rajut",
      },
      {
        id: "lj-fashion-outer-2",
        sku: "KTS-FSH-05B",
        name: "Jaket Bomber Casual Windproof Katun Parasut",
        category: "fashion",
        subcategory: "fashion-outerwear",
        price: 219000,
        oldPrice: 269000,
        costPrice: 105000,
        image: "https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=900&q=85",
        description: "Jaket bomber timeless dengan lapisan dalam katun sejuk dan lapisan luar parasut tahan angin. Cocok untuk berkendara motor maupun gaya harian.",
        colors: ["Hijau Army", "Hitam Matte", "Navy Gelap"],
        sizes: ["M", "L", "XL", "XXL"],
        weightGrams: 520,
        variationLabel: "Warna",
        motif: "Polos Matte",
      },
      {
        id: "lj-fashion-outer-3",
        sku: "KTS-FSH-05C",
        name: "Jaket Denim Trucker Washed Classic Katun",
        category: "fashion",
        subcategory: "fashion-outerwear",
        price: 239000,
        oldPrice: 299000,
        costPrice: 115000,
        image: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=900&q=85",
        description: "Jaket jeans denim katun 13 oz dengan efek vintage wash autentik. Kancing logam kuningan antik dan kantong dada ganda ikonik.",
        colors: ["Light Wash Blue", "Medium Indigo", "Black Denim"],
        sizes: ["S", "M", "L", "XL"],
        weightGrams: 680,
        variationLabel: "Warna",
        motif: "Vintage Wash",
      },
      {
        id: "lj-fashion-outer-4",
        sku: "KTS-FSH-05D",
        name: "Blazer Casual Relaxed Fit Katun Linen Unlined",
        category: "fashion",
        subcategory: "fashion-outerwear",
        price: 259000,
        oldPrice: 320000,
        costPrice: 125000,
        image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=900&q=85",
        description: "Blazer santai tanpa furing tebal berbahan katun linen alami. Memberi siluet rapi elegan tanpa rasa gerah sama sekali.",
        colors: ["Beige Pasir", "Navy", "Abu Karang"],
        sizes: ["M", "L", "XL"],
        weightGrams: 480,
        variationLabel: "Warna",
        motif: "Tekstur Linen",
      },
      {
        id: "lj-home-1",
        sku: "KTS-HL-01",
        name: "Selimut Bulu Lembut Soft Touch Fleece King",
        category: "home-living",
        subcategory: "home-selimut",
        price: 129000,
        oldPrice: 169000,
        costPrice: 65000,
        image: "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=900&q=85",
        description: "Selimut bulu fleece super halus dan hangat tanpa rasa gatal. Tidak mudah rontok saat dicuci dan cocok untuk ruangan ber-AC.",
        colors: ["Abu Batu", "Biru Langit", "Mocha Hangat"],
        sizes: ["150×200", "180×200"],
        weightGrams: 750,
        variationLabel: "Warna",
        motif: "Polos Embos",
      },
      {
        id: "lj-home-selimut-2",
        sku: "KTS-HL-01B",
        name: "Bed Cover Quilted Microtex Tebal Salur Minimalis",
        category: "home-living",
        subcategory: "home-selimut",
        price: 239000,
        oldPrice: 299000,
        costPrice: 120000,
        image: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=900&q=85",
        description: "Bed cover empuk dengan isian dakron silikon 6 oz dan jahitan quilting komputer motif salur rapi. Hangat, awet dicuci, dan tidak menggumpal.",
        colors: ["Abu Charcoal", "Biru Navy", "Hijau Sage", "Cokelat Susu"],
        sizes: ["180×200", "200×200"],
        weightGrams: 1600,
        variationLabel: "Warna",
        motif: "Quilting Salur",
      },
      {
        id: "lj-home-selimut-3",
        sku: "KTS-HL-01C",
        name: "Selimut Rajut Throw Blanket Katun Bohemian",
        category: "home-living",
        subcategory: "home-selimut",
        price: 159000,
        oldPrice: 199000,
        costPrice: 78000,
        image: "https://images.unsplash.com/photo-1580301762395-21ce84d00bc6?auto=format&fit=crop&w=900&q=85",
        description: "Throw blanket rajut katun bernuansa bohemian dengan rumbai di ujungnya. Sangat cantik sebagai pemanis sofa ruang tamu maupun selimut tidur santai.",
        colors: ["Krem Ivory", "Mustard Hangat", "Terracotta"],
        sizes: ["130×170"],
        weightGrams: 650,
        variationLabel: "Warna",
        motif: "Rajut Rumbai",
      },
      {
        id: "lj-home-selimut-4",
        sku: "KTS-HL-01D",
        name: "Selimut Bulu Lembut Karakter Anak Anti Alergi",
        category: "home-living",
        subcategory: "home-selimut",
        price: 119000,
        oldPrice: 149000,
        costPrice: 58000,
        image: "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=900&q=85",
        description: "Selimut bulu lembut berbulu pendek anti rontok ramah anak. Serat hypoallergenic yang aman bagi si kecil dengan motif bintang dan awan manis.",
        colors: ["Biru Awan", "Pink Pastel", "Kuning Lembut"],
        sizes: ["100×150", "120×200"],
        weightGrams: 520,
        variationLabel: "Warna",
        motif: "Bintang Lucu",
      },
      {
        id: "lj-home-2",
        sku: "KTS-HL-02",
        name: "Bantal Microfiber Silikon Hotel Bintang 5",
        category: "home-living",
        subcategory: "home-bantal",
        price: 89000,
        oldPrice: 119000,
        costPrice: 42000,
        image: "https://images.unsplash.com/photo-1584100936735-a681c62fdf21?auto=format&fit=crop&w=900&q=85",
        description: "Bantal tidur empuk berisi 100% serat mikro silikon sintetis dengan kain cover katun dobby salur hotel. Anti-alergi dan tahan kempis.",
        colors: ["Putih Ivory"],
        sizes: ["50×70"],
        weightGrams: 950,
        variationLabel: "Warna",
        motif: "Salur Dobby",
      },
      {
        id: "lj-home-bantal-2",
        sku: "KTS-HL-02B",
        name: "Guling Silikon Microfiber Anti Alergi Lembut King",
        category: "home-living",
        subcategory: "home-bantal",
        price: 95000,
        oldPrice: 125000,
        costPrice: 46000,
        image: "https://images.unsplash.com/photo-1584100936735-a681c62fdf21?auto=format&fit=crop&w=900&q=85",
        description: "Guling tidur padat empuk dengan panjang standar 90 cm. Diisi serat silikon sintetis murni kualitas ekspor yang tahan kempis dan anti kutu debu.",
        colors: ["Putih Salur Hotel"],
        sizes: ["35×90"],
        weightGrams: 1100,
        variationLabel: "Warna",
        motif: "Salur Dobby",
      },
      {
        id: "lj-home-bantal-3",
        sku: "KTS-HL-02C",
        name: "Bantal Duduk Sofa Cushion Katun Linen Estetik",
        category: "home-living",
        subcategory: "home-bantal",
        price: 59000,
        oldPrice: 79000,
        costPrice: 28000,
        image: "https://images.unsplash.com/photo-1579656381226-5fc0f0100c3b?auto=format&fit=crop&w=900&q=85",
        description: "Bantal kursi sofa empuk lengkap dengan sarung katun linen resleting tersembunyi. Menambah kenyamanan saat duduk santai di ruang tamu atau kerja.",
        colors: ["Hijau Sage", "Abu Charcoal", "Terracotta", "Krem"],
        sizes: ["45×45"],
        weightGrams: 450,
        variationLabel: "Warna",
        motif: "Polos Natural",
      },
      {
        id: "lj-home-bantal-4",
        sku: "KTS-HL-02D",
        name: "Bantal Memori Busa Ergonomis Ortopedik Leher",
        category: "home-living",
        subcategory: "home-bantal",
        price: 145000,
        oldPrice: 189000,
        costPrice: 72000,
        image: "https://images.unsplash.com/photo-1584100936735-a681c62fdf21?auto=format&fit=crop&w=900&q=85",
        description: "Bantal tidur busa memori berkontur gelombang ergonomis untuk menopang leher dan tulang belakang secara sempurna, mencegah leher pegal saat bangun tidur.",
        colors: ["Putih Biru Gel"],
        sizes: ["50×30"],
        weightGrams: 850,
        variationLabel: "Warna",
        motif: "Kontur Ergonomis",
      },
      {
        id: "lj-home-3",
        sku: "KTS-HL-03",
        name: "Handuk Mandi Katun Bambu Lembut & Cepat Kering",
        category: "home-living",
        subcategory: "home-handuk",
        price: 79000,
        oldPrice: 99000,
        costPrice: 38000,
        image: "https://images.unsplash.com/photo-1616627547584-bf28cee262db?auto=format&fit=crop&w=900&q=85",
        description: "Handuk mandi katun serat bambu alami berdaya serap air 3x lebih cepat dari katun biasa, memiliki sifat antibakteri alami dan tidak apek.",
        colors: ["Hijau Mint", "Biru Langit", "Terracotta", "Krem Susu"],
        sizes: ["70×140"],
        weightGrams: 420,
        variationLabel: "Warna",
        motif: "Garis Tepi",
      },
      {
        id: "lj-home-handuk-2",
        sku: "KTS-HL-03B",
        name: "Set Handuk Wajah & Tangan Katun Dobby (Isi 2 Pcs)",
        category: "home-living",
        subcategory: "home-handuk",
        price: 49000,
        oldPrice: 65000,
        costPrice: 24000,
        image: "https://images.unsplash.com/photo-1616627547584-bf28cee262db?auto=format&fit=crop&w=900&q=85",
        description: "Paket 2 pcs handuk kecil untuk muka dan wastafel cuci tangan. Terbuat dari katun combed lembut yang ramah kulit sensitif dan mudah dicuci.",
        colors: ["Krem & Cokelat", "Abu & Putih", "Mint & Sage"],
        sizes: ["35×75"],
        weightGrams: 200,
        variationLabel: "Warna",
        motif: "List Dobby",
      },
      {
        id: "lj-home-handuk-3",
        sku: "KTS-HL-03C",
        name: "Handuk Mandi Hotel Mewah 550 GSM Katun Tebal",
        category: "home-living",
        subcategory: "home-handuk",
        price: 115000,
        oldPrice: 145000,
        costPrice: 58000,
        image: "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=900&q=85",
        description: "Handuk mandi super tebal berstandar hotel berbintang lima dengan gramasi 550 GSM. Lembut tebal, menyerap air seketika, dan awet dicuci berkali-kali.",
        colors: ["Putih Salju", "Abu Tua Hotel", "Biru Royal"],
        sizes: ["70×140"],
        weightGrams: 550,
        variationLabel: "Warna",
        motif: "Garis Timbul",
      },
      {
        id: "lj-home-handuk-4",
        sku: "KTS-HL-03D",
        name: "Handuk Keramas Rambut Microfiber Cepat Kering Wrap",
        category: "home-living",
        subcategory: "home-handuk",
        price: 35000,
        oldPrice: 49000,
        costPrice: 16000,
        image: "https://images.unsplash.com/photo-1616627547584-bf28cee262db?auto=format&fit=crop&w=900&q=85",
        description: "Handuk pembungkus rambut model turban berkancing praktis. Menyerap air rambut basah 5x lebih cepat dari handuk biasa tanpa merusak kutikula rambut.",
        colors: ["Pink Pastel", "Ungu Lavender", "Abu Muda"],
        sizes: ["25×65"],
        weightGrams: 110,
        variationLabel: "Warna",
        motif: "Polos Turban",
      },
      {
        id: "lj-seprai-hotel-3",
        sku: "KTS-HTL-03",
        name: "Set Sprei Hotel Bintang 5 Katun Dobby Salur 3cm Putih",
        category: "seprai",
        subcategory: "Sprei Hotel",
        price: 185000,
        oldPrice: 229000,
        costPrice: 95000,
        image: "/images/product-hotel.jpg",
        description: "Set sprei katun salur motif garis 3cm khas hotel bintang lima. Sentuhan dingin mewah, kerapatan benang tinggi 300TC, dan awet bertahun-tahun.",
        colors: ["Putih Salur 3cm"],
        sizes: ["160×200", "180×200", "200×200"],
        weightGrams: 1200,
        variationLabel: "Warna",
        motif: "Salur 3cm",
      },
      {
        id: "lj-seprai-hotel-4",
        sku: "KTS-HTL-04",
        name: "Sprei Hotel Jacquard Katun Sutra Anti Kusut",
        category: "seprai",
        subcategory: "Sprei Hotel",
        price: 215000,
        oldPrice: 265000,
        costPrice: 110000,
        image: "/images/product-sprei.jpg",
        description: "Sprei mewah tenun jacquard dengan kilau sutra alami lembut. Bahan tidak mudah kusut saat ditiduri dan selalu tampak rapi seperti kamar presidential suite.",
        colors: ["Champagne Gold", "Silver Mist"],
        sizes: ["180×200", "200×200"],
        weightGrams: 1300,
        variationLabel: "Warna",
        motif: "Jacquard Sutra",
      }
    ];

    for (const item of sampleFashionAndHome) {
      await target.query(
        `INSERT INTO products(id,sku,name,category,subcategory,price,old_price,cost_price,variation_label,motif,weight_grams,image,description,rating,reviews,is_new,active)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1)
         ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), subcategory=VALUES(subcategory), price=VALUES(price), old_price=VALUES(old_price), cost_price=VALUES(cost_price), image=VALUES(image), description=VALUES(description)`,
        [
          item.id,
          item.sku,
          item.name,
          item.category,
          item.subcategory,
          item.price,
          item.oldPrice,
          item.costPrice,
          item.variationLabel,
          item.motif,
          item.weightGrams,
          item.image,
          item.description,
          4.9,
          45,
        ],
      );
      for (const size of item.sizes) {
        for (const color of item.colors) {
          await target.query(
            "INSERT IGNORE INTO product_variants(product_id,size,length_cm,width_cm,height_cm,color,stock) VALUES(?,?,0,0,0,?,?)",
            [item.id, size, color, 25],
          );
        }
      }
    }

    await target.query("INSERT INTO app_migrations(id) VALUES(?)", ["2026_hierarchical_catalog_categories"]);
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

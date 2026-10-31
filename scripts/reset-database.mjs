import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { databaseConfig } from "../server/db.js";
import { products } from "../src/data.js";
import { normalizePhone } from "../server/integrations.js";

async function resetDatabase() {
  const config = databaseConfig();
  console.log(`Connecting to MySQL on ${config.host}:${config.port} as ${config.user}...`);

  // Connect without database to drop and recreate
  const rootConn = await mysql.createConnection({
    ...config,
    database: undefined,
  });

  console.log(`Menghapus database lama '${config.database}' jika ada...`);
  await rootConn.query(`DROP DATABASE IF EXISTS \`${config.database}\``);

  console.log(`Membuat database '${config.database}' baru...`);
  await rootConn.query(
    `CREATE DATABASE \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await rootConn.end();

  // Connect to the newly created database
  const dbConn = await mysql.createConnection(config);
  console.log(`Menerapkan schema.sql ke '${config.database}'...`);
  const schemaSql = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
  for (const sql of schemaSql.split(";").filter((s) => s.trim())) {
    await dbConn.query(sql);
  }

  // Ensure migrations table
  await dbConn.query(
    "CREATE TABLE IF NOT EXISTS app_migrations (id VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  );

  console.log(`Memasukkan ${products.length} produk katalog seprai...`);
  await dbConn.query("START TRANSACTION");
  try {
    for (const p of products) {
      await dbConn.query(
        "INSERT INTO products(id,sku,name,category,gender,price,old_price,image,description,rating,reviews,is_new,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)",
        [
          p.id,
          p.sku,
          p.name,
          p.category,
          p.gender,
          p.price,
          p.oldPrice,
          p.image,
          p.description,
          p.rating,
          p.reviews,
          p.isNew,
        ]
      );
      for (const size of p.sizes) {
        for (const color of p.colors) {
          await dbConn.query(
            "INSERT INTO product_variants(product_id,size,color,stock) VALUES(?,?,?,?)",
            [p.id, size, color, p.stock]
          );
        }
      }
    }

    const adminEmail = process.env.ADMIN_EMAIL || "admin@linyjaya.test";
    const adminPhone = normalizePhone(process.env.ADMIN_PHONE || "6281111111111");
    const adminPassword = process.env.ADMIN_PASSWORD || "AdminLinyJaya2026!";

    const customerEmail = "pelanggan@linyjaya.test";
    const customerPhone = "6282222222222";
    const customerPassword = "BelanjaLiny2026!";

    const accounts = [
      [
        adminEmail,
        adminPhone,
        adminPassword,
        "Admin Liny Jaya",
        "admin",
      ],
      [
        customerEmail,
        customerPhone,
        customerPassword,
        "Pelanggan Liny Jaya",
        "customer",
      ],
    ];

    for (const [email, phone, password, name, role] of accounts) {
      await dbConn.query(
        "INSERT INTO users(id,name,email,phone,password_hash,role) VALUES(?,?,?,?,?,?)",
        [
          randomUUID(),
          name,
          email.toLowerCase(),
          phone,
          await bcrypt.hash(password, 12),
          role,
        ]
      );
    }

    await dbConn.query("INSERT INTO app_migrations(id) VALUES(?)", ["seprai-catalog-v3-reset"]);
    await dbConn.query("COMMIT");
    console.log("Database liny_jaya berhasil di-reset dan disesuaikan!");
  } catch (err) {
    await dbConn.query("ROLLBACK");
    throw err;
  } finally {
    await dbConn.end();
  }
}

resetDatabase().catch((e) => {
  console.error("Gagal mereset database:", e);
  process.exitCode = 1;
});


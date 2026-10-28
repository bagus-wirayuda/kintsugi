import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool, databaseConfig } from "./db.js";
import { products } from "../src/data.js";

export async function initialize(target = pool, seed = true) {
  const source = await readFile(
    new URL("../database/schema.sql", import.meta.url),
    "utf8",
  );
  for (const sql of source.split(";").filter((s) => s.trim()))
    await target.query(sql);
  if (!seed) return;
  const client = await target.connect();
  try {
    await client.query("START TRANSACTION");
    for (const p of products) {
      await client.query(
        "INSERT IGNORE INTO products(id,sku,name,category,gender,price,old_price,image,description,rating,reviews,is_new) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
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
        ],
      );
      for (const size of p.sizes)
        for (const color of p.colors)
          await client.query(
            "INSERT IGNORE INTO product_variants(product_id,size,color,stock) VALUES(?,?,?,?)",
            [p.id, size, color, p.stock],
          );
    }
    const accounts = [
      [
        process.env.ADMIN_EMAIL || "admin@linyjaya.test",
        process.env.ADMIN_PASSWORD || "AdminLinyJaya2026!",
        "Admin Liny Jaya",
        "admin",
      ],
      [
        process.env.CUSTOMER_EMAIL || "pelanggan@linyjaya.test",
        process.env.CUSTOMER_PASSWORD || "BelanjaLiny2026!",
        "Pelanggan Demo",
        "customer",
      ],
    ];
    if (
      process.env.NODE_ENV === "production" &&
      (!process.env.ADMIN_PASSWORD || !process.env.CUSTOMER_PASSWORD)
    )
      throw new Error("Password akun seed wajib ditetapkan pada production.");
    for (const [email, password, name, role] of accounts) {
      if (password.length < 12)
        throw new Error("Password seed minimal 12 karakter.");
      await client.query(
        "INSERT IGNORE INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)",
        [
          randomUUID(),
          name,
          email.toLowerCase(),
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
        " siap: 32 produk, varian, admin dan pelanggan. Seed tidak mereset data lama.",
    );
  } catch (e) {
    console.error("Inisialisasi gagal:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

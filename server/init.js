import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { products } from "../src/data.js";
try {
  await pool.query(
    await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of products) {
      await client.query(
        "INSERT INTO products(id,sku,name,category,gender,price,old_price,image,description,rating,reviews,is_new) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO NOTHING",
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
            "INSERT INTO product_variants(product_id,size,color,stock) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [p.id, size, color, p.stock],
          );
    }
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      if (process.env.ADMIN_PASSWORD.length < 16)
        throw new Error("ADMIN_PASSWORD harus minimal 16 karakter.");
      await client.query(
        "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING",
        [
          randomUUID(),
          "Admin Liny Jaya",
          process.env.ADMIN_EMAIL.toLowerCase(),
          await bcrypt.hash(process.env.ADMIN_PASSWORD, 12),
          "admin",
        ],
      );
    }
    await client.query("COMMIT");
    console.log(
      "Database siap: 32 produk dummy beserta varian. Admin dibuat jika konfigurasi tersedia.",
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
} catch (e) {
  console.error("Inisialisasi gagal:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

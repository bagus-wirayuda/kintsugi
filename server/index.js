import express from "express";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
import { createApp } from "./app.js";
import { startRuntime } from "./runtime.js";
import { initialize } from "./init.js";
try {
  await initialize(pool, false);
  await pool.query("SELECT 1 FROM users LIMIT 1");
} catch (error) {
  console.error(
    "Backend belum dapat terhubung ke database. Aktifkan MySQL di Laragon, periksa DB_HOST/DB_PORT/DB_USER/DB_PASSWORD pada .env, lalu jalankan npm run db:init.",
  );
  console.error("Kode masalah:", error.code || "DATABASE_UNAVAILABLE");
  await pool.end();
  process.exit(1);
}
const app = createApp(pool),
  dist = fileURLToPath(new URL("../dist", import.meta.url));
app.use(express.static(dist));
app.get("/{*path}", (req, res) => res.sendFile(dist + "/index.html"));
const port = Number(process.env.PORT) || 3001,
  host = process.env.HOST || "127.0.0.1";
let runtime;
try {
  runtime = await startRuntime(app, { pool, port, host });
} catch (error) {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} sudah digunakan. Jika toko sudah berjalan, buka http://localhost:${port}; gunakan satu terminal untuk menjalankannya.`
      : "Backend gagal dimulai: " + (error.code || error.message),
  );
  await pool.end();
  process.exitCode = 1;
}
if (runtime)
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      runtime.close().catch((error) => {
        console.error("Gagal menghentikan toko:", error.code || error.message);
        process.exitCode = 1;
      });
    });

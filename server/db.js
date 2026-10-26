import pg from "pg";
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL belum diatur. Salin .env.example menjadi .env dan jalankan PostgreSQL.",
  );
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
pool.on("error", () =>
  console.error("Koneksi database terputus. Periksa PostgreSQL."),
);

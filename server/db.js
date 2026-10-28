import mysql from "mysql2/promise";

export function databaseConfig(database = process.env.DB_NAME || "liny_jaya") {
  if (!/^[a-zA-Z0-9_]+$/.test(database))
    throw new Error("Nama database tidak valid.");
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database,
    charset: "utf8mb4",
    timezone: "Z",
    decimalNumbers: true,
    connectionLimit: 10,
  };
}
export function createPool(database) {
  const raw = mysql.createPool(databaseConfig(database));
  raw.on("connection", (connection) =>
    connection.query("SET time_zone = '+00:00'"),
  );
  const wrap = (connection) => ({
    async query(sql, args = []) {
      const [rows] = await connection.query(sql, args);
      return {
        rows: Array.isArray(rows) ? rows : [],
        affectedRows: rows.affectedRows,
      };
    },
    release: () => connection.release(),
  });
  return {
    ...wrap(raw),
    connect: async () => wrap(await raw.getConnection()),
    end: () => raw.end(),
  };
}
export const pool = createPool();

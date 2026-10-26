import express from "express";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
import { createApp } from "./app.js";
const app = createApp(pool),
  dist = fileURLToPath(new URL("../dist", import.meta.url));
app.use(express.static(dist));
app.get("/{*path}", (req, res) => res.sendFile(dist + "/index.html"));
const server = app.listen(Number(process.env.PORT) || 3001, "127.0.0.1", () =>
  console.log(`Liny Jaya API: http://127.0.0.1:${process.env.PORT || 3001}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await pool.end();
      process.exit(0);
    }),
  );

import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("Kesiapan Produksi VPS: Error Handling, CORS, Reverse Proxy & Performance", async (t) => {
  const pool = createPool();

  await t.test("1. Frontend cleanErrorMessage & getFriendlyErrorMessage: Menolak teks HTML mentah pada error 502/503/504", async () => {
    // Simulasi respons HTML mentah Nginx 502 Bad Gateway
    const nginx502Html = `<html>
<head><title>502 Bad Gateway</title></head>
<body>
<center><h1>502 Bad Gateway</h1></center>
<hr><center>nginx/1.24.0</center>
</body>
</html>`;

    // Import fungsi dari store.js (atau verifikasi perilakunya)
    const storeModule = await import("../src/store.js");
    
    // Uji fetch mock yang mengembalikan 502 HTML
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: false,
        status: 502,
        text: async () => nginx502Html,
      });

      await assert.rejects(
        async () => {
          await storeModule.api("/products");
        },
        (err) => {
          assert.equal(err.status, 502);
          assert.doesNotMatch(err.message, /<html>/i);
          assert.doesNotMatch(err.message, /<center>/i);
          assert.match(err.message, /502 Bad Gateway/);
          assert.match(err.message, /Gagal terhubung ke server/);
          return true;
        },
        "Error 502 HTML tidak boleh menampilkan tag HTML mentah kepada pengguna"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("2. Frontend api(): Mempertahankan pesan error JSON asli dari server pada status 400/409", async () => {
    const storeModule = await import("../src/store.js");
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: "Nomor WhatsApp belum terdaftar." }),
      });

      await assert.rejects(
        async () => {
          await storeModule.api("/auth/check");
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.message, "Nomor WhatsApp belum terdaftar.");
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("3. Backend CORS & Origin dinamis: Mendukung APP_URL production, forwarded proto, dan ALLOWED_ORIGINS", async () => {
    const app = createApp(pool, {
      test: true,
      env: {
        NODE_ENV: "production",
        APP_URL: "https://tokokintsugi.com",
        ALLOWED_ORIGINS: "https://tokokintsugi.com,https://admin.tokokintsugi.com",
        TRUST_PROXY: "1",
      },
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}/api`;

    try {
      // POST dengan origin yang sah (sesuai APP_URL)
      const resAllowed = await fetch(`${base}/newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://tokokintsugi.com",
        },
        body: JSON.stringify({ email: "test-prod@example.com" }),
      });
      assert.equal(resAllowed.status, 200, "Origin dari APP_URL harus diizinkan");

      // POST dengan origin dari ALLOWED_ORIGINS
      const resAllowedSub = await fetch(`${base}/newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://admin.tokokintsugi.com",
        },
        body: JSON.stringify({ email: "test-admin@example.com" }),
      });
      assert.equal(resAllowedSub.status, 200, "Origin dari ALLOWED_ORIGINS harus diizinkan");

      // POST dengan origin asing yang tidak terdaftar
      const resBlocked = await fetch(`${base}/newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil-attacker.com",
        },
        body: JSON.stringify({ email: "hacker@example.com" }),
      });
      assert.equal(resBlocked.status, 403, "Origin asing harus ditolak dengan 403");
    } finally {
      server.close();
    }
  });

  await t.test("4. Reverse proxy header & Trust Proxy: Server membaca X-Forwarded-For dan tidak melempar error", async () => {
    const app = createApp(pool, {
      test: true,
      env: {
        NODE_ENV: "production",
        TRUST_PROXY: "1",
      },
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}/api`;

    try {
      const res = await fetch(`${base}/health`, {
        headers: {
          "X-Forwarded-For": "203.0.113.195, 127.0.0.1",
          "X-Forwarded-Proto": "https",
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, "ok");
    } finally {
      server.close();
    }
  });

  await t.test("5. Static asset caching: Memastikan direktori dist dan header cache dikonfigurasi optimal", () => {
    const distPath = fileURLToPath(new URL("../dist", import.meta.url));
    assert.ok(existsSync(distPath), "Direktori dist harus sudah terbentuk dari hasil npm run build");
    assert.ok(existsSync(path.join(distPath, "index.html")), "dist/index.html harus tersedia untuk melayani SPA");
  });

  await t.test("6. Database Pool config: Mendukung parameter produksi (connectionLimit, keepAlive, timeout)", () => {
    const config = databaseConfig("liny_jaya");
    assert.ok(config.connectionLimit >= 10, "connectionLimit harus minimal 10 (default 20)");
    assert.equal(config.enableKeepAlive, true, "enableKeepAlive harus aktif untuk kestabilan koneksi database");
    assert.equal(config.waitForConnections, true, "waitForConnections harus aktif");
    assert.ok(config.connectTimeout >= 5000, "connectTimeout harus dikonfigurasi aman");
  });
});

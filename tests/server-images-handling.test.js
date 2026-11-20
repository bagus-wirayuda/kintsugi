import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, syncUploadsDirectories } from "../server/app.js";

const samplePng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function listenApp(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

test("Suite: Penanganan Gambar di Server (Audit & Solusi)", async (t) => {
  const dummyPool = {
    query: async () => ({ rows: [] }),
  };

  await t.test("1. Production HTTP: CSP tidak boleh memaksa upgrade-insecure-requests jika diakses via HTTP", async () => {
    const app = createApp(dummyPool, {
      test: true,
      env: {
        NODE_ENV: "production",
        APP_URL: "http://127.0.0.1:3001",
        COOKIE_SECURE: "false",
      },
      gateway: { configured: false, sandbox: true },
    });

    const { baseUrl, close } = await listenApp(app);
    try {
      const res = await fetch(`${baseUrl}/api/products`);
      const csp = res.headers.get("content-security-policy") || "";
      assert.ok(
        !csp.includes("upgrade-insecure-requests"),
        "CSP tidak boleh mengandung upgrade-insecure-requests saat server berjalan di HTTP"
      );
    } finally {
      await close();
    }
  });

  await t.test("2. Production HTTPS: CSP mengaktifkan upgrade-insecure-requests hanya jika HTTPS terkonfigurasi", async () => {
    const app = createApp(dummyPool, {
      test: true,
      env: {
        NODE_ENV: "production",
        APP_URL: "https://tokokintsugi.com",
        COOKIE_SECURE: "true",
      },
      gateway: { configured: false, sandbox: true },
    });

    const { baseUrl, close } = await listenApp(app);
    try {
      const res = await fetch(`${baseUrl}/api/products`);
      const csp = res.headers.get("content-security-policy") || "";
      assert.ok(
        csp.includes("upgrade-insecure-requests"),
        "CSP harus mengaktifkan upgrade-insecure-requests jika APP_URL adalah HTTPS"
      );
    } finally {
      await close();
    }
  });

  await t.test("3. Header CORS & Cross-Origin-Resource-Policy pada route /uploads", async () => {
    const app = createApp(dummyPool, {
      test: true,
      env: { NODE_ENV: "production", APP_URL: "http://127.0.0.1:3001" },
      gateway: { configured: false, sandbox: true },
    });

    const { baseUrl, close } = await listenApp(app);
    const publicUploads = fileURLToPath(new URL("../public/uploads/", import.meta.url));
    await mkdir(publicUploads, { recursive: true });
    const testFilename = "test-server-audit.png";
    const testFilePath = path.join(publicUploads, testFilename);
    const pngBytes = Buffer.from(samplePng.split(",")[1], "base64");
    writeFileSync(testFilePath, pngBytes);

    try {
      const res = await fetch(`${baseUrl}/uploads/${testFilename}`);
      assert.strictEqual(res.status, 200, "File yang ada di uploads harus mengembalikan status 200");
      assert.strictEqual(
        res.headers.get("cross-origin-resource-policy"),
        "cross-origin",
        "Harus menyertakan CORP cross-origin agar gambar dapat dirender di semua origin/port"
      );
      assert.strictEqual(
        res.headers.get("access-control-allow-origin"),
        "*",
        "Harus menyertakan Access-Control-Allow-Origin: *"
      );
    } finally {
      if (existsSync(testFilePath)) unlinkSync(testFilePath);
      await close();
    }
  });

  await t.test("4. Asset 404: File tidak ditemukan TIDAK BOLEH mengembalikan index.html (SPA Fallback)", async () => {
    const app = createApp(dummyPool, {
      test: true,
      env: { NODE_ENV: "production" },
      gateway: { configured: false, sandbox: true },
    });

    const { baseUrl, close } = await listenApp(app);
    try {
      for (const route of ["/uploads/file-hilang.png", "/images/file-hilang.jpg", "/brand/file-hilang.png"]) {
        const res = await fetch(`${baseUrl}${route}`);
        assert.strictEqual(res.status, 404, `Route ${route} harus mengembalikan 404`);
        const contentType = res.headers.get("content-type") || "";
        assert.ok(
          !contentType.includes("text/html"),
          `Route ${route} tidak boleh mengembalikan text/html (SPA index.html fallback), melainkan ${contentType}`
        );
      }
    } finally {
      await close();
    }
  });

  await t.test("5. Sinkronisasi dual direktori (public/uploads dan dist/uploads)", async () => {
    const publicUploads = fileURLToPath(new URL("../public/uploads/", import.meta.url));
    const distUploads = fileURLToPath(new URL("../dist/uploads/", import.meta.url));

    await mkdir(publicUploads, { recursive: true });
    await mkdir(distUploads, { recursive: true });

    const syncFilename = "sync-test-audit.png";
    const pubFile = path.join(publicUploads, syncFilename);
    const distFile = path.join(distUploads, syncFilename);

    writeFileSync(pubFile, Buffer.from("test-content"));

    await syncUploadsDirectories();

    assert.ok(
      existsSync(distFile),
      "File di public/uploads harus otomatis disinkronkan ke dist/uploads saat syncUploadsDirectories berjalan"
    );

    if (existsSync(pubFile)) unlinkSync(pubFile);
    if (existsSync(distFile)) unlinkSync(distFile);
  });
});

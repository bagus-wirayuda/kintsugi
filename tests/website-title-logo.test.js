import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

test("Logo pada Title Website (Favicon & Dynamic Title)", async (t) => {
  // 1. Verifikasi index.html
  await t.test("1. index.html memuat tag link rel='icon' dan link rel='apple-touch-icon' dengan logo resmi", () => {
    const html = fs.readFileSync(path.resolve("index.html"), "utf8");
    assert.match(html, /<link[^>]+rel=["']icon["'][^>]+href=["'][^"']*favicon\.png["']/, "index.html harus memuat favicon.png");
    assert.match(html, /<link[^>]+rel=["']icon["'][^>]+href=["'][^"']*kintsugi-logo-transparent-v2\.png["']/, "index.html harus memuat kintsugi logo PNG");
    assert.match(html, /<link[^>]+rel=["']shortcut icon["']/, "index.html harus memuat shortcut icon");
    assert.match(html, /<link[^>]+rel=["']apple-touch-icon["']/, "index.html harus memuat apple-touch-icon");
    assert.match(html, /<title>.*<\/title>/, "index.html harus memiliki tag title");
  });

  // 2. Verifikasi keberadaan file fisik favicon
  await t.test("2. File fisik public/favicon.png dan public/favicon.ico tersedia dan valid", () => {
    const pngPath = path.resolve("public/favicon.png");
    const icoPath = path.resolve("public/favicon.ico");
    const logoPath = path.resolve("public/brand/kintsugi-logo-transparent-v2.png");

    assert.ok(fs.existsSync(pngPath), "public/favicon.png harus ada");
    assert.ok(fs.existsSync(icoPath), "public/favicon.ico harus ada");
    assert.ok(fs.existsSync(logoPath), "public/brand/kintsugi-logo-transparent-v2.png harus ada");

    // Validasi pembacaan PNG
    const pngData = fs.readFileSync(pngPath);
    const parsed = PNG.sync.read(pngData);
    assert.equal(parsed.width, 64);
    assert.equal(parsed.height, 64);

    // Validasi ICO header
    const icoData = fs.readFileSync(icoPath);
    assert.equal(icoData.readUInt16LE(0), 0); // reserved
    assert.equal(icoData.readUInt16LE(2), 1); // ICO type
    assert.ok(icoData.length > 500, "Ukuran file ICO harus valid");
  });

  // 3. Verifikasi src/main.jsx menyinkronkan document.title dan favicon secara dinamis
  await t.test("3. src/main.jsx menyinkronkan document.title dan favicon link dengan brand & logo config", () => {
    const mainSrc = fs.readFileSync(path.resolve("src/main.jsx"), "utf8");
    assert.match(mainSrc, /document\.title\s*=/, "main.jsx harus memperbarui document.title secara dinamis");
    assert.match(mainSrc, /iconLink\.href\s*=\s*brandLogo/, "main.jsx harus menyinkronkan favicon link dengan brandLogo");
    assert.match(mainSrc, /appleLink\.href\s*=\s*brandLogo/, "main.jsx harus menyinkronkan apple-touch-icon dengan brandLogo");
  });
});

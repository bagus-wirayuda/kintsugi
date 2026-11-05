import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createPool } from "../server/db.js";
import { createApp } from "../server/app.js";

test("Admin -> Diskon: Alur Buat Promo dan Ubah Promo", async (t) => {
  const pool = createPool();
  const app = createApp(pool, { test: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port + "/api";

  async function apiCall(path, options = {}) {
    const { body, cookie, method = "GET" } = options;
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, headers: res.headers };
  }

  let adminCookie = "";
  let createdPromoId = null;
  let testProduct = null;

  try {
    // 1. Verifikasi import Check pada Admin.jsx
    await t.test("Verifikasi import ikon Check dari lucide-react di Admin.jsx", () => {
      const code = fs.readFileSync("src/Admin.jsx", "utf8");
      assert.match(
        code,
        /import\s*\{[^}]*\bCheck\b[^}]*\}\s*from\s*["']lucide-react["']/,
        "Admin.jsx harus mengimpor 'Check' dari lucide-react"
      );
      assert.ok(
        code.includes("<Check size={16} /> Simpan Promo"),
        "Tombol simpan promo harus merender icon Check dengan benar"
      );
    });

    // 2. Login Admin
    await t.test("Login Admin untuk otorisasi panel Diskon", async () => {
      const res = await fetch(base + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "admin@linyjaya.test", password: "AdminLinyJaya2026!" }),
      });
      assert.equal(res.status, 200);
      const setCookie = res.headers.get("set-cookie") || "";
      const match = setCookie.match(/lj_session=[^;]+/);
      adminCookie = match ? match[0] : "";
      assert.ok(adminCookie, "Session cookie admin harus ada");

      // Ambil produk aktif dari database
      const productsRes = await apiCall("/admin/products", { cookie: adminCookie });
      assert.equal(productsRes.status, 200);
      assert.ok(productsRes.data.length > 0, "Harus ada produk aktif di toko");
      testProduct = productsRes.data[0];
      assert.ok(testProduct.id);
      assert.ok(Number(testProduct.price) > 0);
    });

    // 3. Alur Buat Promo
    await t.test("Alur Buat Promo: membuka form dengan data otomatis & menyimpan promo baru", async () => {
      // Bersihkan promo lama jika produk uji sudah memiliki promo aktif
      const existingSettings = await apiCall("/admin/settings", { cookie: adminCookie });
      const oldPromos = existingSettings.data.promotions || [];
      for (const op of oldPromos.filter((p) => p.product_id === testProduct.id)) {
        await apiCall(`/admin/promotions/${op.id}`, { method: "DELETE", cookie: adminCookie });
      }

      // Simulasi state inisialisasi pada Buat Promo (initPromoFromProduct)
      const basePrice = Number(testProduct.price);
      const discountPercent = 15;
      const expectedPromoPrice = Math.round((basePrice * (100 - discountPercent)) / 100);

      const newPromoPayload = {
        productId: testProduct.id,
        eyebrow: "PENAWARAN SPESIAL",
        title: testProduct.name + " Promo Hemat",
        description: "Diskon istimewa untuk kenyamanan ruang istirahat Anda.",
        image: "",
        discountPercent,
        promoPrice: expectedPromoPrice,
        active: true,
      };

      // Simpan promo baru (POST /api/admin/promotions)
      const createRes = await apiCall("/admin/promotions", {
        method: "POST",
        cookie: adminCookie,
        body: newPromoPayload,
      });
      assert.equal(createRes.status, 201, "Pembuatan promo harus berhasil (201)");
      assert.ok(createRes.data.id, "Respons harus mengembalikan ID promo baru");
      createdPromoId = createRes.data.id;

      // Verifikasi promo tampil di daftar promo admin
      const settingsAfter = await apiCall("/admin/settings", { cookie: adminCookie });
      assert.equal(settingsAfter.status, 200);
      const savedPromo = settingsAfter.data.promotions.find((p) => p.id === createdPromoId);
      assert.ok(savedPromo, "Promo baru harus tercatat di daftar promo aktif");
      assert.equal(savedPromo.product_id, testProduct.id);
      assert.equal(savedPromo.title, newPromoPayload.title);
      assert.equal(savedPromo.discount_percent, discountPercent);
      assert.equal(Number(savedPromo.promo_price), expectedPromoPrice);
      assert.equal(Boolean(savedPromo.active), true);
    });

    // 4. Alur Ubah Promo
    await t.test("Alur Ubah Promo: memuat seluruh data lama, mengedit, dan menyimpan perubahan", async () => {
      assert.ok(createdPromoId, "Promo sebelumnya harus ada untuk diedit");

      // Verifikasi data promo sebelumnya terisi lengkap
      const settingsBefore = await apiCall("/admin/settings", { cookie: adminCookie });
      const promoToEdit = settingsBefore.data.promotions.find((p) => p.id === createdPromoId);
      assert.ok(promoToEdit);
      assert.equal(promoToEdit.eyebrow, "PENAWARAN SPESIAL");

      // Perbarui nilai promo
      const updatedEyebrow = "FLASH SALE TERBATAS";
      const updatedTitle = testProduct.name + " (Edisi Terbatas)";
      const updatedDiscount = 20;
      const basePrice = Number(testProduct.price);
      const updatedPromoPrice = Math.round((basePrice * (100 - updatedDiscount)) / 100);

      const updatePayload = {
        productId: testProduct.id,
        eyebrow: updatedEyebrow,
        title: updatedTitle,
        description: "Deskripsi diperbarui dengan diskon lebih besar.",
        image: "/images/seprai/sprei-01.jpg",
        discountPercent: updatedDiscount,
        promoPrice: updatedPromoPrice,
        active: true,
      };

      // Simpan perubahan promo (PATCH /api/admin/promotions/:id)
      const patchRes = await apiCall(`/admin/promotions/${createdPromoId}`, {
        method: "PATCH",
        cookie: adminCookie,
        body: updatePayload,
      });
      assert.equal(patchRes.status, 200, "Update promo harus berhasil (200)");
      assert.equal(patchRes.data.ok, true);

      // Verifikasi perubahan tampil pada daftar promo
      const settingsAfter = await apiCall("/admin/settings", { cookie: adminCookie });
      assert.equal(settingsAfter.status, 200);
      const updatedPromo = settingsAfter.data.promotions.find((p) => p.id === createdPromoId);
      assert.ok(updatedPromo);
      assert.equal(updatedPromo.eyebrow, updatedEyebrow);
      assert.equal(updatedPromo.title, updatedTitle);
      assert.equal(updatedPromo.discount_percent, updatedDiscount);
      assert.equal(Number(updatedPromo.promo_price), updatedPromoPrice);
      assert.equal(updatedPromo.image, "/images/seprai/sprei-01.jpg");

      // Hapus promo uji setelah pengujian selesai
      await apiCall(`/admin/promotions/${createdPromoId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
    });

  } finally {
    server.close();
    await pool.end();
  }
});

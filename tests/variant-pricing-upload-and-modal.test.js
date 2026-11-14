import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createPool } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
import { randomUUID } from "node:crypto";

const pool = createPool();

function startServer() {
  return new Promise(async (resolve) => {
    await initialize(pool, false);
    const app = createApp(pool, {
      test: true,
      env: { NODE_ENV: "test" },
      gateway: { configured: false, sandbox: true },
    });
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

test("Suite: Upload Gambar, Animasi/Modal, dan Mekanisme Harga Berbasis Variasi", async (t) => {
  const { server, baseUrl, close } = await startServer();

  let adminCookie = "";
  let testProductId = "";

  t.after(async () => {
    // Cleanup test data
    if (testProductId) {
      await pool.query("DELETE FROM order_items WHERE product_id=?", [testProductId]);
      await pool.query("DELETE FROM product_variants WHERE product_id=?", [testProductId]);
      await pool.query("DELETE FROM products WHERE id=?", [testProductId]);
    }
    await pool.query("DELETE FROM product_categories WHERE id IN ('cat-bedding', 'sub-sprei')");
    await close();
  });

  await t.test("1. Login Admin untuk autentikasi", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "admin@linyjaya.test", password: "AdminLinyJaya2026!" }),
    });
    assert.strictEqual(res.status, 200, "Admin login harus berhasil");
    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie, "Harus menerima session cookie");
    const match = setCookie.match(/lj_session=[^;]+/);
    adminCookie = match ? match[0] : setCookie.split(";")[0];
  });

  await t.test("2. Upload Gambar: Dukungan berbagai format (PNG, JPG, WebP, BMP)", async () => {
    const samplePng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const sampleJpg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
    const sampleWebp = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
    const sampleBmp = "data:image/bmp;base64,Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAAAAAATCwAAEwsAAAAAAAAAAAAA/////wA=";

    for (const [fmt, dataUrl] of Object.entries({ png: samplePng, jpg: sampleJpg, webp: sampleWebp, bmp: sampleBmp })) {
      const res = await fetch(`${baseUrl}/api/admin/uploads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({ data: dataUrl }),
      });
      assert.strictEqual(res.status, 201, `Upload format ${fmt} harus berhasil (HTTP 201)`);
      const json = await res.json();
      assert.ok(json.url, `URL hasil upload format ${fmt} harus dikembalikan`);
      assert.match(json.url, /^\/uploads\//, "URL harus berada di folder /uploads/");

      const fileRes = await fetch(`${baseUrl}${json.url}`);
      assert.strictEqual(fileRes.status, 200, `File ${fmt} harus dapat diakses kembali via HTTP`);
    }
  });

  await t.test("3. Upload Gambar: Penolakan file berbahaya / biner eksekusi", async () => {
    const fakeExe = "data:image/png;base64,TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAA==";
    const res = await fetch(`${baseUrl}/api/admin/uploads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({ data: fakeExe }),
    });
    assert.strictEqual(res.status, 400, "Header file biner eksekusi harus ditolak dengan HTTP 400");
  });

  await t.test("4. Sistem Harga Berbasis Variasi: Tambah produk dengan variasi harga berbeda", async () => {
    await pool.query("INSERT IGNORE INTO product_categories (id, name, parent_id, active) VALUES ('cat-bedding', 'Bedding', NULL, TRUE), ('sub-sprei', 'Sprei Fitted & Karet', 'cat-bedding', TRUE)");

    const payload = {
      name: "Sprei Sutra Kintsugi Series",
      sku: "SKU-SUTRA-01",
      category: "cat-bedding",
      subcategory: "sub-sprei",
      description: "Sprei sutra premium dengan berbagai variasi harga dan ukuran.",
      image: "/uploads/sprei-sample.png",
      active: true,
      variants: [
        {
          size: "Single 120x200",
          color: "Putih",
          stock: 15,
          price: 120000,
          imageUrl: "/uploads/var-white.png",
        },
        {
          size: "Queen 160x200",
          color: "Putih",
          stock: 10,
          price: 150000,
          imageUrl: "/uploads/var-white.png",
        },
        {
          size: "King 180x200",
          color: "Putih",
          stock: 8,
          price: 185000,
          imageUrl: "/uploads/var-white.png",
        },
      ],
    };

    const res = await fetch(`${baseUrl}/api/admin/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify(payload),
    });
    const created = await res.json();
    assert.strictEqual(res.status, 201, `Pembuatan produk baru harus berhasil (HTTP 201). Error: ${JSON.stringify(created)}`);
    testProductId = created.id;
    assert.ok(testProductId, "ID produk harus ada");

    const [pRow] = (await pool.query("SELECT price FROM products WHERE id=?", [testProductId])).rows;
    assert.strictEqual(Number(pRow.price), 120000, "Harga produk utama di database harus otomatis disinkronkan ke harga termurah varian (Rp 120.000)");
  });

  await t.test("5. Katalog: Menampilkan harga variasi paling murah", async () => {
    const res = await fetch(`${baseUrl}/api/products?search=Sprei%20Sutra%20Kintsugi`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const product = data.items.find((p) => p.id === testProductId);
    assert.ok(product, "Produk harus ditemukan di katalog");
    assert.strictEqual(product.price, 120000, "Katalog wajib menampilkan harga variasi paling murah (Rp 120.000)");
    assert.strictEqual(product.minPrice, 120000, "minPrice harus 120.000");
    assert.strictEqual(product.maxPrice, 185000, "maxPrice harus 185.000");
    assert.strictEqual(product.hasPriceRange, true, "hasPriceRange harus true");
  });

  await t.test("6. Detail Produk: Menampilkan rentang harga & harga spesifik setiap variasi", async () => {
    const res = await fetch(`${baseUrl}/api/products/${encodeURIComponent(testProductId)}`);
    assert.strictEqual(res.status, 200);
    const detail = await res.json();
    assert.strictEqual(detail.minPrice, 120000);
    assert.strictEqual(detail.maxPrice, 185000);
    assert.strictEqual(detail.hasPriceRange, true);

    const singleVar = detail.variants.find((v) => v.size === "Single 120x200");
    assert.strictEqual(singleVar.price, 120000);

    const kingVar = detail.variants.find((v) => v.size === "King 180x200");
    assert.strictEqual(kingVar.price, 185000);
  });

  await t.test("7. Keranjang & Checkout: Backend memvalidasi subtotal sesuai harga varian terpilih", async () => {
    try {
      const ts = Date.now();
      const buyerEmail = `buyer_${ts}@linyjaya.test`;
      const buyerPhone = `62812${String(ts).slice(-7)}`;
      const buyerId = "usr-buyer-" + ts;
      const buyerHash = await bcrypt.hash("buyerpassword123", 10);
      await pool.query(
        "INSERT INTO users (id, email, phone, name, password_hash, role) VALUES (?, ?, ?, ?, ?, 'customer')",
        [buyerId, buyerEmail, buyerPhone, "Pembeli Uji Variasi", buyerHash]
      );

      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: buyerEmail, password: "buyerpassword123" }),
      });
      assert.strictEqual(loginRes.status, 200, "Customer login harus sukses");
      const buyerCookie = loginRes.headers.get("set-cookie").match(/lj_session=[^;]+/)[0];

      await pool.query("INSERT IGNORE INTO store_payment_methods (id, name, group_name, payment_type, enabled) VALUES ('pm-cod', 'Bayar di Tempat (COD)', 'COD', 'cod', TRUE)");

      const checkoutKey = randomUUID();
      const orderPayload = {
        checkoutKey,
        items: [
          {
            id: testProductId,
            size: "King 180x200",
            color: "Putih",
            quantity: 2,
            price: 10000, // Simulasi manipulasi harga di client
          },
        ],
        shipping: "pickup",
        shippingOption: null,
        payment: "store_pickup",
        address: {
          name: "Pembeli Uji Variasi",
          email: buyerEmail,
          phone: buyerPhone,
          street: "Ambil di Toko Makassar",
          city: "Makassar",
          postal: "90111",
        },
      };

      const orderRes = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: buyerCookie,
        },
        body: JSON.stringify(orderPayload),
      });
      const orderData = await orderRes.json();
      if (![200, 201].includes(orderRes.status)) {
        console.error("Order failed with status:", orderRes.status, orderData);
      }
      assert.ok(orderRes.status === 200 || orderRes.status === 201, `Checkout harus berhasil (status ${orderRes.status})`);
      assert.ok(orderData.id, "ID pesanan harus dibuat");

      const [orderRow] = (await pool.query("SELECT * FROM orders WHERE id=?", [orderData.id])).rows;
      assert.strictEqual(Number(orderRow.subtotal), 370000, "Subtotal pesanan harus 2 × Rp 185.000 = Rp 370.000 (tidak terpengaruh manipulasi frontend)");
      assert.strictEqual(Number(orderRow.total), 370000, "Total harus Rp 370.000");

      const [itemRow] = (await pool.query("SELECT * FROM order_items WHERE order_id=?", [orderData.id])).rows;
      assert.strictEqual(Number(itemRow.price), 185000, "Harga item tersimpan harus harga varian sebenarnya (Rp 185.000)");
      assert.strictEqual(itemRow.size, "King 180x200");

      await pool.query("DELETE FROM order_items WHERE order_id=?", [orderData.id]);
      await pool.query("DELETE FROM orders WHERE id=?", [orderData.id]);
      await pool.query("DELETE FROM users WHERE id=?", [buyerId]);
    } catch (e) {
      console.error("DEBUG STEP 7 ERROR:", e);
      throw e;
    }
  });
});

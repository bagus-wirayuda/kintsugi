import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { createPool, databaseConfig } from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
import { aggregateItems, calculateTotals } from "../server/commerce.js";
import {
  getCartItemCount,
  mergeGuestCart,
  mergeGuestSelection,
  reconcileSelectedKeys,
  subtractPurchased,
} from "../src/checkout-state.js";
import { totals as clientTotals } from "../src/store.js";
import {
  BEDDING_ACCESSORY_GUIDE,
  BEDDING_MATTRESS_GUIDE,
  FASHION_BOTTOMS_GUIDE,
  FASHION_LOUNGE_GUIDE,
  FASHION_TOPS_GUIDE,
  detectFashionSubgroup,
  detectSizeGuideCategory,
  sizesMatch,
  sortCategorySizes,
} from "../src/size-guide.js";
import { parseQris } from "../src/qris.js";

test("Unit Audit: Panduan Ukuran, Sorting Ukuran, Merge Guest Cart & Perhitungan Subtotal/Quantity", async (t) => {
  await t.test("1. Panduan Ukuran memisahkan kategori BEDDING & FASHION secara akurat", () => {
    assert.equal(
      detectSizeGuideCategory({ id: "lj-fsh-kaos-1", category: "fashion", sizes: ["S", "M", "L"] }),
      "fashion",
    );
    assert.equal(
      detectSizeGuideCategory({ id: "lj-1-1", category: "bedding", sizes: ["160x200x30"] }),
      "bedding",
    );
    assert.equal(detectSizeGuideCategory(null, "fashion"), "fashion");
    assert.equal(detectSizeGuideCategory(null, "bedding"), "bedding");

    assert.equal(detectFashionSubgroup({ subcategory: "fashion-celana", sizes: ["28", "30", "32"] }), "bottoms");
    assert.equal(detectFashionSubgroup({ subcategory: "fashion-loungewear", sizes: ["All Size"] }), "lounge");
    assert.equal(detectFashionSubgroup({ subcategory: "fashion-kemeja", sizes: ["S", "M", "L"] }), "tops");

    assert.ok(FASHION_TOPS_GUIDE.some((r) => r.size === "XXL"));
    assert.ok(FASHION_BOTTOMS_GUIDE.some((r) => r.size === "32"));
    assert.ok(FASHION_LOUNGE_GUIDE.some((r) => /All Size/i.test(r.size)));
    assert.ok(BEDDING_MATTRESS_GUIDE.some((r) => r.size.startsWith("180")));
    assert.ok(BEDDING_ACCESSORY_GUIDE.some((r) => r.size === "Standar"));
  });

  await t.test("2. sortCategorySizes mengurutkan ukuran Fashion & Bedding secara terstruktur", () => {
    assert.deepEqual(sortCategorySizes(["XL", "S", "XXL", "M", "L"]), ["S", "M", "L", "XL", "XXL"]);
    assert.deepEqual(sortCategorySizes(["34", "28", "32", "30", "36"]), ["28", "30", "32", "34", "36"]);
    assert.deepEqual(
      sortCategorySizes(["180×200×30", "90×200×30", "King", "Standar", "120×200×30"]),
      ["Standar", "King", "90×200×30", "120×200×30", "180×200×30"],
    );
    assert.equal(sizesMatch("160x200x30", "160×200×30"), true);
    assert.equal(sizesMatch("M", "m"), true);
  });

  await t.test("3. mergeGuestCart & aggregateItems menjaga quantity tanpa NaN saat stock kosong atau varian berulang", () => {
    const merged = mergeGuestCart(
      [{ key: "p1:M:Hitam", id: "p1", size: "M", color: "Hitam", price: 100000, quantity: 2 }],
      [
        { key: "p1:M:Hitam", id: "p1", size: "M", color: "Hitam", price: 100000, quantity: 3 },
        { key: "p2:160×200×30:Putih", id: "p2", size: "160×200×30", color: "Putih", price: 250000, quantity: 2, stock: 5 },
      ],
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0].quantity, 5);
    assert.equal(Number.isNaN(merged[0].quantity), false);
    assert.equal(merged[1].quantity, 2);

    const aggregated = aggregateItems([
      { id: "lj-1-2", size: "160x200x30", color: "Putih", quantity: 2 },
      { id: "lj-1-2", size: "160×200×30", color: "Putih", quantity: 3 },
    ]);
    assert.equal(aggregated.length, 1);
    assert.equal(aggregated[0].size, "160×200×30");
    assert.equal(aggregated[0].quantity, 5);
  });

  await t.test("4. Perhitungan subtotal = harga_satuan * quantity, diskon & ongkir identik client vs server", () => {
    const sampleItems = [
      { id: "a", price: 150000, quantity: 3 }, // 450.000
    ];
    const srvSingle = calculateTotals(sampleItems, "", "local", null, 15000);
    const cliSingle = clientTotals(sampleItems, "", "standard", 15000);
    assert.equal(srvSingle.subtotal, 450000);
    assert.equal(cliSingle.subtotal, 450000);
    assert.equal(srvSingle.total, 465000);
    assert.equal(cliSingle.total, 465000);

    const multiItems = [
      { id: "a", price: 150000, quantity: 3 }, // 450.000
      { id: "b", price: 125000, quantity: 2 }, // 250.000 -> total 700.000 (Gratis ongkir >= 699.000)
    ];
    const srvMulti = calculateTotals(multiItems, "LINY10", "local", null, 15000);
    const cliMulti = clientTotals(multiItems, "LINY10", "standard", 15000);
    assert.equal(srvMulti.subtotal, 700000);
    assert.equal(srvMulti.discount, 70000);
    assert.equal(srvMulti.delivery, 0);
    assert.equal(srvMulti.total, 630000);
    assert.deepEqual(cliMulti, srvMulti);
  });

  await t.test("5. Total unit keranjang SUM(quantity) & seleksi checkout parsial (checkbox)", () => {
    const sampleCart = [
      { key: "pA:M:Hitam", id: "pA", size: "M", color: "Hitam", price: 100000, quantity: 1, stock: 5 },
      { key: "pB:L:Putih", id: "pB", size: "L", color: "Putih", price: 120000, quantity: 1, stock: 5 },
      { key: "pC:XL:Biru", id: "pC", size: "XL", color: "Biru", price: 150000, quantity: 3, stock: 10 },
    ];
    assert.equal(sampleCart.length, 3);
    assert.equal(getCartItemCount(sampleCart), 5);

    // Pertama kali muat (null) memilih semua item; batal pilih sebagian tetap dipertahankan
    assert.deepEqual(reconcileSelectedKeys(sampleCart, null), ["pA:M:Hitam", "pB:L:Putih", "pC:XL:Biru"]);
    assert.deepEqual(reconcileSelectedKeys(sampleCart, ["pC:XL:Biru"]), ["pC:XL:Biru"]);
    assert.deepEqual(reconcileSelectedKeys(sampleCart, []), []);

    // Hanya produk C (3 unit) dipilih & dibayar -> produk A dan B tetap tersimpan
    const selected = sampleCart.filter((i) => i.key === "pC:XL:Biru");
    assert.equal(getCartItemCount(selected), 3);
    const partialTotals = clientTotals(selected, "", "standard", 15000);
    assert.equal(partialTotals.subtotal, 450000);
    assert.equal(partialTotals.total, 465000);

    const remainingAfterCheckout = subtractPurchased(sampleCart, selected);
    assert.equal(remainingAfterCheckout.length, 2);
    assert.equal(getCartItemCount(remainingAfterCheckout), 2);
    assert.deepEqual(
      remainingAfterCheckout.map((i) => i.id),
      ["pA", "pB"],
    );

    // Merge seleksi guest -> akun pelanggan mempertahankan item yang dicentang guest
    const mergedCart = mergeGuestCart(
      [{ key: "pA:M:Hitam", id: "pA", size: "M", color: "Hitam", price: 100000, quantity: 1, stock: 5 }],
      [{ key: "pC:XL:Biru", id: "pC", size: "XL", color: "Biru", price: 150000, quantity: 3, stock: 10 }],
    );
    assert.deepEqual(mergeGuestSelection([], ["pC:XL:Biru"], mergedCart), ["pC:XL:Biru"]);
  });
});

test("E2E Database & API: Dynamic Size Filter per Kategori + Quantity 1..4 Unit ke Checkout, DB & Payment", async (t) => {
  const dbName = `liny_jaya_qa_${Date.now()}`;
  const adminCfg = databaseConfig();
  delete adminCfg.database;
  const setupConn = await mysql.createConnection(adminCfg);
  await setupConn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await setupConn.end();

  const pool = createPool(dbName);
  let server;

  try {
    await initialize(pool);
    const xenditPayloads = [];
    let custCookie = "";

    server = createApp(pool, {
      test: true,
      env: {
        NODE_ENV: "test",
        XENDIT_SECRET_KEY: "test-xendit-key",
        APP_URL: "https://kintsugi.example.test",
      },
      gateway: {
        configured: true,
        sandbox: true,
        create: async (order) => {
          xenditPayloads.push({
            id: order.id,
            subtotal: order.subtotal,
            discount: order.discount,
            delivery: order.delivery,
            amount: order.total,
          });
          return {
            id: "inv-" + order.id,
            external_id: order.id,
            invoice_url: "https://checkout-staging.xendit.co/web/inv-" + order.id,
            amount: order.total,
            currency: "IDR",
            status: "PENDING",
            expiry_date: new Date(Date.now() + 3600 * 1000).toISOString(),
          };
        },
        get: async (invId) => ({
          id: invId,
          status: "PENDING",
          currency: "IDR",
        }),
      },
      waTransport: async () => new Response(JSON.stringify({ status: true }), { status: 200 }),
    }).listen(0, "127.0.0.1");

    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port + "/api";

    async function req(pathName, body, cookie = "", method = body ? "POST" : "GET") {
      const r = await fetch(base + pathName, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      const rawCookie = r.headers.get("set-cookie");
      const sessionCookie = rawCookie ? rawCookie.split(";")[0] : cookie;
      return { status: r.status, data, cookie: sessionCookie };
    }

    const custLogin = await req("/auth/login", {
      identifier: "pelanggan@linyjaya.test",
      password: "BelanjaLiny2026!",
    });
    assert.equal(custLogin.status, 200);
    custCookie = custLogin.cookie;

    await t.test("1. Filter Ukuran Dinamis: Fashion TIDAK menampilkan ukuran kasur Bedding & sebaliknya", async () => {
      const fashionRes = await req("/products?category=fashion&pageSize=24");
      assert.equal(fashionRes.status, 200);
      assert.ok(fashionRes.data.items.length > 0);
      const fashionSizes = fashionRes.data.facets.sizes;
      assert.ok(fashionSizes.includes("S"));
      assert.ok(fashionSizes.includes("M"));
      assert.ok(fashionSizes.includes("XL"));
      assert.ok(
        fashionSizes.every((s) => !/\d{2,3}\s*[×xX]\s*200/.test(s) && s !== "Standar" && s !== "King"),
        "Fashion facets tidak boleh berisi ukuran kasur Bedding: " + fashionSizes.join(", "),
      );

      const celanaRes = await req("/products?category=fashion&subcategory=fashion-celana&pageSize=12");
      assert.equal(celanaRes.status, 200);
      const celanaSizes = celanaRes.data.facets.sizes;
      assert.ok(celanaSizes.some((s) => ["28", "30", "32", "34", "36"].includes(s)));
      assert.ok(!celanaSizes.some((s) => /200/.test(s)));

      const beddingRes = await req("/products?category=bedding&pageSize=24");
      assert.equal(beddingRes.status, 200);
      const beddingSizes = beddingRes.data.facets.sizes;
      assert.ok(beddingSizes.some((s) => /160×200/.test(s)));
      assert.ok(
        !beddingSizes.some((s) => ["S", "M", "L", "XL", "XXL", "28", "30", "32"].includes(s)),
        "Bedding facets tidak boleh berisi ukuran baju/celana Fashion: " + beddingSizes.join(", "),
      );
    });

    await t.test("2. Filtering ukuran akurat (hanya menampilkan produk yg punya varian & stok > 0)", async () => {
      const sizeMRes = await req("/products?category=fashion&size=M&pageSize=48");
      assert.equal(sizeMRes.status, 200);
      assert.ok(sizeMRes.data.items.length > 0);
      for (const item of sizeMRes.data.items) {
        assert.equal(item.category, "fashion");
        assert.ok(item.sizes.includes("M"), `Produk ${item.id} harus memiliki ukuran M`);
      }

      const bedAscii = await req("/products?category=bedding&size=160x200x30&pageSize=24");
      const bedUnicode = await req("/products?category=bedding&size=" + encodeURIComponent("160×200×30") + "&pageSize=24");
      assert.equal(bedAscii.status, 200);
      assert.equal(bedUnicode.status, 200);
      assert.equal(bedAscii.data.total, bedUnicode.data.total);
      assert.ok(bedAscii.data.items.length > 0);

      // Pastikan filter ukuran Bedding pada kategori Fashion tidak mengembalikan produk Bedding
      const mismatch = await req("/products?category=fashion&size=" + encodeURIComponent("160×200×30"));
      assert.equal(mismatch.status, 200);
      assert.equal(mismatch.data.total, 0);
      assert.ok(mismatch.data.facets.sizes.includes("M"), "Facets tetap relevan ke kategori Fashion walau filter lama sempat terpasang");
    });

    const fashionProd = (await req("/products?category=fashion&pageSize=5")).data.items[0];
    const fashionFull = (await req("/products/" + encodeURIComponent(fashionProd.id))).data;
    const fashionVar = fashionFull.variants.find((v) => v.stock >= 5);
    assert.ok(fashionVar, "Varian Fashion dengan stok >= 5 tersedia");

    const beddingProd = (await req("/products?category=bedding&pageSize=5")).data.items[0];
    const beddingFull = (await req("/products/" + encodeURIComponent(beddingProd.id))).data;
    const beddingVar = beddingFull.variants.find((v) => v.stock >= 5);
    assert.ok(beddingVar, "Varian Bedding dengan stok >= 5 tersedia");

    await t.test("3. Publik / Guest Quote menghitung quantity 1, 3, multi-item & tolak stok berlebih", async () => {
      const q1 = await req("/checkout/quote", {
        items: [{ id: fashionFull.id, size: fashionVar.size, color: fashionVar.color, quantity: 1 }],
        coupon: "",
        shipping: "local",
      });
      assert.equal(q1.status, 200);
      assert.equal(q1.data.subtotal, fashionFull.price * 1);

      const q3 = await req("/checkout/quote", {
        items: [{ id: fashionFull.id, size: fashionVar.size, color: fashionVar.color, quantity: 3 }],
        coupon: "LINY10",
        shipping: "local",
      });
      assert.equal(q3.status, 200);
      assert.equal(q3.data.subtotal, fashionFull.price * 3);
      const expectedDisc = Math.min(Math.round(q3.data.subtotal * 0.1), 100000);
      assert.equal(q3.data.discount, expectedDisc);

      const qOver = await req("/checkout/quote", {
        items: [{ id: fashionFull.id, size: fashionVar.size, color: fashionVar.color, quantity: fashionVar.stock + 5 }],
        coupon: "",
        shipping: "local",
      });
      assert.equal(qOver.status, 409);
    });

    await t.test("4. Pembelian Xendit (3 unit) meneruskan jumlah, stok, subtotal & invoice amount identik", async () => {
      await pool.query(
        `INSERT INTO store_payment_methods(id, name, group_name, payment_type, detail, enabled, sort_order)
         VALUES('XENDIT_BCA', 'Virtual Account BCA', 'VA', 'gateway', 'Bayar via VA BCA Xendit', TRUE, 2)
         ON DUPLICATE KEY UPDATE enabled=TRUE, payment_type='gateway'`,
      );
      const initialStock = fashionVar.stock;
      const orderRes = await req(
        "/orders",
        {
          items: [{ id: fashionFull.id, size: fashionVar.size, color: fashionVar.color, quantity: 3 }],
          address: {
            name: "Budi Tester QA",
            email: "pelanggan@linyjaya.test",
            phone: "6281234567890",
            street: "Jl. Melati No. 10",
            city: "Jakarta Selatan",
            postal: "12110",
          },
          shipping: "local",
          payment: "XENDIT_BCA",
          coupon: "",
          checkoutKey: randomUUID(),
        },
        custCookie,
      );
      assert.equal(orderRes.status, 201);
      const order = orderRes.data;
      assert.equal(order.subtotal, fashionFull.price * 3);
      assert.equal(order.items.length, 1);
      assert.equal(order.items[0].quantity, 3);
      assert.equal(order.items[0].price, fashionFull.price);
      assert.equal(xenditPayloads.at(-1).amount, order.total);

      const dbItems = (await pool.query("SELECT * FROM order_items WHERE order_id=?", [order.id])).rows;
      assert.equal(dbItems.length, 1);
      assert.equal(dbItems[0].quantity, 3);
      const varAfter = (
        await pool.query("SELECT stock FROM product_variants WHERE product_id=? AND size=? AND color=?", [
          fashionFull.id,
          fashionVar.size,
          fashionVar.color,
        ])
      ).rows[0];
      assert.equal(varAfter.stock, initialStock - 3);
    });

    await t.test("5. Keranjang Multi-Produk + Dimensi ASCII `x` & Pembayaran QRIS Dinamis sesuai Total", async () => {
      const asciiSize = beddingVar.size.replace(/×/g, "x");
      const orderRes = await req(
        "/orders",
        {
          items: [
            { id: fashionFull.id, size: fashionVar.size, color: fashionVar.color, quantity: 2 },
            { id: beddingFull.id, size: asciiSize, color: beddingVar.color, quantity: 2 },
          ],
          address: {
            name: "Siti Multi Cart",
            email: "pelanggan@linyjaya.test",
            phone: "6281299990000",
            street: "Jl. Anggrek No. 5",
            city: "Bandung",
            postal: "40115",
          },
          shipping: "local",
          payment: "QRIS_DANA_MANUAL",
          coupon: "LINY10",
          checkoutKey: randomUUID(),
        },
        custCookie,
      );
      assert.equal(orderRes.status, 201);
      const order = orderRes.data;
      const expectedSub = fashionFull.price * 2 + beddingFull.price * 2;
      const expectedDiscount = Math.min(Math.round(expectedSub * 0.1), 100000);
      assert.equal(order.subtotal, expectedSub);
      assert.equal(order.discount, expectedDiscount);
      assert.equal(order.total, expectedSub - expectedDiscount + order.delivery);
      assert.equal(order.items.length, 2);
      assert.ok(order.items.every((i) => i.quantity === 2), "Setiap baris item harus menyimpan quantity 2");

      const parsedQris = parseQris(order.qris_payload);
      assert.equal(parsedQris.amount, String(order.total), "Tag 54 QRIS Dinamis harus sama persis dengan total multi-unit");
    });

    await t.test("6. Audit Kode Frontend: quantity preserved, filter reset, Panduan ukuran & Checkbox Seleksi", async () => {
      const [mainSrc, checkoutSrc, shoppingSrc, accountSrc, cssSrc] = await Promise.all([
        readFile("src/main.jsx", "utf8"),
        readFile("src/Checkout.jsx", "utf8"),
        readFile("src/ShoppingPages.jsx", "utf8"),
        readFile("src/Account.jsx", "utf8"),
        readFile("src/kintsugi.css", "utf8"),
      ]);
      assert.equal(/useEffect\(\(\)\s*=>\s*\{\s*setQuantity\(1\);\s*\},\s*\[size,\s*color\]\)/.test(mainSrc), false);
      assert.ok(mainSrc.includes("selectCategoryFilter"));
      assert.ok(mainSrc.includes("<SizeGuideContent"));
      assert.ok(mainSrc.includes("onUpdateQuantity={updateCheckoutQuantity}"));
      assert.ok(mainSrc.includes("getCartItemCount(cart)"));
      assert.ok(mainSrc.includes("cart={directPurchase ? [directPurchase] : selectedCartItems}"));
      assert.ok(mainSrc.includes("cart-selected:"));
      assert.ok(checkoutSrc.includes("checkout-qty-stepper"));
      assert.ok(shoppingSrc.includes("cart-select-all"));
      assert.ok(shoppingSrc.includes("ks-cart-check"));
      assert.ok(shoppingSrc.includes("disabled={!selectedItems.length"));
      assert.ok(accountSrc.includes("onToggleSelectAll"));
      assert.ok(cssSrc.includes(".size-guide-table-wrap"));
      assert.ok(cssSrc.includes(".catalog-filter-details .filter-fields"));
      assert.ok(cssSrc.includes(".ks-cart-select-bar"));
    });

    await t.test("7. Selective Checkout Backend + Sisa Keranjang: pilih 1 produk (3 unit) dari 3 jenis (5 unit)", async () => {
      const thirdProd = (await req("/products?category=fashion&pageSize=8")).data.items[1];
      const thirdFull = (await req("/products/" + encodeURIComponent(thirdProd.id))).data;
      const thirdVar = thirdFull.variants.find((v) => v.stock >= 5);
      assert.ok(thirdVar, "Produk ke-3 tersedia dengan stok >= 5");

      const fullCart = [
        { key: `${fashionFull.id}:${fashionVar.size}:${fashionVar.color}`, id: fashionFull.id, size: fashionVar.size, color: fashionVar.color, price: fashionFull.price, quantity: 1, stock: fashionVar.stock },
        { key: `${beddingFull.id}:${beddingVar.size}:${beddingVar.color}`, id: beddingFull.id, size: beddingVar.size, color: beddingVar.color, price: beddingFull.price, quantity: 1, stock: beddingVar.stock },
        { key: `${thirdFull.id}:${thirdVar.size}:${thirdVar.color}`, id: thirdFull.id, size: thirdVar.size, color: thirdVar.color, price: thirdFull.price, quantity: 3, stock: thirdVar.stock },
      ];
      assert.equal(getCartItemCount(fullCart), 5);

      const selectedOnly = [fullCart[2]];
      const selectiveQuote = await req("/checkout/quote", {
        items: selectedOnly.map(({ id, size, color, quantity }) => ({ id, size, color, quantity })),
        coupon: "",
        shipping: "local",
      });
      assert.equal(selectiveQuote.status, 200);
      assert.equal(selectiveQuote.data.subtotal, thirdFull.price * 3);

      const orderRes = await req(
        "/orders",
        {
          items: selectedOnly.map(({ id, size, color, quantity }) => ({ id, size, color, quantity })),
          address: {
            name: "Rina Selective Buyer",
            email: "pelanggan@linyjaya.test",
            phone: "6281277778888",
            street: "Jl. Kenanga No. 88",
            city: "Surabaya",
            postal: "60241",
          },
          shipping: "local",
          payment: "XENDIT_BCA",
          coupon: "",
          checkoutKey: randomUUID(),
        },
        custCookie,
      );
      assert.equal(orderRes.status, 201);
      const order = orderRes.data;
      assert.equal(order.subtotal, thirdFull.price * 3);
      assert.equal(order.total, selectiveQuote.data.total);
      assert.equal(order.items.length, 1);
      assert.equal(order.items[0].product_id, thirdFull.id);
      assert.equal(order.items[0].quantity, 3);
      assert.equal(xenditPayloads.at(-1).amount, order.total);

      const remaining = subtractPurchased(fullCart, order.items);
      assert.equal(remaining.length, 2);
      assert.equal(getCartItemCount(remaining), 2);
      assert.ok(remaining.some((r) => r.id === fashionFull.id && r.quantity === 1));
      assert.ok(remaining.some((r) => r.id === beddingFull.id && r.quantity === 1));
    });
  } finally {
    if (server) await new Promise((r) => server.close(r));
    await pool.end();
    const dropConn = await mysql.createConnection(adminCfg);
    await dropConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await dropConn.end();
  }
});

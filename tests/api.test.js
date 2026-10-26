import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "../server/app.js";
test("API terintegrasi: sesi, akses, checkout otoritatif, rollback, pembatalan, dan admin", async (t) => {
  const db = new PGlite();
  await db.exec(
    await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
  );
  const pool = {
    query: (sql, args) => db.query(sql, args),
    connect: async () => ({
      query: (sql, args) => db.query(sql, args),
      release() {},
    }),
  };
  await db.query(
    "INSERT INTO products(id,sku,name,category,gender,price,image,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      "lj-test",
      "SKU-TEST",
      "Kemeja Dummy",
      "Kemeja",
      "Wanita",
      299000,
      "https://example.test/dummy.jpg",
      "Produk uji",
    ],
  );
  await db.query("INSERT INTO product_variants VALUES($1,$2,$3,$4)", [
    "lj-test",
    "M",
    "#fff",
    5,
  ]);
  const server = createApp(pool).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  let cookie = "";
  async function request(path, method = "GET", body, session = cookie) {
    const res = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Cookie: session } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data, cookie: res.headers.get("set-cookie") };
  }
  const payload = {
    items: [{ id: "lj-test", size: "M", color: "#fff", quantity: 2, price: 1 }],
    address: {
      name: "Dummy User",
      email: "dummy@example.test",
      phone: "081234567890",
      street: "Jalan Contoh No. 10",
      city: "Jakarta",
      postal: "12345",
    },
    shipping: "regular",
    payment: "cod",
    coupon: "LINY10",
    total: 1,
  };
  try {
    await t.test("endpoint terlindungi dan registrasi aman", async () => {
      assert.equal((await request("/orders")).status, 401);
      const r = await request("/auth/register", "POST", {
        name: "Dummy User",
        email: "dummy@example.test",
        password: "DummyPass123!",
      });
      assert.equal(r.status, 201);
      assert.equal(r.data.password_hash, undefined);
      assert.match(r.cookie, /HttpOnly/i);
      assert.match(r.cookie, /SameSite=Strict/i);
      cookie = r.cookie.split(";")[0];
      assert.equal((await request("/admin/orders")).status, 403);
      assert.equal(
        (
          await request("/auth/login", "POST", {
            email: "dummy@example.test",
            password: "wrong",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request("/auth/register", "POST", {
            name: "Dummy User",
            email: "dummy@example.test",
            password: "DummyPass123!",
          })
        ).status,
        409,
      );
    });
    await t.test(
      "katalog SQL tersedia dan harga server mengalahkan harga browser",
      async () => {
        const catalog = await request("/products");
        assert.equal(catalog.status, 200);
        assert.equal(catalog.data[0].stock, 5);
        const r = await request("/orders", "POST", payload);
        assert.equal(r.status, 201);
        assert.equal(r.data.subtotal, 598000);
        assert.equal(r.data.discount, 59800);
        assert.equal(r.data.total, 553200);
        assert.equal(
          (await db.query("SELECT stock FROM product_variants")).rows[0].stock,
          3,
        );
      },
    );
    await t.test(
      "stok tidak cukup mengembalikan 409 tanpa pesanan baru",
      async () => {
        const r = await request("/orders", "POST", {
          ...payload,
          items: [{ ...payload.items[0], quantity: 4 }],
        });
        assert.equal(r.status, 409);
        assert.equal(
          (await db.query("SELECT COUNT(*) AS count FROM orders")).rows[0]
            .count,
          1,
        );
        assert.equal(
          (await db.query("SELECT stock FROM product_variants")).rows[0].stock,
          3,
        );
      },
    );
    await t.test(
      "rollback mengembalikan stok jika varian kedua invalid",
      async () => {
        const r = await request("/orders", "POST", {
          ...payload,
          items: [
            { ...payload.items[0], quantity: 1 },
            { id: "zz-invalid", size: "M", color: "#fff", quantity: 1 },
          ],
        });
        assert.equal(r.status, 400);
        assert.equal(
          (await db.query("SELECT stock FROM product_variants")).rows[0].stock,
          3,
        );
      },
    );
    await t.test(
      "isolasi pesanan antar pengguna dan pembatalan tepat satu kali",
      async () => {
        const mine = await request("/orders");
        assert.equal(mine.data.length, 1);
        const first = mine.data[0];
        const other = await request("/auth/register", "POST", {
          name: "Other Dummy",
          email: "other@example.test",
          password: "DummyPass123!",
        });
        const otherCookie = other.cookie.split(";")[0];
        assert.equal(
          (await request("/orders", "GET", undefined, otherCookie)).data.length,
          0,
        );
        assert.equal(
          (
            await request(
              "/orders/" + first.id + "/cancel",
              "POST",
              {},
              otherCookie,
            )
          ).status,
          404,
        );
        assert.equal(
          (await request("/orders/" + first.id + "/cancel", "POST", {})).status,
          200,
        );
        assert.equal(
          (await db.query("SELECT stock FROM product_variants")).rows[0].stock,
          5,
        );
        assert.equal(
          (await request("/orders/" + first.id + "/cancel", "POST", {})).status,
          409,
        );
        assert.equal(
          (await db.query("SELECT stock FROM product_variants")).rows[0].stock,
          5,
        );
      },
    );
    await t.test(
      "admin dapat mengedit stok dan transisi pesanan divalidasi",
      async () => {
        await db.query("UPDATE users SET role='admin' WHERE email=$1", [
          "dummy@example.test",
        ]);
        assert.equal(
          (
            await request("/admin/products/lj-test", "PATCH", {
              name: "Kemeja Diubah",
              price: 349000,
              stock: 7,
            })
          ).status,
          200,
        );
        assert.equal((await request("/products")).data[0].price, 349000);
        const r = await request("/orders", "POST", {
          ...payload,
          coupon: "",
          items: [{ ...payload.items[0], quantity: 1 }],
        });
        assert.equal(r.status, 201);
        assert.equal(
          (
            await request("/admin/orders/" + r.data.id, "PATCH", {
              status: "Selesai",
            })
          ).status,
          409,
        );
        for (const status of ["Diproses", "Dikirim", "Selesai"])
          assert.equal(
            (await request("/admin/orders/" + r.data.id, "PATCH", { status }))
              .status,
            200,
          );
        assert.equal(
          (
            await request("/admin/orders/" + r.data.id, "PATCH", {
              status: "Dibatalkan",
            })
          ).status,
          409,
        );
        assert.equal((await request("/admin/orders")).data.length, 2);
      },
    );
    await t.test(
      "admin dapat menambah, mengarsip, dan mengaktifkan kembali produk",
      async () => {
        const r = await request("/admin/products", "POST", {
          sku: "LJ-NEW-001",
          name: "Produk Baru Dummy",
          price: 199000,
          stock: 10,
          category: "T-Shirt",
          gender: "Pria",
          image: "/images/tshirt.jpg",
          description: "Produk dummy untuk pengujian admin.",
          sizes: ["S", "M"],
          colors: ["#fff", "#333"],
        });
        assert.equal(r.status, 201);
        assert.equal(
          (
            await db.query(
              "SELECT COUNT(*) AS count FROM product_variants WHERE product_id=$1",
              [r.data.id],
            )
          ).rows[0].count,
          4,
        );
        assert.equal(
          (
            await request("/admin/products/" + r.data.id, "PATCH", {
              active: false,
            })
          ).status,
          200,
        );
        assert.equal(
          (await request("/products")).data.some((p) => p.id === r.data.id),
          false,
        );
        assert.equal(
          (await request("/admin/products")).data.some(
            (p) => p.id === r.data.id && !p.active,
          ),
          true,
        );
        assert.equal(
          (
            await request("/orders", "POST", {
              ...payload,
              items: [{ id: r.data.id, size: "M", color: "#fff", quantity: 1 }],
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("/admin/products/" + r.data.id, "PATCH", {
              active: true,
            })
          ).status,
          200,
        );
        assert.equal(
          (await request("/products")).data.some((p) => p.id === r.data.id),
          true,
        );
      },
    );
    await t.test("logout mencabut sesi", async () => {
      assert.equal((await request("/auth/logout", "POST", {})).status, 200);
      assert.equal((await request("/me")).status, 401);
    });
  } finally {
    await new Promise((r) => server.close(r));
    await db.close();
  }
});

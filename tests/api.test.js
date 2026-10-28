import { test } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import {
  databaseConfig,
  createPool,
  pool as unusedPool,
} from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
import { fail, flushEmails } from "../server/integrations.js";

test("MySQL Laragon: katalog, keamanan, transaksi, pembayaran dan admin", async (t) => {
  const name = "liny_jaya_test_" + Date.now();
  assert.match(name, /^liny_jaya_test_[0-9]+$/);
  const root = await mysql.createConnection({
    ...databaseConfig(),
    database: undefined,
  });
  await root.query(
    "CREATE DATABASE \`" +
      name +
      "\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
  const db = createPool(name);
  const invoices = new Map();
  let creationCount = 0,
    createFailure = null;
  const gateway = {
    configured: true,
    sandbox: true,
    async create(o) {
      if (createFailure) throw createFailure;
      if (invoices.has(o.id)) return structuredClone(invoices.get(o.id));
      creationCount++;
      const invoice = {
        id: "inv_" + randomUUID(),
        external_id: o.id,
        amount: o.total,
        currency: "IDR",
        status: "PENDING",
        invoice_url: "https://checkout-staging.xendit.co/web/" + o.id,
        expiry_date: new Date(Date.now() + 3600000).toISOString(),
      };
      invoices.set(o.id, invoice);
      return structuredClone(invoice);
    },
    async get(id) {
      return structuredClone([...invoices.values()].find((i) => i.id === id));
    },
    async expire(id) {
      const i = [...invoices.values()].find((i) => i.id === id);
      if (i.status === "PENDING") i.status = "EXPIRED";
      return structuredClone(i);
    },
  };
  let server;
  try {
    await initialize(db, false);
    await db.query(
      "INSERT INTO products(id,sku,name,category,gender,price,image,description) VALUES(?,?,?,?,?,?,?,?)",
      [
        "a-test",
        "SKU-TEST",
        "Kemeja Linen",
        "Kemeja & Blus",
        "Wanita",
        299000,
        "/images/linen.jpg",
        "Produk untuk pengujian transaksi.",
      ],
    );
    for (const [size, color, stock] of [
      ["M", "#fff", 20],
      ["S", "#fff", 0],
      ["L", "#333", 4],
    ])
      await db.query("INSERT INTO product_variants VALUES(?,?,?,?)", [
        "a-test",
        size,
        color,
        stock,
      ]);
    let failItemInsert = false;
    const faultPool = {
      ...db,
      connect: async () => {
        const c = await db.connect();
        return {
          ...c,
          query: async (sql, args) => {
            if (failItemInsert && sql.startsWith("INSERT INTO order_items"))
              throw new Error("Kegagalan insert item untuk uji rollback");
            return c.query(sql, args);
          },
        };
      },
    };
    const otpCodes = new Map();
    server = createApp(faultPool, {
      gateway,
      env: {
        XENDIT_WEBHOOK_TOKEN: "test-secret",
        NODE_ENV: "test",
        RESEND_API_KEY: "test",
      },
      mailTransport: async (url, options) => {
        const mail = JSON.parse(options.body);
        const code = mail.subject.match(/\b\d{6}\b/)?.[0];
        if (code) otpCodes.set(mail.to[0], code);
        return new Response(JSON.stringify({ id: randomUUID() }), {
          status: 200,
        });
      },
      test: true,
    }).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port + "/api";
    let cookie = "",
      other = "";
    async function request(
      path,
      method = "GET",
      body,
      session = cookie,
      headers = {},
    ) {
      const res = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Cookie: session } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await res.json();
      if (path === "/auth/register" && res.status === 202) {
        const verified = await request(
          "/auth/otp/verify",
          "POST",
          {
            challengeId: result.challengeId,
            code: otpCodes.get(body.email.toLowerCase()),
          },
          session,
        );
        return {
          ...verified,
          status: verified.status === 200 ? 201 : verified.status,
        };
      }
      return {
        status: res.status,
        data: result,
        cookie: res.headers.get("set-cookie")?.split(";")[0],
      };
    }
    const payload = () => ({
      checkoutKey: randomUUID(),
      items: [
        { id: "a-test", size: "M", color: "#fff", quantity: 2, price: 1 },
      ],
      address: {
        name: "Pelanggan Uji",
        email: "dummy@example.test",
        phone: "081234567890",
        street: "Jalan Pengujian No. 10",
        city: "Jakarta",
        postal: "12345",
      },
      shipping: "regular",
      payment: "xendit",
      coupon: "LINY10",
      total: 1,
    });
    const stock = async () =>
      (
        await db.query(
          "SELECT stock FROM product_variants WHERE product_id='a-test' AND size='M'",
        )
      ).rows[0].stock;
    const webhook = async (invoice) =>
      request("/webhooks/xendit", "POST", invoice, "", {
        "x-callback-token": "test-secret",
      });
    const paid = (id) => {
      const i = invoices.get(id);
      i.status = "PAID";
      i.paid_amount = i.amount;
      return i;
    };
    let first;
    await t.test(
      "registrasi, hash password, sesi, duplikat dan role",
      async () => {
        assert.equal((await request("/orders")).status, 401);
        const r = await request("/auth/register", "POST", {
          name: "Pelanggan Uji",
          email: "dummy@example.test",
          password: "DummyPass123!",
        });
        assert.equal(r.status, 201);
        cookie = r.cookie;
        assert.ok(cookie);
        assert.equal(r.data.password_hash, undefined);
        const hash = (
          await db.query(
            "SELECT password_hash FROM users WHERE email='dummy@example.test'",
          )
        ).rows[0].password_hash;
        assert.match(hash, /^\$2/);
        assert.notEqual(hash, "DummyPass123!");
        assert.equal((await request("/admin/orders")).status, 403);
        assert.equal(
          (await request("/admin/products/a-test", "PATCH", { price: 1000 }))
            .status,
          403,
        );
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
              name: "Duplikat",
              email: "DUMMY@example.test",
              password: "DummyPass123!",
            })
          ).status,
          409,
        );
        other = (
          await request(
            "/auth/register",
            "POST",
            {
              name: "Akun Kedua",
              email: "other@example.test",
              password: "DummyPass123!",
            },
            "",
          )
        ).cookie;
        const csrf = await request("/orders", "POST", payload(), cookie, {
          Origin: "https://attacker.example",
        });
        assert.equal(csrf.status, 403);
      },
    );
    await t.test(
      "filter, pencarian SQL, pagination dan varian tepat",
      async () => {
        let r = await request(
          "/products?gender=Wanita&search=Linen&size=M&color=%23fff&min=200000&max=300000&sort=low&pageSize=1",
        );
        assert.equal(r.data.total, 1);
        assert.equal(r.data.items.length, 1);
        assert.equal(r.data.pages, 1);
        assert.equal(
          (await request("/products?size=M&color=%23333")).data.total,
          0,
        );
        assert.equal(
          (await request("/products?min=300000&max=1000")).status,
          400,
        );
        assert.equal(
          (await request("/products?page=2&pageSize=1")).data.items.length,
          0,
        );
        assert.equal(
          (await request("/products?search=%27%20OR%201%3D1")).data.total,
          0,
        );
        assert.equal((await request("/products/missing")).status, 404);
        r = await request("/products/a-test");
        assert.equal(r.data.variants.length, 3);
        assert.equal(r.data.variants.find((v) => v.size === "S").stock, 0);
      },
    );
    await t.test(
      "quote dan checkout memakai harga server; idempotensi checkout",
      async () => {
        const body = payload(),
          quote = await request("/checkout/quote", "POST", body);
        assert.equal(quote.data.total, 553200);
        const concurrent = await Promise.all([
          request("/orders", "POST", body),
          request("/orders", "POST", body),
        ]);
        assert.equal(concurrent[0].data.id, concurrent[1].data.id);
        let r = concurrent[0];
        first = r.data;
        assert.equal(r.status, 201);
        assert.equal(first.subtotal, 598000);
        assert.equal(first.total, 553200);
        assert.equal(first.payment_status, "PENDING");
        assert.match(first.payment_url, /xendit/);
        assert.equal(await stock(), 18);
        r = await request("/orders", "POST", body);
        assert.equal(r.data.id, first.id);
        assert.equal(await stock(), 18);
        assert.equal(creationCount, 1);
        assert.equal(
          (await request("/orders/" + first.id, "GET", undefined, other))
            .status,
          404,
        );
        assert.equal(
          (await request("/orders/" + first.id + "/payment", "POST", {}, other))
            .status,
          404,
        );
        assert.equal(
          (await request("/orders", "GET", undefined, other)).data.length,
          0,
        );
      },
    );
    await t.test(
      "stok invalid/habis dan rollback tidak meninggalkan perubahan parsial",
      async () => {
        const before = await stock();
        assert.equal(
          (
            await request("/orders", "POST", {
              ...payload(),
              items: [{ id: "a-test", size: "S", color: "#fff", quantity: 1 }],
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request("/orders", "POST", {
              ...payload(),
              items: [{ id: "a-test", size: "M", color: "#fff", quantity: 99 }],
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request("/orders", "POST", {
              ...payload(),
              items: [
                { id: "a-test", size: "M", color: "#fff", quantity: 1 },
                { id: "zz-invalid", size: "M", color: "#fff", quantity: 1 },
              ],
            })
          ).status,
          400,
        );
        assert.equal(await stock(), before);
        failItemInsert = true;
        assert.equal((await request("/orders", "POST", payload())).status, 500);
        failItemInsert = false;
        assert.equal(await stock(), before);
        assert.equal(
          (await db.query("SELECT COUNT(*) AS n FROM orders")).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "token palsu, nominal palsu dan status palsu ditolak; webhook valid idempotent",
      async () => {
        const invoice = invoices.get(first.id);
        assert.equal(
          (
            await request(
              "/webhooks/xendit",
              "POST",
              { ...invoice, status: "PAID", paid_amount: invoice.amount },
              "",
              { "x-callback-token": "wrong" },
            )
          ).status,
          401,
        );
        assert.equal((await webhook({ ...invoice, amount: 1 })).status, 409);
        assert.equal(
          (
            await webhook({
              ...invoice,
              status: "PAID",
              paid_amount: invoice.amount,
            })
          ).status,
          409,
        );
        assert.equal(
          (await webhook({ ...paid(first.id), paid_amount: 1 })).status,
          409,
        );
        assert.equal((await webhook(paid(first.id))).status, 200);
        assert.equal((await webhook(paid(first.id))).data.duplicate, true);
        let o = (await request("/orders/" + first.id)).data;
        assert.equal(o.payment_status, "PAID");
        assert.equal(o.status, "Diproses");
        assert.equal(await stock(), 18);
        invoice.status = "SETTLED";
        assert.equal((await webhook(invoice)).status, 200);
        assert.equal(
          (await request("/orders/" + first.id + "/cancel", "POST", {})).status,
          409,
        );
        assert.equal(await stock(), 18);
        assert.equal(
          (
            await db.query(
              "SELECT COUNT(*) AS n FROM email_outbox WHERE id LIKE 'paid/%'",
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "pembatalan dan expiry mengembalikan stok hanya sekali",
      async () => {
        const r = await request("/orders", "POST", payload());
        const before = await stock();
        assert.equal(
          (await request("/orders/" + r.data.id + "/cancel", "POST", {}, other))
            .status,
          404,
        );
        assert.equal(
          (await request("/orders/" + r.data.id + "/cancel", "POST", {}))
            .status,
          200,
        );
        assert.equal(await stock(), before + 2);
        assert.equal(
          (await request("/orders/" + r.data.id + "/cancel", "POST", {}))
            .status,
          409,
        );
        assert.equal((await webhook(invoices.get(r.data.id))).status, 200);
        assert.equal(await stock(), before + 2);
        const exp = await request("/orders", "POST", payload());
        const i = invoices.get(exp.data.id);
        i.status = "EXPIRED";
        assert.equal((await webhook(i)).status, 200);
        assert.equal((await webhook(i)).data.duplicate, true);
        assert.equal(await stock(), before + 2);
      },
    );
    await t.test(
      "kegagalan definitif melepaskan stok; timeout mempertahankan reservasi untuk retry",
      async () => {
        const before = await stock();
        createFailure = Object.assign(fail(502, "Gateway gagal"), {
          definitive: true,
        });
        const failed = await request("/orders", "POST", payload());
        assert.equal(failed.data.payment_status, "FAILED");
        assert.equal(await stock(), before);
        createFailure = fail(502, "Timeout");
        const pending = await request("/orders", "POST", payload());
        assert.equal(pending.data.payment_status, "CREATING");
        assert.equal(await stock(), before - 2);
        createFailure = null;
        assert.equal(
          (await request("/orders/" + pending.data.id + "/payment", "POST", {}))
            .data.payment_status,
          "PENDING",
        );
        await request("/orders/" + pending.data.id + "/cancel", "POST", {});
        assert.equal(await stock(), before);
      },
    );
    await t.test("checkout bersamaan tidak menyebabkan oversell", async () => {
      const before = await stock();
      const a = payload(),
        b = payload();
      a.items[0].quantity = before - 1;
      b.items[0].quantity = before - 1;
      const responses = await Promise.all([
        request("/orders", "POST", a),
        request("/orders", "POST", b, other),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      assert.equal(await stock(), 1);
      const winnerIndex = responses.findIndex((r) => r.status === 201);
      const cancelled = await request(
        "/orders/" +
          responses[winnerIndex].data.id +
          "/cancel",
        "POST",
        {},
        winnerIndex === 0 ? cookie : other,
      );
      assert.equal(cancelled.status, 200);
      assert.equal(await stock(), before);
    });
    await t.test(
      "admin hanya boleh transisi lunas, edit metadata dan stok satu varian, arsip menjaga sejarah",
      async () => {
        const waiting = await request("/orders", "POST", payload());
        await db.query(
          "UPDATE users SET role=\'admin\' WHERE email=\'dummy@example.test\'",
        );
        assert.equal((await request("/orders", "POST", payload())).status, 403);
        assert.equal(
          (await request("/checkout/quote", "POST", payload())).status,
          403,
        );
        assert.equal((await request("/orders")).status, 403);
        assert.equal(
          (
            await request("/admin/orders/" + waiting.data.id, "PATCH", {
              status: "Diproses",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request("/admin/orders/" + first.id, "PATCH", {
              status: "Selesai",
            })
          ).status,
          409,
        );
        for (const status of ["Dikirim", "Selesai"])
          assert.equal(
            (await request("/admin/orders/" + first.id, "PATCH", { status }))
              .status,
            200,
          );
        assert.equal(
          (
            await request("/admin/orders/" + first.id, "PATCH", {
              status: "Dibatalkan",
            })
          ).status,
          409,
        );
        const r = await request("/admin/products/a-test", "PATCH", {
          name: "Kemeja Linen Baru",
          sku: "SKU-EDIT",
          price: 309000,
          oldPrice: 399000,
          description: "Deskripsi produk terbaru.",
          variants: [{ size: "L", color: "#333", stock: 9 }],
        });
        assert.equal(r.status, 200);
        const p = (await request("/products/a-test")).data;
        assert.equal(p.variants.find((v) => v.size === "L").stock, 9);
        assert.equal(p.variants.find((v) => v.size === "M").stock, 16);
        assert.equal(
          (
            await request("/admin/products/a-test", "PATCH", {
              variants: [{ size: "XXL", color: "#fff", stock: 1 }],
            })
          ).status,
          400,
        );
        const created = await request("/admin/products", "POST", {
          name: "Produk Baru",
          sku: "LJ-NEW",
          price: 149000,
          stock: 3,
          category: "T-Shirt",
          gender: "Pria",
          image: "/images/tshirt.jpg",
          description: "Produk baru untuk pengujian.",
          sizes: ["S", "M"],
          colors: ["#fff"],
        });
        assert.equal(created.status, 201);
        assert.equal(
          (
            await request("/admin/products", "POST", {
              name: "Produk Baru",
              sku: "LJ-NEW",
              price: 149000,
              stock: 3,
              category: "T-Shirt",
              gender: "Pria",
              image: "/images/tshirt.jpg",
              description: "Produk baru untuk pengujian.",
              sizes: ["S"],
              colors: ["#fff"],
            })
          ).status,
          409,
        );
        await request("/admin/products/a-test", "PATCH", { active: false });
        assert.equal((await request("/products/a-test")).status, 404);
        assert.equal(
          (await request("/products")).data.items.some(
            (p) => p.id === "a-test",
          ),
          false,
        );
        assert.equal(
          (await request("/admin/orders")).data.find((o) => o.id === first.id)
            .items[0].name,
          "Kemeja Linen",
        );
        await request("/admin/products/a-test", "PATCH", { active: true });
        assert.equal((await request("/products/a-test")).status, 200);
        await request("/admin/orders/" + waiting.data.id, "PATCH", {
          status: "Dibatalkan",
        });
      },
    );
    await t.test(
      "Resend outbox idempotent, newsletter tersimpan, logout dan sesi kedaluwarsa",
      async () => {
        const sent = [];
        await flushEmails(
          db,
          { RESEND_API_KEY: "test", RESEND_FROM: "onboarding@resend.dev" },
          async (url, options) => {
            sent.push(options.headers["Idempotency-Key"]);
            return new Response(JSON.stringify({ id: randomUUID() }), {
              status: 200,
            });
          },
        );
        const previous = sent.length;
        await flushEmails(
          db,
          { RESEND_API_KEY: "test" },
          async (url, options) => {
            sent.push(options.headers["Idempotency-Key"]);
            return new Response(JSON.stringify({ id: randomUUID() }), {
              status: 200,
            });
          },
        );
        assert.equal(new Set(sent).size, sent.length);
        assert.ok(previous > 0);
        assert.equal(
          (
            await request("/newsletter", "POST", {
              email: "newsletter@example.test",
            })
          ).status,
          200,
        );
        assert.equal(
          (await db.query("SELECT COUNT(*) AS n FROM newsletter_subscribers"))
            .rows[0].n,
          1,
        );
        assert.equal((await request("/auth/logout", "POST", {})).status, 200);
        assert.equal((await request("/me")).status, 401);
        await db.query(
          "UPDATE sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)",
        );
        assert.equal(
          (await request("/me", "GET", undefined, other)).status,
          401,
        );
      },
    );
  } finally {
    if (server) await new Promise((r) => server.close(r));
    await db.end();
    await unusedPool.end();
    await root.query("DROP DATABASE \`" + name + "\`");
    await root.end();
  }
});

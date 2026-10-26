import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  orderSchema,
  calculateTotals,
  aggregateItems,
  transitions,
} from "./commerce.js";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const safeUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
export function createApp(pool) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "https://images.unsplash.com", "data:"],
          connectSrc: ["'self'"],
          upgradeInsecureRequests:
            process.env.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 200,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, res, next) => {
    if (["POST", "PATCH", "DELETE"].includes(req.method)) {
      const site = req.get("Sec-Fetch-Site");
      if (site === "cross-site")
        return next(fail(403, "Permintaan lintas situs ditolak."));
      const origin = req.get("Origin");
      if (
        origin &&
        origin !== `${req.protocol}://${req.get("host")}` &&
        !(
          ["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin) &&
          process.env.NODE_ENV !== "production"
        )
      )
        return next(fail(403, "Origin tidak diizinkan."));
    }
    next();
  });
  const loadUser = async (req, res, next) => {
    try {
      if (req.cookies.lj_session) {
        const r = await pool.query(
          "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>NOW()",
          [hash(req.cookies.lj_session)],
        );
        req.user = r.rows[0];
      }
      next();
    } catch (e) {
      next(e);
    }
  };
  app.use("/api", loadUser);
  const auth = (req, res, next) =>
    req.user ? next() : next(fail(401, "Silakan masuk terlebih dahulu."));
  const admin = (req, res, next) =>
    req.user?.role === "admin"
      ? next()
      : next(fail(403, "Akses admin diperlukan."));
  async function session(res, u) {
    const token = randomBytes(32).toString("hex");
    await pool.query("DELETE FROM sessions WHERE expires_at<NOW()");
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')",
      [hash(token), u.id],
    );
    res.cookie("lj_session", token, cookieOptions);
    return safeUser(u);
  }
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 25,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.get("/api/health", async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "postgresql", payments: "simulation" });
  });
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const f = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().max(254),
        password: z.string().min(8).max(72),
      })
      .parse(req.body);
    const u = {
      id: randomUUID(),
      name: f.name,
      email: f.email.toLowerCase(),
      role: "customer",
    };
    try {
      await pool.query(
        "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
        [u.id, u.name, u.email, await bcrypt.hash(f.password, 12)],
      );
    } catch (e) {
      if (e.code === "23505") throw fail(409, "Email sudah terdaftar.");
      throw e;
    }
    res.status(201).json(await session(res, u));
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const f = z
      .object({
        email: z.email().max(254),
        password: z.string().min(1).max(72),
      })
      .parse(req.body);
    const r = await pool.query("SELECT * FROM users WHERE email=$1", [
      f.email.toLowerCase(),
    ]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(f.password, u.password_hash)))
      throw fail(401, "Email atau kata sandi tidak cocok.");
    res.json(await session(res, u));
  });
  app.post("/api/auth/logout", async (req, res) => {
    if (req.cookies.lj_session)
      await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
        hash(req.cookies.lj_session),
      ]);
    res.clearCookie("lj_session", {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: cookieOptions.secure,
    });
    res.json({ ok: true });
  });
  app.get("/api/me", auth, (req, res) => res.json(safeUser(req.user)));
  async function listProducts(includeInactive = false) {
    const r = await pool.query(
      `SELECT p.*, ARRAY(SELECT DISTINCT v.size FROM product_variants v WHERE v.product_id=p.id ORDER BY v.size) AS sizes, ARRAY(SELECT DISTINCT v.color FROM product_variants v WHERE v.product_id=p.id ORDER BY v.color) AS colors, COALESCE((SELECT MIN(v.stock) FROM product_variants v WHERE v.product_id=p.id),0) AS stock FROM products p ${includeInactive ? "" : "WHERE p.active=TRUE"} ORDER BY p.id`,
    );
    return r.rows.map((p) => ({
      ...p,
      oldPrice: p.old_price,
      isNew: p.is_new,
      rating: Number(p.rating),
    }));
  }
  app.get("/api/products", async (req, res) => res.json(await listProducts()));
  app.get("/api/admin/products", auth, admin, async (req, res) =>
    res.json(await listProducts(true)),
  );
  async function readOrders(userId) {
    const r = await pool.query(
      "SELECT * FROM orders " +
        (userId ? "WHERE user_id=$1 " : "") +
        "ORDER BY created_at DESC",
      userId ? [userId] : [],
    );
    if (!r.rows.length) return [];
    const items = await pool.query(
      "SELECT * FROM order_items WHERE order_id=ANY($1)",
      [r.rows.map((o) => o.id)],
    );
    return r.rows.map((o) => ({
      ...o,
      createdAt: o.created_at,
      items: items.rows
        .filter((i) => i.order_id === o.id)
        .map((i) => ({ ...i, id: i.product_id })),
    }));
  }
  app.get("/api/orders", auth, async (req, res) =>
    res.json(await readOrders(req.user.id)),
  );
  app.post("/api/orders", auth, async (req, res) => {
    const f = orderSchema.parse(req.body),
      items = aggregateItems(f.items),
      client = await pool.connect();
    try {
      await client.query("BEGIN");
      const canonical = [];
      for (const item of items) {
        const r = await client.query(
          "SELECT p.id,p.name,p.image,p.price,v.stock FROM products p JOIN product_variants v ON v.product_id=p.id WHERE p.id=$1 AND v.size=$2 AND v.color=$3 AND p.active=TRUE FOR UPDATE OF v",
          [item.id, item.size, item.color],
        );
        const p = r.rows[0];
        if (!p) throw fail(400, "Varian produk tidak ditemukan.");
        if (p.stock < item.quantity)
          throw fail(409, `Stok ${p.name} tidak mencukupi.`);
        canonical.push({
          ...item,
          name: p.name,
          image: p.image,
          price: p.price,
        });
        await client.query(
          "UPDATE product_variants SET stock=stock-$1 WHERE product_id=$2 AND size=$3 AND color=$4",
          [item.quantity, item.id, item.size, item.color],
        );
      }
      const total = calculateTotals(canonical, f.coupon, f.shipping),
        id = "LJ-" + randomUUID();
      const r = await client.query(
        "INSERT INTO orders(id,user_id,address,shipping,payment,coupon,subtotal,discount,delivery,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
        [
          id,
          req.user.id,
          JSON.stringify(f.address),
          f.shipping,
          f.payment,
          f.coupon,
          total.subtotal,
          total.discount,
          total.delivery,
          total.total,
        ],
      );
      for (const i of canonical)
        await client.query(
          "INSERT INTO order_items(id,order_id,product_id,name,image,size,color,quantity,price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            randomUUID(),
            id,
            i.id,
            i.name,
            i.image,
            i.size,
            i.color,
            i.quantity,
            i.price,
          ],
        );
      await client.query("COMMIT");
      res
        .status(201)
        .json({
          ...r.rows[0],
          createdAt: r.rows[0].created_at,
          items: canonical,
        });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });
  async function changeStatus(id, status, userId, isAdmin) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
          "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
          [id],
        ),
        o = r.rows[0];
      if (!o || (!isAdmin && o.user_id !== userId))
        throw fail(404, "Pesanan tidak ditemukan.");
      if (
        !isAdmin &&
        (status !== "Dibatalkan" || o.status !== "Menunggu pembayaran")
      )
        throw fail(409, "Pesanan ini tidak dapat dibatalkan.");
      if (!transitions[o.status]?.includes(status))
        throw fail(409, "Perubahan status tidak diizinkan.");
      if (status === "Dibatalkan") {
        const items = await client.query(
          "SELECT * FROM order_items WHERE order_id=$1 ORDER BY product_id,size,color",
          [id],
        );
        for (const i of items.rows)
          await client.query(
            "UPDATE product_variants SET stock=stock+$1 WHERE product_id=$2 AND size=$3 AND color=$4",
            [i.quantity, i.product_id, i.size, i.color],
          );
      }
      await client.query("UPDATE orders SET status=$1 WHERE id=$2", [
        status,
        id,
      ]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  app.post("/api/orders/:id/cancel", auth, async (req, res) => {
    await changeStatus(req.params.id, "Dibatalkan", req.user.id, false);
    res.json({ ok: true });
  });
  app.get("/api/admin/orders", auth, admin, async (req, res) =>
    res.json(await readOrders()),
  );
  app.patch("/api/admin/orders/:id", auth, admin, async (req, res) => {
    const f = z
      .object({ status: z.enum(Object.keys(transitions)) })
      .parse(req.body);
    await changeStatus(req.params.id, f.status, req.user.id, true);
    res.json({ ok: true });
  });
  const productFields = {
    name: z.string().trim().min(2).max(200),
    price: z.number().int().min(1000).max(10000000),
    stock: z.number().int().min(0).max(100000),
  };
  app.post("/api/admin/products", auth, admin, async (req, res) => {
    const f = z
      .object({
        ...productFields,
        sku: z.string().regex(/^[A-Za-z0-9-]{2,40}$/),
        category: z.enum([
          "T-Shirt",
          "Kemeja & Blus",
          "Celana",
          "Luaran",
          "Sweater & Cardigan",
          "Rok & Gaun",
          "Aksesoris",
        ]),
        gender: z.enum(["Wanita", "Pria", "Anak", "Bayi"]),
        image: z
          .string()
          .max(1000)
          .refine(
            (s) =>
              /^\/images\/[a-zA-Z0-9_.-]+$/.test(s) || s.startsWith("https://"),
            "Gunakan path /images/ atau HTTPS.",
          ),
        description: z.string().trim().min(10).max(2000),
        sizes: z
          .array(z.string().regex(/^[a-zA-Z0-9]{1,10}$/))
          .min(1)
          .max(20),
        colors: z
          .array(z.string().regex(/^#[a-fA-F0-9]{3,6}$/))
          .min(1)
          .max(20),
      })
      .parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const id = "lj-" + randomUUID();
      await client.query(
        "INSERT INTO products(id,sku,name,category,gender,price,image,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          f.sku,
          f.name,
          f.category,
          f.gender,
          f.price,
          f.image,
          f.description,
        ],
      );
      for (const size of new Set(f.sizes))
        for (const color of new Set(f.colors))
          await client.query(
            "INSERT INTO product_variants(product_id,size,color,stock) VALUES($1,$2,$3,$4)",
            [id, size, color, f.stock],
          );
      await client.query("COMMIT");
      res.status(201).json({ id });
    } catch (e) {
      await client.query("ROLLBACK");
      if (e.code === "23505") throw fail(409, "SKU sudah digunakan.");
      throw e;
    } finally {
      client.release();
    }
  });
  app.patch("/api/admin/products/:id", auth, admin, async (req, res) => {
    const f = z
      .object({ ...productFields, active: z.boolean() })
      .partial()
      .refine((o) => Object.keys(o).length > 0)
      .parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "UPDATE products SET name=COALESCE($1,name),price=COALESCE($2,price),active=COALESCE($3,active) WHERE id=$4 RETURNING id",
        [f.name ?? null, f.price ?? null, f.active ?? null, req.params.id],
      );
      if (!result.rows.length) throw fail(404, "Produk tidak ditemukan.");
      if (f.stock !== undefined)
        await client.query(
          "UPDATE product_variants SET stock=$1 WHERE product_id=$2",
          [f.stock, req.params.id],
        );
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint tidak ditemukan." }),
  );
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({
          error: err.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
    if (err.type === "entity.parse.failed")
      return res.status(400).json({ error: "Format JSON tidak valid." });
    if (!err.status) console.error("Kesalahan server:", err.message);
    res
      .status(err.status || 500)
      .json({
        error: err.status
          ? err.message
          : "Server sedang bermasalah. Silakan coba lagi.",
      });
  });
  return app;
}

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { paymentMethods } from '../src/payment-methods.js';
import {
  orderSchema,
  calculateTotals,
  aggregateItems,
  transitions,
} from "./commerce.js";
import {
  createGateway,
  verifyToken,
  fail,
  queueWhatsApp,
  escapeHtml,
  flushWhatsApp,
  normalizePhone,
} from "./integrations.js";
import { createPayments, orderRow, validateInvoice } from "./payments.js";
import { createOtp, passwordSchema } from "./otp.js";

const hash = (s) => createHash("sha256").update(s).digest("hex");
const safeUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email || "",
  phone: u.phone || "",
  role: u.role,
});
const imageSchema = z
  .string()
  .max(1000)
  .refine(
    (s) =>
      /^\/images\/[a-zA-Z0-9_\/.-]+$/.test(s) ||
      /^https?:\/\//.test(s),
    "Gunakan gambar /images/... atau URL HTTPS yang valid.",
  );
const colorSchema = z.string().regex(/^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/);
const productFields = {
  name: z.string().trim().min(2).max(200),
  price: z.number().int().min(1000).max(10000000),
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
  image: imageSchema,
  description: z.string().trim().min(10).max(2000),
  oldPrice: z.number().int().min(0).max(10000000),
  isNew: z.boolean(),
};
const variantSchema = z.object({
  size: z.string().regex(/^[a-zA-Z0-9×xX\s-]{1,15}$/),
  color: colorSchema,
  stock: z.number().int().min(0).max(100000),
});
export function createApp(pool, options = {}) {
  const env = options.env || process.env;
  const gateway = options.gateway || createGateway(env);
  const payments = createPayments(pool, gateway);
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 86400000,
  };
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
          imgSrc: [
            "'self'",
            "https://down-id.img.susercontent.com",
            "https://*.susercontent.com",
            "https://images.unsplash.com",
            "data:",
          ],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: options.test ? 5000 : 400,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, res, next) => {
    if (
      !["POST", "PATCH", "DELETE"].includes(req.method) ||
      req.path === "/webhooks/xendit"
    )
      return next();
    if (req.get("Sec-Fetch-Site") === "cross-site")
      return next(fail(403, "Permintaan lintas situs ditolak."));
    const origin = req.get("Origin");
    const allowed = [env.APP_URL, req.protocol + "://" + req.get("host")];
    if (env.NODE_ENV !== "production")
      allowed.push(
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
      );
    if (origin && !allowed.includes(origin))
      return next(fail(403, "Origin tidak diizinkan."));
    next();
  });
  app.post("/api/webhooks/xendit", async (req, res) => {
    if (!verifyToken(req.get("x-callback-token"), env.XENDIT_WEBHOOK_TOKEN))
      throw fail(401, "Token webhook tidak valid.");
    const f = z
      .object({
        id: z.string().min(1),
        external_id: z.string().min(1),
        status: z.enum(["PENDING", "PAID", "SETTLED", "EXPIRED", "FAILED"]),
        amount: z.number().int().positive(),
        currency: z.literal("IDR"),
        paid_amount: z.number().optional(),
      })
      .parse(req.body);
    const order = (
      await pool.query("SELECT * FROM orders WHERE id=?", [f.external_id])
    ).rows[0];
    if (!order) throw fail(404, "Pesanan tidak ditemukan.");
    validateInvoice(f, order);
    // Konfirmasi langsung ke Xendit sebelum menerima notifikasi.
    const verified = await gateway.get(f.id);
    validateInvoice(verified, order);
    if (
      f.status !== verified.status &&
      !(f.status === "PAID" && verified.status === "SETTLED")
    )
      throw fail(409, "Status webhook belum cocok dengan Xendit.");
    const result = await payments.apply(verified);
    res.json(result);
  });
  app.use("/api", async (req, res, next) => {
    if (req.cookies.lj_session)
      req.user = (
        await pool.query(
          "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3)",
          [hash(req.cookies.lj_session)],
        )
      ).rows[0];
    next();
  });
  const auth = (req, res, next) =>
    req.user ? next() : next(fail(401, "Silakan masuk terlebih dahulu."));
  const admin = (req, res, next) =>
    req.user?.role === "admin"
      ? next()
      : next(fail(403, "Akses admin diperlukan."));
  const customer = (req, res, next) =>
    req.user?.role === "customer"
      ? next()
      : next(
        fail(
          403,
          "Akun admin hanya untuk mengelola toko. Gunakan akun pelanggan untuk berbelanja.",
        ),
      );
  async function session(req, res, user) {
    if (req.cookies.lj_session)
      await pool.query("DELETE FROM sessions WHERE token_hash=?", [
        hash(req.cookies.lj_session),
      ]);
    await pool.query("DELETE FROM sessions WHERE expires_at<UTC_TIMESTAMP(3)");
    const token = randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 7 DAY))",
      [hash(token), user.id],
    );
    res.cookie("lj_session", token, cookieOptions);
    return safeUser(user);
  }
  const authLimit = rateLimit({
    windowMs: 900000,
    limit: options.test ? 500 : 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.get("/api/health", async (req, res) => {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      database: "mysql",
      serviceVersion: 2,
      payments: gateway.configured ? "xendit" : "unconfigured",
      sandbox: gateway.sandbox,
    });
  });
  app.get("/api/config", (req, res) =>
    res.json({
      brand: "Kintsugi",
      registrationRequiresOtp: true,
      contact: env.STORE_CONTACT_EMAIL || "wirayuda101101@gmail.com",
      contactPhone: env.STORE_CONTACT_PHONE || "",
      payments: gateway.configured,
      paymentMethods: paymentMethods.filter((method) => !env.PAYMENT_METHODS || env.PAYMENT_METHODS.split(',').map((value) => value.trim()).includes(method.id)),
      sandbox: gateway.sandbox,
      invoiceDuration: Number(env.INVOICE_DURATION) || 3600,
      whatsappConfigured: Boolean(env.WABLAS_TOKEN),
    }),
  );
  const otp = createOtp({
    pool,
    env,
    transport: options.waTransport || options.mailTransport,
    session,
  });
  app.post("/api/auth/register", authLimit, async (req, res) =>
    res.status(202).json(await otp.register(req.body)),
  );
  app.post("/api/auth/checkout", authLimit, async (req, res) =>
    res.status(202).json(await otp.checkout(req.body)),
  );
  app.post("/api/auth/otp/request", authLimit, async (req, res) =>
    res.status(202).json(await otp.request(req.body)),
  );
  app.post("/api/auth/otp/verify", authLimit, async (req, res) =>
    res.json(await otp.verify(req, res)),
  );
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const f = z
      .object({
        phone: z.string().min(1).max(20).optional(),
        email: z.email().max(254).optional(),
        password: z.string().min(1).max(72),
      })
      .refine((o) => o.phone || o.email, "Masukkan nomor WhatsApp atau email.")
      .parse(req.body);
    let u;
    if (f.phone) {
      const phone = normalizePhone(f.phone);
      u = (await pool.query("SELECT * FROM users WHERE phone=?", [phone]))
        .rows[0];
    } else {
      u = (
        await pool.query("SELECT * FROM users WHERE email=?", [
          f.email.toLowerCase(),
        ])
      ).rows[0];
    }
    if (!u || !(await bcrypt.compare(f.password, u.password_hash)))
      throw fail(401, "Nomor WhatsApp/email atau kata sandi tidak cocok.");
    res.json(await session(req, res, u));
  });
  app.post("/api/auth/logout", async (req, res) => {
    if (req.cookies.lj_session)
      await pool.query("DELETE FROM sessions WHERE token_hash=?", [
        hash(req.cookies.lj_session),
      ]);
    res.clearCookie("lj_session", { ...cookieOptions, maxAge: undefined });
    res.json({ ok: true });
  });
  app.get("/api/me", auth, (req, res) => res.json(safeUser(req.user)));
  app.get("/api/me/profile", auth, customer, async (req, res) => {
    const p =
      (
        await pool.query(
          "SELECT phone AS profile_phone,street,city,postal FROM customer_profiles WHERE user_id=?",
          [req.user.id],
        )
      ).rows[0] || {};
    res.json({ ...safeUser(req.user), ...p });
  });
  app.patch("/api/me/profile", auth, customer, async (req, res) => {
    const f = z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: z.string().regex(/^[0-9+ ()-]{8,20}$/),
        street: z.string().trim().min(10).max(500),
        city: z.string().trim().min(2).max(100),
        postal: z.string().regex(/^\d{5}$/),
      })
      .parse(req.body);
    const c = await pool.connect();
    try {
      await c.query("START TRANSACTION");
      await c.query("UPDATE users SET name=? WHERE id=?", [
        f.name,
        req.user.id,
      ]);
      await c.query(
        "INSERT INTO customer_profiles(user_id,phone,street,city,postal) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE phone=VALUES(phone),street=VALUES(street),city=VALUES(city),postal=VALUES(postal)",
        [req.user.id, f.phone, f.street, f.city, f.postal],
      );
      await c.query("COMMIT");
      res.json({ ...safeUser(req.user), ...f });
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.patch("/api/auth/password", auth, authLimit, async (req, res) => {
    const f = z
      .object({
        oldPassword: z.string().min(1).max(72),
        newPassword: passwordSchema,
      })
      .parse(req.body);
    if (!(await bcrypt.compare(f.oldPassword, req.user.password_hash)))
      throw fail(400, "Kata sandi saat ini tidak cocok.");
    await pool.query("UPDATE users SET password_hash=? WHERE id=?", [
      await bcrypt.hash(f.newPassword, 12),
      req.user.id,
    ]);
    await pool.query("DELETE FROM sessions WHERE user_id=?", [req.user.id]);
    res.json(await session(req, res, req.user));
  });

  function presentProduct(p, variants) {
    return {
      ...p,
      active: Boolean(p.active),
      oldPrice: p.old_price,
      isNew: Boolean(p.is_new),
      rating: Number(p.rating),
      sizes: [...new Set(variants.map((v) => v.size))].sort((a, b) => {
        const sizes = ["XS", "S", "M", "L", "XL", "XXL"];
        const x = sizes.indexOf(a),
          y = sizes.indexOf(b);
        return x >= 0 && y >= 0
          ? x - y
          : a.localeCompare(b, undefined, { numeric: true });
      }),
      colors: [...new Set(variants.map((v) => v.color))],
      stock: variants.reduce((s, v) => s + v.stock, 0),
      variants,
      images: [p.image],
    };
  }
  async function hydrate(rows) {
    if (!rows.length) return [];
    const variants = (
      await pool.query(
        "SELECT * FROM product_variants WHERE product_id IN (?) ORDER BY product_id,size,color",
        [rows.map((p) => p.id)],
      )
    ).rows;
    return rows.map((p) =>
      presentProduct(
        p,
        variants.filter((v) => v.product_id === p.id),
      ),
    );
  }
  app.get("/api/products", async (req, res) => {
    const q = z
      .object({
        search: z.string().max(100).default(""),
        gender: z.enum(["Wanita", "Pria", "Anak", "Bayi"]).optional(),
        category: z.string().max(100).default("Semua"),
        size: z.string().max(10).optional(),
        color: colorSchema.optional(),
        min: z.coerce.number().int().min(0).default(0),
        max: z.coerce.number().int().min(0).max(10000000).default(10000000),
        sort: z
          .enum(["recommended", "low", "high", "rating"])
          .default("recommended"),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        pageSize: z.coerce.number().int().min(1).max(48).default(8),
        ids: z.string().max(4000).optional(),
      })
      .parse(req.query);
    if (q.min > q.max) throw fail(400, "Harga minimum melebihi maksimum.");
    const where = ["p.active=TRUE", "p.price BETWEEN ? AND ?"],
      args = [q.min, q.max];
    if (q.gender) {
      where.push("p.gender=?");
      args.push(q.gender);
    }
    if (q.search) {
      where.push("(p.name LIKE ? OR p.category LIKE ?)");
      args.push("%" + q.search + "%", "%" + q.search + "%");
    }
    if (q.category === "Produk Baru") where.push("p.is_new=TRUE");
    else if (q.category === "Penawaran Terbatas")
      where.push("p.old_price>p.price");
    else if (q.category !== "Semua") {
      where.push("p.category=?");
      args.push(q.category);
    }
    if (q.ids !== undefined) {
      where.push("p.id IN (?)");
      args.push(q.ids.split(",").filter(Boolean).slice(0, 100));
      if (!args.at(-1).length) args[args.length - 1] = ["__empty__"];
    }
    if (q.size || q.color) {
      let variant =
        "EXISTS(SELECT 1 FROM product_variants v WHERE v.product_id=p.id";
      if (q.size) {
        variant += " AND v.size=?";
        args.push(q.size);
      }
      if (q.color) {
        variant += " AND v.color=?";
        args.push(q.color);
      }
      where.push(variant + ")");
    }
    const clause = where.join(" AND ");
    const total = (
      await pool.query(
        "SELECT COUNT(*) AS total FROM products p WHERE " + clause,
        args,
      )
    ).rows[0].total;
    const order = {
      recommended: "p.is_new DESC,p.id",
      low: "p.price ASC,p.id",
      high: "p.price DESC,p.id",
      rating: "p.rating DESC,p.id",
    }[q.sort];
    const rows = (
      await pool.query(
        "SELECT p.* FROM products p WHERE " +
        clause +
        " ORDER BY " +
        order +
        " LIMIT ? OFFSET ?",
        [...args, q.pageSize, (q.page - 1) * q.pageSize],
      )
    ).rows;
    const facets = (
      await pool.query(
        "SELECT DISTINCT v.size,v.color FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.active=TRUE ORDER BY v.size,v.color",
      )
    ).rows;
    res.json({
      items: await hydrate(rows),
      total,
      page: q.page,
      pageSize: q.pageSize,
      pages: Math.ceil(total / q.pageSize),
      facets: {
        sizes: [...new Set(facets.map((v) => v.size))],
        colors: [...new Set(facets.map((v) => v.color))],
      },
    });
  });
  app.get("/api/products/:id", async (req, res) => {
    const rows = (
      await pool.query("SELECT * FROM products WHERE id=? AND active=TRUE", [
        req.params.id,
      ])
    ).rows;
    if (!rows.length)
      throw fail(404, "Produk tidak tersedia atau sudah diarsipkan.");
    res.json((await hydrate(rows))[0]);
  });
  app.get("/api/admin/products", auth, admin, async (req, res) =>
    res.json(
      await hydrate(
        (await pool.query("SELECT * FROM products ORDER BY id")).rows,
      ),
    ),
  );

  async function readOrders(userId, id) {
    const filters = [],
      args = [];
    if (userId) {
      filters.push("user_id=?");
      args.push(userId);
    }
    if (id) {
      filters.push("id=?");
      args.push(id);
    }
    const rows = (
      await pool.query(
        "SELECT * FROM orders" +
        (filters.length ? " WHERE " + filters.join(" AND ") : "") +
        " ORDER BY created_at DESC",
        args,
      )
    ).rows;
    if (!rows.length) return [];
    const items = (
      await pool.query(
        "SELECT * FROM order_items WHERE order_id IN (?) ORDER BY product_id,size,color",
        [rows.map((o) => o.id)],
      )
    ).rows;
    return rows.map((o) => ({
      ...orderRow(o),
      items: items
        .filter((i) => i.order_id === o.id)
        .map((i) => ({ ...i, id: i.product_id })),
    }));
  }
  async function ownOrder(req) {
    const rows = await readOrders(
      req.user.role === "admin" ? undefined : req.user.id,
      req.params.id,
    );
    if (!rows.length) throw fail(404, "Pesanan tidak ditemukan.");
    return rows[0];
  }
  app.get("/api/orders", auth, customer, async (req, res) =>
    res.json(await readOrders(req.user.id)),
  );
  app.get("/api/orders/:id", auth, customer, async (req, res) =>
    res.json(await ownOrder(req)),
  );
  app.post(
    "/api/checkout/quote",
    (req, res, next) => (req.user ? customer(req, res, next) : next()),
    async (req, res) => {
      const f = orderSchema
        .omit({ address: true, checkoutKey: true, payment: true })
        .parse(req.body);
      const canonical = [];
      for (const i of aggregateItems(f.items)) {
        const p = (
          await pool.query(
            "SELECT p.*,v.stock FROM products p JOIN product_variants v ON v.product_id=p.id WHERE p.id=? AND v.size=? AND v.color=? AND p.active=TRUE",
            [i.id, i.size, i.color],
          )
        ).rows[0];
        if (!p) throw fail(400, "Varian produk tidak tersedia.");
        if (p.stock < i.quantity)
          throw fail(409, "Stok " + p.name + " tidak mencukupi.");
        canonical.push({
          ...i,
          name: p.name,
          image: p.image,
          price: p.price,
          stock: p.stock,
        });
      }
      res.json({
        ...calculateTotals(canonical, f.coupon, f.shipping),
        items: canonical,
      });
    },
  );
  app.post("/api/orders", auth, customer, async (req, res) => {
    if (!gateway.configured)
      throw fail(503, "Pembayaran belum tersedia. Hubungi pengelola.");
    const f = orderSchema.parse(req.body),
      items = aggregateItems(f.items);
    if (env.PAYMENT_METHODS && f.payment !== 'xendit' && !env.PAYMENT_METHODS.split(',').map((value) => value.trim()).includes(f.payment)) throw fail(400, 'Metode pembayaran belum tersedia. Pilih metode lain.');
    const c = await pool.connect();
    let id;
    try {
      await c.query("START TRANSACTION");
      await c.query("SELECT id FROM users WHERE id=? FOR UPDATE", [
        req.user.id,
      ]);
      const existing = (
        await c.query(
          "SELECT id FROM orders WHERE user_id=? AND checkout_key=?",
          [req.user.id, f.checkoutKey],
        )
      ).rows[0];
      if (existing) id = existing.id;
      else {
        const canonical = [];
        for (const i of items) {
          const p = (
            await c.query(
              "SELECT p.id,p.name,p.image,p.price,v.stock FROM products p JOIN product_variants v ON v.product_id=p.id WHERE p.id=? AND v.size=? AND v.color=? AND p.active=TRUE FOR UPDATE",
              [i.id, i.size, i.color],
            )
          ).rows[0];
          if (!p) throw fail(400, "Varian produk tidak ditemukan.");
          if (p.stock < i.quantity)
            throw fail(409, "Stok " + p.name + " tidak mencukupi.");
          canonical.push({
            ...i,
            name: p.name,
            image: p.image,
            price: p.price,
          });
          await c.query(
            "UPDATE product_variants SET stock=stock-? WHERE product_id=? AND size=? AND color=?",
            [i.quantity, i.id, i.size, i.color],
          );
        }
        const total = calculateTotals(canonical, f.coupon, f.shipping);
        id = "LJ-" + randomUUID();
        await c.query(
          "INSERT INTO orders(id,user_id,address,shipping,payment,coupon,subtotal,discount,delivery,total,checkout_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
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
            f.checkoutKey,
          ],
        );
        for (const i of canonical)
          await c.query(
            "INSERT INTO order_items(id,order_id,product_id,name,image,size,color,quantity,price) VALUES(?,?,?,?,?,?,?,?,?)",
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
        // Kirim notifikasi pesanan via WhatsApp
        await queueWhatsApp(
          c,
          "order/" + id,
          f.address.phone,
          `*Kintsugi - Pesanan Tersimpan*\n\n` +
          `Halo ${f.address.name}, pesanan ${id} telah tersimpan.\n` +
          `Total: Rp${total.total.toLocaleString("id-ID")}\n\n` +
          `Lanjutkan pembayaran melalui halaman akun Anda.`,
        );
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      if (e.code !== "ER_DUP_ENTRY") throw e;
      id = (
        await pool.query(
          "SELECT id FROM orders WHERE user_id=? AND checkout_key=?",
          [req.user.id, f.checkoutKey],
        )
      ).rows[0]?.id;
      if (!id) throw e;
    } finally {
      c.release();
    }
    let paymentError;
    try {
      await payments.ensure(id);
    } catch (e) {
      paymentError = e.message;
    }
    const order = (await readOrders(req.user.id, id))[0];
    res.status(201).json({ ...order, paymentError });
  });
  app.post("/api/orders/:id/payment", auth, customer, async (req, res) => {
    const order = await ownOrder(req);
    await payments.sync(order);
    res.json(
      (
        await readOrders(
          req.user.role === "admin" ? undefined : req.user.id,
          order.id,
        )
      )[0],
    );
  });
  app.post("/api/orders/:id/cancel", auth, customer, async (req, res) => {
    const order = await ownOrder(req);
    await payments.cancel(order);
    res.json({ ok: true });
  });
  app.get("/api/admin/orders", auth, admin, async (req, res) =>
    res.json(await readOrders()),
  );
  app.post("/api/admin/orders/:id/payment", auth, admin, async (req, res) => {
    const order = await ownOrder(req);
    await payments.sync(order);
    res.json((await readOrders(undefined, order.id))[0]);
  });
  app.patch("/api/admin/orders/:id", auth, admin, async (req, res) => {
    const f = z
      .object({ status: z.enum(Object.keys(transitions)) })
      .parse(req.body);
    const order = await ownOrder(req);
    if (f.status === "Dibatalkan") {
      await payments.cancel(order);
      return res.json({ ok: true });
    }
    const c = await pool.connect();
    try {
      await c.query("START TRANSACTION");
      const o = (
        await c.query("SELECT * FROM orders WHERE id=? FOR UPDATE", [order.id])
      ).rows[0];
      if (
        o.payment_status !== "PAID" ||
        !transitions[o.status]?.includes(f.status)
      )
        throw fail(
          409,
          "Perubahan status tidak diizinkan. Pembayaran harus dikonfirmasi Xendit.",
        );
      await c.query("UPDATE orders SET status=? WHERE id=?", [f.status, o.id]);
      const a = orderRow(o).address;
      // Kirim notifikasi status pesanan via WhatsApp
      await queueWhatsApp(
        c,
        "status/" + o.id + "/" + f.status,
        a.phone,
        `*Kintsugi - Status Pesanan*\n\n` +
        `Pesanan ${o.id} telah diperbarui.\n` +
        `Status: *${f.status}*\n\n` +
        `Terima kasih telah berbelanja di Kintsugi.`,
      );
      await c.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.post("/api/admin/products", auth, admin, async (req, res) => {
    const f = z
      .object({
        ...productFields,
        oldPrice: productFields.oldPrice.default(0),
        isNew: productFields.isNew.default(true),
        sizes: z.array(variantSchema.shape.size).min(1).max(20),
        colors: z.array(colorSchema).min(1).max(20),
        stock: variantSchema.shape.stock,
      })
      .parse(req.body);
    if (f.oldPrice && f.oldPrice <= f.price)
      throw fail(400, "Harga sebelum diskon harus melebihi harga jual.");
    const c = await pool.connect();
    try {
      await c.query("START TRANSACTION");
      const id = "lj-" + randomUUID();
      await c.query(
        "INSERT INTO products(id,sku,name,category,gender,price,old_price,image,description,is_new) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [
          id,
          f.sku,
          f.name,
          f.category,
          f.gender,
          f.price,
          f.oldPrice,
          f.image,
          f.description,
          f.isNew,
        ],
      );
      for (const s of new Set(f.sizes))
        for (const color of new Set(f.colors))
          await c.query(
            "INSERT INTO product_variants(product_id,size,color,stock) VALUES(?,?,?,?)",
            [id, s, color, f.stock],
          );
      await c.query("COMMIT");
      res.status(201).json({ id });
    } catch (e) {
      await c.query("ROLLBACK");
      if (e.code === "ER_DUP_ENTRY") throw fail(409, "SKU sudah digunakan.");
      throw e;
    } finally {
      c.release();
    }
  });
  app.patch("/api/admin/products/:id", auth, admin, async (req, res) => {
    const f = z
      .object({
        ...productFields,
        active: z.boolean(),
        variants: z.array(variantSchema).min(1).max(400),
      })
      .partial()
      .strict()
      .refine((o) => Object.keys(o).length > 0)
      .parse(req.body);
    const c = await pool.connect();
    try {
      await c.query("START TRANSACTION");
      const old = (
        await c.query("SELECT * FROM products WHERE id=? FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!old) throw fail(404, "Produk tidak ditemukan.");
      const price = f.price ?? old.price,
        oldPrice = f.oldPrice ?? old.old_price;
      if (oldPrice && oldPrice <= price)
        throw fail(400, "Harga sebelum diskon harus melebihi harga jual.");
      const map = { ...f };
      delete map.variants;
      const names = { oldPrice: "old_price", isNew: "is_new" };
      if (Object.keys(map).length)
        await c.query(
          "UPDATE products SET " +
          Object.keys(map)
            .map((k) => (names[k] || k) + "=?")
            .join(",") +
          " WHERE id=?",
          [...Object.values(map), req.params.id],
        );
      if (f.variants) {
        const keys = f.variants.map((v) => v.size + ":" + v.color);
        if (new Set(keys).size !== keys.length)
          throw fail(400, "Varian duplikat.");
        for (const v of f.variants) {
          const found = (
            await c.query(
              "SELECT stock FROM product_variants WHERE product_id=? AND size=? AND color=? FOR UPDATE",
              [req.params.id, v.size, v.color],
            )
          ).rows[0];
          if (!found)
            throw fail(
              400,
              "Varian tidak ditemukan. Buat produk baru untuk kombinasi ukuran/warna baru.",
            );
          await c.query(
            "UPDATE product_variants SET stock=? WHERE product_id=? AND size=? AND color=?",
            [v.stock, req.params.id, v.size, v.color],
          );
        }
      }
      await c.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await c.query("ROLLBACK");
      if (e.code === "ER_DUP_ENTRY") throw fail(409, "SKU sudah digunakan.");
      throw e;
    } finally {
      c.release();
    }
  });
  app.get("/api/admin/status", auth, admin, async (req, res) => {
    const wa = (
      await pool.query(
        "SELECT status,COUNT(*) AS count FROM wa_outbox GROUP BY status",
      )
    ).rows;
    res.json({
      database: "MySQL",
      gateway: gateway.configured,
      sandbox: gateway.sandbox,
      whatsappConfigured: Boolean(env.WABLAS_TOKEN),
      whatsappHost: env.WABLAS_API_HOST || "https://smg.wablas.com",
      whatsapp: wa,
    });
  });
  app.post("/api/newsletter", authLimit, async (req, res) => {
    const f = z.object({ email: z.email().max(254) }).parse(req.body);
    await pool.query(
      "INSERT IGNORE INTO newsletter_subscribers(email) VALUES(?)",
      [f.email.toLowerCase()],
    );
    res.json({ ok: true });
  });
  app.locals.background = async () => {
    const { rows } = await pool.query(
      "SELECT * FROM orders WHERE payment_status IN ('CREATING','PENDING') ORDER BY created_at LIMIT 30",
    );
    for (const order of rows)
      try {
        await payments.sync(order);
      } catch (e) {
        console.error("Sinkronisasi pembayaran:", order.id, e.message);
      }
    await flushWhatsApp(
      pool,
      env,
      options.waTransport || options.mailTransport,
    );
  };
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint tidak ditemukan." }),
  );
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: err.issues
          .map((i) => i.path.join(".") + ": " + i.message)
          .join("; "),
      });
    if (err.type === "entity.parse.failed")
      return res.status(400).json({ error: "Format JSON tidak valid." });
    if (!err.status)
      console.error("Kesalahan server:", err.code || err.message);
    res.status(err.status || 500).json({
      error: err.status
        ? err.message
        : "Server sedang bermasalah. Silakan coba lagi.",
      ...(typeof err.code === "string" && err.code.startsWith("WA_")
        ? { code: err.code }
        : {}),
    });
  });
  return app;
}

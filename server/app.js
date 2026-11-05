import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  renderWhatsAppTemplate,
  escapeHtml,
  flushWhatsApp,
  normalizePhone,
} from "./integrations.js";
import { createPayments, orderRow, validateInvoice } from "./payments.js";
import { createOtp, passwordSchema } from "./otp.js";
import { parseDimensions } from "../src/dimensions.js";

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
      /^\/(?:images|uploads|brand)\/[a-zA-Z0-9_\/.-]+$/.test(s) ||
      /^https?:\/\//.test(s),
    "Gunakan gambar /images/... atau URL HTTPS yang valid.",
  );
const colorSchema = z.string().trim().min(1).max(100);
const parseMoneyInt = (v, fallback = 0) => {
  if (v == null || v === "") return fallback;
  if (typeof v === "number") return isNaN(v) ? fallback : Math.round(v);
  const clean = String(v).replace(/\D/g, "");
  return clean ? parseInt(clean, 10) : fallback;
};

const productFields = {
  name: z.string().trim().min(2).max(200),
  price: z.preprocess((v) => parseMoneyInt(v, v), z.number().int().min(1000).max(10000000)),
  sku: z.string().regex(/^[A-Za-z0-9-]{2,40}$/),
  category: z.string().trim().min(1).max(100),
  subcategory: z.string().trim().max(100).default(""),
  image: imageSchema,
  motif: z.string().trim().max(100).default(""),
  description: z.string().trim().min(10).max(2000),
  oldPrice: z.preprocess((v) => parseMoneyInt(v, 0), z.number().int().min(0).max(10000000).default(0)),
  costPrice: z.preprocess((v) => parseMoneyInt(v, 0), z.number().int().min(0).max(10000000).default(0)),
  weightGrams: z.number().int().min(1).max(500000).default(1000),
  variationLabel: z.string().trim().min(1).max(80).default("Warna"),
  isNew: z.boolean(),
};
const variantSchema = z.object({
  size: z.string().trim().min(1).max(30),
  color: colorSchema,
  stock: z.number().int().min(0).max(100000),
  imageUrl: imageSchema.optional(),
  lengthCm: z.number().int().min(0).max(500).optional(),
  widthCm: z.number().int().min(0).max(500).optional(),
  heightCm: z.number().int().min(0).max(500).optional(),
});
export const DEFAULT_WA_TEMPLATES = {
  otp: "*[toko] - Kode Verifikasi*\n\nHalo [nama],\n\nKode OTP verifikasi akun Anda adalah: *[kode_otp]*\n\nKode berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun demi keamanan akun Anda di [toko].",
  purchased: "Halo [nama], pembayaran pesanan [nomor_pesanan] sebesar [total] berhasil dikonfirmasi. Pesanan Anda segera disiapkan oleh [toko]. Terima kasih!",
  processing: "Halo [nama], pesanan [nomor_pesanan] sedang diproses dan dikemas dengan teliti oleh tim [toko]. Kami akan mengabari saat pesanan siap dikirim.",
  shipped: "Halo [nama], pesanan [nomor_pesanan] telah dikirim menggunakan kurir [kurir]. Nomor resi pengiriman Anda: *[nomor_resi]*. Lacak pesanan Anda secara berkala.",
  delivered: "Halo [nama], pesanan [nomor_pesanan] telah sampai di tujuan. Terima kasih telah berbelanja di [toko]. Semoga Anda puas dengan produk kami!",
  cancelled: "Halo [nama], pesanan [nomor_pesanan] telah dibatalkan. Jika ada pertanyaan atau membutuhkan bantuan, silakan hubungi layanan pelanggan [toko].",
};

export function createApp(pool, options = {}) {
  const env = options.env || process.env;
  const gateway = options.gateway || createGateway(env);
  const payments = createPayments(pool, gateway);
  const app = express();
  app.disable("x-powered-by");
  app.use("/uploads", express.static(fileURLToPath(new URL("../public/uploads/", import.meta.url)), { fallthrough: false, maxAge: "7d", immutable: true }));
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
  app.use(express.json({ limit: "8mb" }));
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
  const allowRoles = (...roles) => (req, res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : next(fail(403, "Peran akun Anda tidak memiliki akses ke fitur ini."));
  const admin = allowRoles("admin");
  const leader = allowRoles("admin", "manager");
  const operations = allowRoles("admin", "manager", "staff");
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
    limit: options.test ? 500 : 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Terlalu banyak percobaan autentikasi. Silakan tunggu beberapa menit sebelum mencoba kembali.",
      code: "RATE_LIMITED",
    },
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

  async function readStoreSettings() {
    const rows = (await pool.query("SELECT setting_key,setting_value FROM store_settings")).rows;
    const settings = Object.fromEntries(rows.map(({ setting_key, setting_value }) => [
      setting_key,
      typeof setting_value === "string" ? (() => { try { return JSON.parse(setting_value); } catch { return setting_value; } })() : setting_value,
    ]));
    settings.waTemplates = {
      ...DEFAULT_WA_TEMPLATES,
      ...(settings.waTemplates || {}),
    };
    return settings;
  }
  const promotionPrice = (price, percent) => Math.max(1000, Math.round(Number(price) * (100 - Number(percent)) / 100));
  async function readProductPromotions(productIds) {
    if (!productIds?.length) return new Map();
    const rows = (await pool.query(
      "SELECT * FROM store_promotions WHERE active=TRUE AND product_id IN (?) ORDER BY sort_order,created_at DESC",
      [productIds],
    )).rows;
    return new Map(rows.map((row) => [row.product_id, row]));
  }
  async function readPublicPromotions() {
    const rows = (await pool.query(
      "SELECT sp.*,sp.product_id AS productId,sp.discount_percent AS discountPercent,sp.promo_price AS promoPrice,p.name AS productName,p.image AS productImage,p.price AS basePrice FROM store_promotions sp JOIN products p ON p.id=sp.product_id WHERE sp.active=TRUE AND p.active=TRUE ORDER BY sp.sort_order,sp.created_at DESC",
    )).rows;
    return rows.map((row) => {
      const basePrice = Number(row.basePrice);
      const salePrice = row.promoPrice != null && Number(row.promoPrice) > 0
        ? Number(row.promoPrice)
        : promotionPrice(basePrice, row.discountPercent);
      const discountPercent = row.discountPercent || (basePrice > 0 ? Math.max(1, Math.min(90, Math.round((1 - salePrice / basePrice) * 100))) : 0);
      return {
        id: row.id,
        productId: row.productId,
        eyebrow: row.eyebrow,
        title: row.title,
        description: row.description,
        image: row.image || row.productImage,
        productName: row.productName,
        basePrice,
        price: salePrice,
        oldPrice: basePrice,
        discountPercent,
      };
    });
  }
  async function rajaFetch(pathname, init = {}) {
    if (!env.RAJAONGKIR_API_KEY) throw fail(503,"Layanan ongkir RajaOngkir belum dikonfigurasi.");
    const response=await fetch(`https://rajaongkir.komerce.id/api/v1/${pathname}`,{...init,headers:{key:env.RAJAONGKIR_API_KEY,...init.headers}});
    const result=await response.json().catch(()=>null);
    if(!response.ok || result?.meta?.status===false || result?.meta?.status==="error")
      throw fail(response.status>=500?502:400,result?.meta?.message||"Tarif RajaOngkir tidak tersedia untuk alamat ini.");
    return result?.data ?? [];
  }
  async function rajaRates(destinationId, items) {
    const settings=await readStoreSettings();
    const origin=Number(settings.rajaOriginId||env.RAJAONGKIR_ORIGIN_ID);
    if(!origin) throw fail(503,"ID asal pengiriman belum diatur di pengaturan toko.");
    const uniqueIds=[...new Set(items.map((item)=>item.id))];
    const productRows=(await pool.query("SELECT id,weight_grams FROM products WHERE id IN (?) AND active=TRUE",[uniqueIds])).rows;
    if(productRows.length!==uniqueIds.length) throw fail(400,"Ada produk yang tidak tersedia.");
    const weight=Math.max(1,productRows.reduce((sum,product)=>sum+Number(product.weight_grams||settings.packageWeightGrams||1000)*items.filter((item)=>item.id===product.id).reduce((n,item)=>n+item.quantity,0),0));
    const couriers=["jne","jnt","sicepat","tiki","pos"];
    const replies=await Promise.all(couriers.map(async(courier)=>{
      try {
        const body=new URLSearchParams({origin:String(origin),destination:String(destinationId),weight:String(weight),courier,price:"lowest"});
        const data=await rajaFetch("calculate/domestic-cost",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
        return (Array.isArray(data)?data:[]).map((row)=>({courier:row.code||courier,courierName:row.name||courier.toUpperCase(),service:row.service||row.description||"Reguler",cost:Number(row.cost),etd:String(row.etd||""),weight})).filter((row)=>Number.isSafeInteger(row.cost)&&row.cost>=0);
      } catch { return []; }
    }));
    const result=replies.flat().sort((a,b)=>a.cost-b.cost);
    if(!result.length) throw fail(400,"Belum ada layanan kurir untuk tujuan tersebut.");
    return result;
  }
  async function deliveryFor(shipping, option, items) {
    const settings = await readStoreSettings();
    const manualFee = Number(settings.manualShippingFee ?? settings.localDeliveryFee ?? 15000);
    const subtotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
    const isFreeShipping = subtotal >= 699000;

    if (shipping === "pickup") {
      return {
        delivery: 0,
        name: "Ambil di Toko",
        option: { courier: "TOKO", service: "Ambil Sendiri", cost: 0 },
      };
    }

    if (shipping === "express") {
      const expressFee = isFreeShipping ? 0 : Math.max(manualFee, 35000);
      return {
        delivery: expressFee,
        name: isFreeShipping ? "Ekspres (Gratis Ongkir)" : "Pengiriman Ekspres Toko",
        option: { courier: "TOKO", service: "Ekspres", cost: expressFee },
      };
    }

    const fee = isFreeShipping ? 0 : manualFee;
    const name = isFreeShipping
      ? "Pengiriman Standar (Gratis Ongkir)"
      : (shipping === "local" ? "Kurir Toko / Pengiriman Standar" : "Pengiriman Standar Toko");

    return {
      delivery: fee,
      name,
      option: {
        courier: "TOKO",
        service: "Standar",
        cost: fee,
        ...(option && typeof option === "object" ? option : {}),
        ...(isFreeShipping ? { cost: 0 } : {}),
      },
    };
  }
  app.get("/api/shipping/destinations", async (_req, res) => {
    // API pengiriman otomatis dinonaktifkan sementara demi stabilitas checkout
    res.json([]);
  });
  app.post("/api/shipping/rates", (req, res, next) => (req.user ? customer(req, res, next) : next()), async (_req, res) => {
    // API pengiriman otomatis dinonaktifkan sementara demi stabilitas checkout
    res.json([]);
  });
  app.get("/api/config", async (req, res) => {
    const [settings, categories, methods, promotions] = await Promise.all([
      readStoreSettings(),
      pool.query("SELECT id,name,parent_id,active,sort_order FROM product_categories WHERE active=TRUE ORDER BY sort_order,name"),
      pool.query("SELECT id,name,group_name AS `group`,detail FROM store_payment_methods WHERE enabled=TRUE ORDER BY sort_order,name"),
      readPublicPromotions(),
    ]);
    const publicSettings=Object.fromEntries(Object.entries(settings).filter(([key])=>!["waTemplates","rajaOriginId"].includes(key)));
    res.json({
      ...publicSettings,
      brand: settings.brand || "Kintsugi",
      registrationRequiresOtp: true,
      contact: settings.contactEmail || env.STORE_CONTACT_EMAIL || "",
      contactPhone: env.STORE_CONTACT_PHONE || "",
      payments: gateway.configured,
      paymentMethods: methods.rows,
      categories: categories.rows.map(({ id, name, parent_id }) => ({ id, label: name, name, parentId: parent_id, parent_id })),
      promotions,
      shipping: {
        rajaOngkir: false,
        manualShippingFee: Number(settings.manualShippingFee ?? settings.localDeliveryFee ?? 15000),
        localDeliveryFee: Number(settings.localDeliveryFee ?? settings.manualShippingFee ?? 15000),
      },
      sandbox: gateway.sandbox,
      invoiceDuration: Number(env.INVOICE_DURATION) || 3600,
      whatsappConfigured: Boolean(env.WABLAS_TOKEN),
    });
  });
  app.get("/api/admin/settings", auth, admin, async (req, res) => {
    const [settings, categories, methods, promotions] = await Promise.all([
      readStoreSettings(),
      pool.query("SELECT id,name,parent_id,active,sort_order FROM product_categories ORDER BY sort_order,name"),
      pool.query("SELECT id,name,group_name AS `group`,group_name,detail,enabled,sort_order FROM store_payment_methods ORDER BY sort_order,name"),
      pool.query("SELECT sp.*,p.name AS product_name,p.price AS product_price,p.image AS product_image FROM store_promotions sp JOIN products p ON p.id=sp.product_id ORDER BY sp.sort_order,sp.created_at DESC"),
    ]);
    res.json({
      settings,
      defaultWaTemplates: DEFAULT_WA_TEMPLATES,
      categories: categories.rows.map((c) => ({ ...c, parentId: c.parent_id })),
      paymentMethods: methods.rows,
      promotions: promotions.rows,
    });
  });
  app.patch("/api/admin/settings", auth, admin, async (req, res) => {
    const f = z.object({
      settings: z.record(z.string(), z.unknown()).optional(),
      categories: z.array(z.object({
        id: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(100),
        parentId: z.string().trim().max(80).nullable().optional(),
        parent_id: z.string().trim().max(80).nullable().optional(),
        active: z.boolean(),
        sortOrder: z.number().int().min(0).max(10000).optional(),
      })).max(100).optional(),
      paymentMethods: z.array(z.object({ id: z.string().trim().min(2).max(60), enabled: z.boolean(), sortOrder: z.number().int().min(0).max(10000) })).max(40).optional(),
    }).strict().parse(req.body);
    if (f.settings) {
      const allowed = new Set(["brand","announcementText","contactEmail","storeAddress","logo","heroImage","heroKicker","heroTitle","heroText","homeSections","departmentKicker","departmentTitle","departmentProducts","essentialsKicker","essentialsTitle","essentialsProducts","promoKicker","promoTitle","promoText","promoImage","promoProductId","promoPrice","promoOldPrice","localDeliveryFee","manualShippingFee","packageWeightGrams","rajaOriginId","waTemplates"]);
      for (const [key, value] of Object.entries(f.settings)) {
        if (!allowed.has(key)) throw fail(400, "Pengaturan tidak dikenal.");
        if (key === "waTemplates") {
          const templates = z.object({
            otp: z.string().max(2000).optional(),
            purchased: z.string().max(2000).optional(),
            processing: z.string().max(2000).optional(),
            shipped: z.string().max(2000).optional(),
            delivered: z.string().max(2000).optional(),
            cancelled: z.string().max(2000).optional(),
          }).passthrough().parse(value);
          await pool.query("INSERT INTO store_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [key, JSON.stringify(templates)]);
        } else if (key === "homeSections") {
          const sections = z.array(z.object({
            id: z.string().trim().min(1).max(80),
            kicker: z.string().trim().max(160).optional().default(""),
            title: z.string().trim().max(255).optional().default(""),
            productIds: z.array(z.string().trim().max(40)).max(100).optional().default([]),
          })).max(50).parse(value);
          await pool.query("INSERT INTO store_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [key, JSON.stringify(sections)]);
        } else if (["promoPrice","promoOldPrice","localDeliveryFee","manualShippingFee","packageWeightGrams"].includes(key)) {
          const number = z.preprocess((v) => parseMoneyInt(v, v), z.number().int().min(0).max(100000000)).parse(value);
          await pool.query("INSERT INTO store_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [key, JSON.stringify(number)]);
        } else if (["essentialsProducts","departmentProducts"].includes(key)) {
          const ids = z.array(z.string().max(40)).max(24).parse(value);
          await pool.query("INSERT INTO store_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [key, JSON.stringify(ids)]);
        } else {
          const text = z.string().trim().max(2000).parse(value);
          if (["logo","heroImage","promoImage"].includes(key) && text && !/^\/(?:images|uploads|brand)\//.test(text) && !/^https:\/\//i.test(text)) throw fail(400,"URL aset harus HTTPS atau berada di folder aset toko.");
          await pool.query("INSERT INTO store_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [key, JSON.stringify(text)]);
        }
      }
    }
    if (f.categories) {
      const ids = f.categories.map((item) => item.id);
      if (new Set(ids).size !== ids.length) throw fail(400,"Kategori duplikat.");
      for (const [index, item] of f.categories.entries()) {
        const parent = item.parentId || item.parent_id || null;
        await pool.query(
          `INSERT INTO product_categories(id,name,parent_id,active,sort_order)
           VALUES(?,?,?,?,?)
           ON DUPLICATE KEY UPDATE name=VALUES(name), parent_id=VALUES(parent_id), active=VALUES(active), sort_order=VALUES(sort_order)`,
          [item.id, item.name, parent, item.active, item.sortOrder ?? index]
        );
      }
      // Delete removed categories that are NOT currently referenced by products
      if (ids.length) {
        await pool.query(
          "DELETE FROM product_categories WHERE id NOT IN (?) AND id NOT IN (SELECT DISTINCT category FROM products) AND id NOT IN (SELECT DISTINCT subcategory FROM products)",
          [ids]
        );
      }
    }
    if (f.paymentMethods) {
      const ids = f.paymentMethods.map((item) => item.id);
      if (new Set(ids).size !== ids.length) throw fail(400,"Metode pembayaran duplikat.");
      for (const method of f.paymentMethods) await pool.query("UPDATE store_payment_methods SET enabled=?,sort_order=? WHERE id=?",[method.enabled,method.sortOrder,method.id]);
    }
    res.json({ ok: true });
  });

  app.get("/api/categories", async (req, res) => {
    const rows = (await pool.query(
      "SELECT id,name,parent_id,active,sort_order FROM product_categories WHERE active=TRUE ORDER BY sort_order,name"
    )).rows;
    res.json(rows.map(({ id, name, parent_id, active, sort_order }) => ({
      id,
      label: name,
      name,
      parentId: parent_id,
      parent_id,
      active: Boolean(active),
      sortOrder: sort_order,
    })));
  });

  const categorySchema = z.object({
    id: z.string().trim().max(80).optional(),
    name: z.string().trim().min(1).max(100),
    parentId: z.string().trim().max(80).nullable().optional(),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  }).strict();

  app.post("/api/admin/categories", auth, admin, async (req, res) => {
    const f = categorySchema.parse(req.body);
    let parentId = f.parentId || null;
    if (parentId) {
      const parent = (await pool.query("SELECT id FROM product_categories WHERE id=?", [parentId])).rows[0];
      if (!parent) throw fail(400, "Kategori utama induk tidak ditemukan.");
    }
    let id = f.id;
    if (!id) {
      const slug = f.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      id = parentId ? `${parentId}-${slug}` : slug;
    }
    const existing = (await pool.query("SELECT id FROM product_categories WHERE id=?", [id])).rows[0];
    if (existing) {
      throw fail(409, `Kategori dengan ID "${id}" sudah ada. Gunakan nama lain.`);
    }
    const nextSort = f.sortOrder ?? Number((await pool.query("SELECT COALESCE(MAX(sort_order)+1,0) AS n FROM product_categories")).rows[0].n);
    await pool.query(
      "INSERT INTO product_categories(id,name,parent_id,active,sort_order) VALUES(?,?,?,?,?)",
      [id, f.name, parentId, f.active, nextSort]
    );
    res.status(201).json({ id, name: f.name, parentId, active: f.active, sortOrder: nextSort });
  });

  app.patch("/api/admin/categories/:id", auth, admin, async (req, res) => {
    const f = categorySchema.partial().strict().refine((v) => Object.keys(v).length > 0).parse(req.body);
    const old = (await pool.query("SELECT * FROM product_categories WHERE id=?", [req.params.id])).rows[0];
    if (!old) throw fail(404, "Kategori tidak ditemukan.");
    let parentId = f.parentId !== undefined ? (f.parentId || null) : old.parent_id;
    if (parentId && parentId === req.params.id) {
      throw fail(400, "Kategori tidak dapat menjadi induk bagi dirinya sendiri.");
    }
    if (parentId) {
      const parent = (await pool.query("SELECT id FROM product_categories WHERE id=?", [parentId])).rows[0];
      if (!parent) throw fail(400, "Kategori utama induk tidak ditemukan.");
    }
    const name = f.name ?? old.name;
    const active = f.active !== undefined ? f.active : Boolean(old.active);
    const sortOrder = f.sortOrder !== undefined ? f.sortOrder : old.sort_order;
    await pool.query(
      "UPDATE product_categories SET name=?,parent_id=?,active=?,sort_order=? WHERE id=?",
      [name, parentId, active, sortOrder, req.params.id]
    );
    res.json({ ok: true });
  });

  app.delete("/api/admin/categories/:id", auth, admin, async (req, res) => {
    const cat = (await pool.query("SELECT * FROM product_categories WHERE id=?", [req.params.id])).rows[0];
    if (!cat) throw fail(404, "Kategori tidak ditemukan.");
    const childrenCount = Number((await pool.query("SELECT COUNT(*) AS n FROM product_categories WHERE parent_id=?", [req.params.id])).rows[0].n);
    if (childrenCount > 0) {
      throw fail(400, `Kategori utama "${cat.name}" masih memiliki ${childrenCount} subkategori. Pindahkan atau hapus subkategori di dalamnya terlebih dahulu.`);
    }
    const inUseCount = Number((await pool.query("SELECT COUNT(*) AS n FROM products WHERE category=? OR subcategory=?", [req.params.id, req.params.id])).rows[0].n);
    if (inUseCount > 0) {
      throw fail(400, `Kategori "${cat.name}" tidak dapat dihapus karena masih digunakan oleh ${inUseCount} produk di katalog.`);
    }
    await pool.query("DELETE FROM product_categories WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  });

  app.put("/api/admin/categories/reorder", auth, admin, async (req, res) => {
    const f = z.object({ ids: z.array(z.string().min(1)).min(1) }).parse(req.body);
    for (let i = 0; i < f.ids.length; i++) {
      await pool.query("UPDATE product_categories SET sort_order=? WHERE id=?", [i, f.ids[i]]);
    }
    res.json({ ok: true });
  });
  const promotionFields = z.object({
    productId: z.string().trim().min(1).max(40),
    eyebrow: z.string().trim().max(100).default("PROMO PILIHAN"),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(600).default(""),
    image: z.string().trim().max(1000).default(""),
    discountPercent: z.number().int().min(1).max(90).optional(),
    promoPrice: z.preprocess((v) => (v == null || v === "" ? null : parseMoneyInt(v, v)), z.number().int().min(0).nullable().optional()),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  }).strict();
  function validatePromotionImage(value) {
    if (value && !/^\/(?:images|uploads|brand)\/[a-zA-Z0-9_/. -]+$/.test(value) && !/^https:\/\//i.test(value))
      throw fail(400, "Gambar promo harus berupa aset toko atau URL HTTPS.");
  }
  app.post("/api/admin/promotions", auth, admin, async (req,res) => {
    const f=promotionFields.parse(req.body);
    validatePromotionImage(f.image);
    const prodRow = (await pool.query("SELECT id, price FROM products WHERE id=? AND active=TRUE",[f.productId])).rows[0];
    if (!prodRow) throw fail(400,"Pilih produk yang masih tampil.");
    if (f.active && (await pool.query("SELECT id FROM store_promotions WHERE product_id=? AND active=TRUE",[f.productId])).rows.length) {
      throw fail(409,"Produk ini sudah memiliki promo aktif. Hentikan promo tersebut sebelum membuat promo baru.");
    }
    const basePrice = Number(prodRow.price);
    let promoPrice = f.promoPrice != null && Number(f.promoPrice) > 0 ? Number(f.promoPrice) : null;
    let discountPercent = f.discountPercent;
    if (promoPrice && !discountPercent && basePrice > 0) {
      discountPercent = Math.max(1, Math.min(90, Math.round((1 - promoPrice / basePrice) * 100)));
    } else if (discountPercent && !promoPrice && basePrice > 0) {
      promoPrice = promotionPrice(basePrice, discountPercent);
    } else if (!discountPercent && !promoPrice) {
      discountPercent = 10;
      promoPrice = promotionPrice(basePrice, 10);
    }
    const id=randomUUID();
    const sortOrder=f.sortOrder ?? Number((await pool.query("SELECT COALESCE(MAX(sort_order)+1,0) AS n FROM store_promotions")).rows[0].n);
    await pool.query(
      "INSERT INTO store_promotions(id,product_id,eyebrow,title,description,image,discount_percent,promo_price,active,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [id,f.productId,f.eyebrow,f.title,f.description,f.image||null,discountPercent,promoPrice,f.active,sortOrder]
    );
    res.status(201).json({id});
  });
  app.patch("/api/admin/promotions/:id", auth, admin, async (req,res) => {
    const f=promotionFields.partial().strict().refine((value)=>Object.keys(value).length>0).parse(req.body);
    const old=(await pool.query("SELECT * FROM store_promotions WHERE id=?",[req.params.id])).rows[0];
    if(!old) throw fail(404,"Promo tidak ditemukan.");
    const productId=f.productId||old.product_id, active=f.active??Boolean(old.active);
    if(f.image!==undefined) validatePromotionImage(f.image);
    const prodRow = (await pool.query("SELECT id, price FROM products WHERE id=? AND active=TRUE",[productId])).rows[0];
    if(f.productId && !prodRow) throw fail(400,"Pilih produk yang masih tampil.");
    if(active && (productId!==old.product_id||!old.active) && (await pool.query("SELECT id FROM store_promotions WHERE product_id=? AND active=TRUE AND id<>?",[productId,req.params.id])).rows.length) {
      throw fail(409,"Produk ini sudah memiliki promo aktif.");
    }
    const basePrice = Number(prodRow?.price || (await pool.query("SELECT price FROM products WHERE id=?", [productId])).rows[0]?.price || 0);
    let promoPrice = f.promoPrice !== undefined ? (f.promoPrice != null && Number(f.promoPrice) > 0 ? Number(f.promoPrice) : null) : old.promo_price;
    let discountPercent = f.discountPercent !== undefined ? f.discountPercent : old.discount_percent;
    if (f.promoPrice !== undefined && f.discountPercent === undefined && promoPrice && basePrice > 0) {
      discountPercent = Math.max(1, Math.min(90, Math.round((1 - promoPrice / basePrice) * 100)));
    } else if (f.discountPercent !== undefined && f.promoPrice === undefined && discountPercent && basePrice > 0) {
      promoPrice = promotionPrice(basePrice, discountPercent);
    }
    const fields={
      product_id:productId,
      eyebrow:f.eyebrow??old.eyebrow,
      title:f.title??old.title,
      description:f.description??old.description,
      image:f.image!==undefined?(f.image||null):old.image,
      discount_percent:discountPercent,
      promo_price:promoPrice,
      active,
      sort_order:f.sortOrder??old.sort_order
    };
    await pool.query(
      "UPDATE store_promotions SET product_id=?,eyebrow=?,title=?,description=?,image=?,discount_percent=?,promo_price=?,active=?,sort_order=? WHERE id=?",
      [fields.product_id,fields.eyebrow,fields.title,fields.description,fields.image,fields.discount_percent,fields.promo_price,fields.active,fields.sort_order,req.params.id]
    );
    res.json({ok:true});
  });
  app.delete("/api/admin/promotions/:id", auth, admin, async (req,res) => {
    const result = await pool.query("DELETE FROM store_promotions WHERE id=?", [req.params.id]);
    if (result.rows.affectedRows === 0) throw fail(404, "Promo tidak ditemukan.");
    res.json({ok:true});
  });
  app.put("/api/admin/promotions/reorder", auth, admin, async (req,res) => {
    const f = z.object({ ids: z.array(z.string().min(1)).min(1) }).parse(req.body);
    for (let i = 0; i < f.ids.length; i++) {
      await pool.query("UPDATE store_promotions SET sort_order=? WHERE id=?", [i, f.ids[i]]);
    }
    res.json({ok:true});
  });
  app.get("/api/admin/payment-methods", auth, admin, async (req, res) => {
    const rows = (await pool.query(
      "SELECT id,name,group_name AS `group`,group_name,detail,enabled,sort_order FROM store_payment_methods ORDER BY sort_order,name"
    )).rows;
    res.json(rows);
  });
  app.post("/api/admin/payment-methods", auth, admin, async (req, res) => {
    const f = z.object({
      id: z.string().trim().min(2).max(60).optional(),
      name: z.string().trim().min(2).max(100),
      group: z.enum(["Bank", "E-Wallet", "COD"]),
      detail: z.string().trim().max(250).default(""),
      enabled: z.boolean().default(true),
    }).strict().parse(req.body);

    const generatedId = f.id || (f.group === "COD" ? "COD" : `${f.group.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${randomBytes(4).toString("hex")}`);
    const nextOrder = Number((await pool.query("SELECT COALESCE(MAX(sort_order)+1,0) AS n FROM store_payment_methods")).rows[0].n);
    await pool.query(
      `INSERT INTO store_payment_methods(id,name,group_name,detail,enabled,sort_order)
       VALUES(?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name),group_name=VALUES(group_name),detail=VALUES(detail),enabled=VALUES(enabled)`,
      [generatedId, f.name, f.group, f.detail, f.enabled, nextOrder]
    );
    res.status(201).json({ ok: true, id: generatedId });
  });
  app.patch("/api/admin/payment-methods/:id", auth, admin, async (req, res) => {
    const f = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      group: z.enum(["Bank", "E-Wallet", "COD"]).optional(),
      detail: z.string().trim().max(250).optional(),
      enabled: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(10000).optional(),
    }).strict().parse(req.body);

    const row = (await pool.query("SELECT * FROM store_payment_methods WHERE id=?", [req.params.id])).rows[0];
    if (!row) throw fail(404, "Metode pembayaran tidak ditemukan.");

    const updatedName = f.name !== undefined ? f.name : row.name;
    const updatedGroup = f.group !== undefined ? f.group : row.group_name;
    const updatedDetail = f.detail !== undefined ? f.detail : row.detail;
    const updatedEnabled = f.enabled !== undefined ? f.enabled : row.enabled;
    const updatedSort = f.sortOrder !== undefined ? f.sortOrder : row.sort_order;

    await pool.query(
      "UPDATE store_payment_methods SET name=?,group_name=?,detail=?,enabled=?,sort_order=? WHERE id=?",
      [updatedName, updatedGroup, updatedDetail, updatedEnabled, updatedSort, req.params.id]
    );
    res.json({ ok: true });
  });
  app.delete("/api/admin/payment-methods/:id", auth, admin, async (req, res) => {
    const row = (await pool.query("SELECT id FROM store_payment_methods WHERE id=?", [req.params.id])).rows[0];
    if (!row) throw fail(404, "Metode pembayaran tidak ditemukan.");
    await pool.query("DELETE FROM store_payment_methods WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  });
  app.post("/api/admin/uploads", auth, admin, async (req,res) => {
    const f = z.object({ data: z.string().max(7_000_000) }).parse(req.body);
    const match = f.data.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw fail(400,"Gunakan gambar PNG, JPG, atau WebP.");
    const bytes = Buffer.from(match[2],"base64");
    if (!bytes.length || bytes.length > 5_000_000) throw fail(400,"Ukuran gambar maksimal 5 MB.");
    const extension = {"image/png":"png","image/jpeg":"jpg","image/webp":"webp"}[match[1]];
    const directory = fileURLToPath(new URL("../public/uploads/",import.meta.url));
    await mkdir(directory,{recursive:true});
    const name = `${randomUUID()}.${extension}`;
    await writeFile(path.join(directory,name),bytes,{flag:"wx"});
    res.status(201).json({url:`/uploads/${name}`});
  });
  const otp = createOtp({
    pool,
    env,
    transport: options.waTransport || options.mailTransport,
    session,
    cookieOptions,
  });
  app.post("/api/auth/register", authLimit, async (req, res) =>
    res.status(202).json(await otp.register(req.body)),
  );
  app.post("/api/auth/checkout", authLimit, async (req, res) =>
    res.status(202).json(await otp.checkout(req.body)),
  );
  app.post("/api/auth/lookup", authLimit, async (req, res) => {
    const f = z
      .object({
        phone: z.string().optional(),
        email: z.string().optional(),
      })
      .parse(req.body);
    let user = null;
    if (f.phone && f.phone.trim()) {
      try {
        const phone = normalizePhone(f.phone);
        const alt = phone.startsWith("62") ? "0" + phone.slice(2) : phone;
        user = (
          await pool.query(
            "SELECT id, name, phone, email, role FROM users WHERE phone=? OR phone=? OR phone=? LIMIT 1",
            [phone, alt, f.phone.trim()]
          )
        ).rows[0];
      } catch (_) {}
    }
    if (!user && f.email && f.email.trim()) {
      user = (
        await pool.query(
          "SELECT id, name, phone, email, role FROM users WHERE email=? LIMIT 1",
          [f.email.trim().toLowerCase()]
        )
      ).rows[0];
    }
    const exists = Boolean(user);
    res.json({
      exists,
      isNew: !exists,
      role: user?.role || "customer",
      name: user?.name || "",
    });
  });
  app.post("/api/auth/otp/request", authLimit, async (req, res) =>
    res.status(202).json(await otp.request(req.body)),
  );
  app.post("/api/auth/otp/verify", authLimit, async (req, res) =>
    res.json(await otp.verify(req, res)),
  );
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const f = z
      .object({
        phone: z.string().min(1).max(254).optional(),
        email: z.string().min(1).max(254).optional(),
        identifier: z.string().min(1).max(254).optional(),
        password: z.string().min(1).max(72),
      })
      .refine((o) => o.phone || o.email || o.identifier, "Masukkan nomor WhatsApp atau email.")
      .parse(req.body);

    const raw = (f.identifier || f.email || f.phone || "").trim();
    const normalized = normalizePhone(raw);
    const lower = raw.toLowerCase();

    // Query flexible: match email or normalized phone or exact phone
    const u = (
      await pool.query(
        "SELECT * FROM users WHERE email=? OR phone=? OR phone=? OR phone=? LIMIT 1",
        [lower, raw, normalized, normalized.replace(/^62/, "0")]
      )
    ).rows[0];

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
    let p =
      (
        await pool.query(
          "SELECT phone AS profile_phone,street,city,postal FROM customer_profiles WHERE user_id=?",
          [req.user.id],
        )
      ).rows[0] || {};
    let lastAddr = null;
    if (!p.street || !p.city || !p.postal) {
      const lastOrder = (
        await pool.query(
          "SELECT address FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
          [req.user.id],
        )
      ).rows[0];
      if (lastOrder?.address) {
        try {
          lastAddr =
            typeof lastOrder.address === "string"
              ? JSON.parse(lastOrder.address)
              : lastOrder.address;
        } catch (_) {}
      }
    }
    const resolvedPhone =
      p.profile_phone || req.user.phone || lastAddr?.phone || "";
    const resolvedStreet = p.street || lastAddr?.street || "";
    const resolvedCity = p.city || lastAddr?.city || "";
    const resolvedPostal = p.postal || lastAddr?.postal || "";
    res.json({
      ...safeUser(req.user),
      phone: resolvedPhone,
      profile_phone: resolvedPhone,
      street: resolvedStreet,
      city: resolvedCity,
      postal: resolvedPostal,
    });
  });
  app.patch("/api/me/profile", auth, customer, async (req, res) => {
    const f = z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: z.string().regex(/^[0-9+ ()-]{8,20}$/),
        street: z.string().trim().min(10).max(500),
        city: z.string().trim().min(2).max(100),
        postal: z.string().trim().max(5).refine((value) => !value || /^\d{5}$/.test(value), "Kode pos harus 5 digit."),
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
      costPrice: p.cost_price || 0,
      variationLabel: p.variation_label || "Warna",
      motif: p.motif || "",
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
  async function hydrate(rows, includePromotions = false) {
    if (!rows.length) return [];
    const [variantResult, promotionMap] = await Promise.all([
      pool.query(
        "SELECT * FROM product_variants WHERE product_id IN (?) ORDER BY product_id,size,color",
        [rows.map((p) => p.id)],
      ),
      includePromotions ? readProductPromotions(rows.map((row) => row.id)) : Promise.resolve(new Map()),
    ]);
    return rows.map((p) => {
      const product = presentProduct(p, variantResult.rows.filter((v) => v.product_id === p.id));
      const promotion = promotionMap.get(p.id);
      if (promotion) {
        product.basePrice = Number(p.price);
        product.oldPrice = Number(p.price);
        const salePrice = promotion.promo_price != null && Number(promotion.promo_price) > 0
          ? Number(promotion.promo_price)
          : promotionPrice(p.price, promotion.discount_percent);
        product.price = salePrice;
        product.promotion = { id: promotion.id, title: promotion.title, discountPercent: Number(promotion.discount_percent), promoPrice: salePrice };
      }
      return product;
    });
  }
  app.get("/api/products", async (req, res) => {
    const q = z
      .object({
        search: z.string().max(100).default(""),
        category: z.string().max(100).default("Semua"),
        subcategory: z.string().max(100).optional(),
        size: z.string().max(30).optional(),
        color: colorSchema.optional(),
        min: z.preprocess((v) => parseMoneyInt(v, 0), z.coerce.number().int().min(0).default(0)),
        max: z.preprocess((v) => (v == null || v === "" ? 10000000 : parseMoneyInt(v, 10000000)), z.coerce.number().int().min(0).max(10000000).default(10000000)),
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
    if (q.search) {
      where.push("(p.name LIKE ? OR p.category LIKE ? OR p.subcategory LIKE ?)");
      args.push("%" + q.search + "%", "%" + q.search + "%", "%" + q.search + "%");
    }
    if (q.category === "Produk Baru") where.push("p.is_new=TRUE");
    else if (q.category === "Penawaran Terbatas")
      where.push("(p.old_price>p.price OR EXISTS(SELECT 1 FROM store_promotions sp WHERE sp.product_id=p.id AND sp.active=TRUE))");
    else if (q.category && q.category !== "Semua") {
      where.push(
        "(p.category=? OR p.category IN (SELECT id FROM product_categories WHERE parent_id=? OR id=? OR parent_id IN (SELECT id FROM product_categories WHERE name=? OR id=?)) OR p.category IN (SELECT name FROM product_categories WHERE parent_id=? OR id=? OR parent_id IN (SELECT id FROM product_categories WHERE name=? OR id=?)))"
      );
      args.push(
        q.category,
        q.category,
        q.category,
        q.category,
        q.category,
        q.category,
        q.category,
        q.category,
        q.category
      );
    }
    if (q.subcategory && q.subcategory !== "Semua") {
      where.push(
        "(p.subcategory=? OR p.subcategory IN (SELECT id FROM product_categories WHERE name=? OR id=?) OR p.subcategory IN (SELECT name FROM product_categories WHERE name=? OR id=?))"
      );
      args.push(
        q.subcategory,
        q.subcategory,
        q.subcategory,
        q.subcategory,
        q.subcategory
      );
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
      items: await hydrate(rows, true),
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
  app.get("/api/products/cross-categories", async (req, res) => {
    try {
      const search = String(req.query.search || "").trim().slice(0, 100);
      const currentCategory = String(req.query.currentCategory || "");
      const currentSubcategory = String(req.query.subcategory || "");
      if (!search) return res.json({ matches: [] });

      const sArg = "%" + search + "%";
      const rows = (
        await pool.query(
          `SELECT p.category, COUNT(DISTINCT p.id) as count
           FROM products p
           WHERE p.active=TRUE
             AND (p.name LIKE ? OR p.category LIKE ? OR p.subcategory LIKE ?)
           GROUP BY p.category`,
          [sArg, sArg, sArg],
        )
      ).rows;

      const matches = rows
        .filter((r) => {
          if (!r.category) return false;
          if (currentSubcategory === "Semua" || !currentSubcategory) {
            return r.category !== currentCategory;
          }
          return true;
        })
        .map((r) => ({
          category: r.category,
          count: Number(r.count),
          isCurrentCategoryAll: r.category === currentCategory,
        }));

      res.json({ matches });
    } catch (e) {
      res.json({ matches: [] });
    }
  });
  app.get("/api/products/:id", async (req, res) => {
    const rows = (
      await pool.query("SELECT * FROM products WHERE id=? AND active=TRUE", [
        req.params.id,
      ])
    ).rows;
    if (!rows.length)
      throw fail(404, "Produk tidak tersedia atau sudah diarsipkan.");
    res.json((await hydrate(rows, true))[0]);
  });
  app.get("/api/admin/products", auth, leader, async (req, res) => {
    const [productsResult, salesResult] = await Promise.all([
      pool.query("SELECT * FROM products ORDER BY created_at DESC, id DESC"),
      pool.query(
        "SELECT i.product_id, COALESCE(SUM(i.quantity),0) AS sold_units FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.payment_status='PAID' GROUP BY i.product_id"
      ),
    ]);
    const salesMap = new Map(
      salesResult.rows.map((r) => [r.product_id, Number(r.sold_units) || 0])
    );
    let items = (await hydrate(productsResult.rows)).map((p) => ({
      ...p,
      soldUnits: salesMap.get(p.id) || 0,
    }));

    // Optional query parameter filtering/sorting
    const { status, category, subcategory, stock, search, sort } = req.query;
    if (status && status !== "all") {
      if (status === "active") items = items.filter((p) => p.active);
      else if (status === "archived") items = items.filter((p) => !p.active);
    }
    if (category && category !== "all") {
      items = items.filter(
        (p) =>
          p.category === category ||
          String(p.category).toLowerCase() === String(category).toLowerCase()
      );
    }
    if (subcategory && subcategory !== "all") {
      items = items.filter(
        (p) =>
          p.subcategory === subcategory ||
          String(p.subcategory).toLowerCase() === String(subcategory).toLowerCase()
      );
    }
    if (stock && stock !== "all") {
      if (stock === "out_of_stock") items = items.filter((p) => (p.stock || 0) <= 0);
      else if (stock === "in_stock") items = items.filter((p) => (p.stock || 0) > 0);
      else if (stock === "low_stock") items = items.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) < 5);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((p) =>
        [p.name, p.sku, p.category, p.subcategory]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (sort) {
      if (sort === "newest") {
        items.sort((a, b) => {
          const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tB !== tA ? tB - tA : String(b.id).localeCompare(String(a.id));
        });
      } else if (sort === "oldest") {
        items.sort((a, b) => {
          const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tA !== tB ? tA - tB : String(a.id).localeCompare(String(b.id));
        });
      } else if (sort === "bestseller") {
        items.sort((a, b) => (Number(b.soldUnits) || 0) - (Number(a.soldUnits) || 0));
      } else if (sort === "least_sold") {
        items.sort((a, b) => (Number(a.soldUnits) || 0) - (Number(b.soldUnits) || 0));
      } else if (sort === "price_high") {
        items.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
      } else if (sort === "price_low") {
        items.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
      } else if (sort === "stock_high") {
        items.sort((a, b) => (Number(b.stock) || 0) - (Number(a.stock) || 0));
      } else if (sort === "stock_low") {
        items.sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));
      }
    }

    res.json(items);
  });
  app.get("/api/admin/products/:id/details", auth, leader, async (req,res) => {
    const product=(await pool.query("SELECT * FROM products WHERE id=?",[req.params.id])).rows[0];
    if(!product) throw fail(404,"Produk tidak ditemukan.");
    const [hydrated,sales]=await Promise.all([
      hydrate([product]),
      pool.query("SELECT COALESCE(SUM(i.quantity),0) AS units,COALESCE(SUM(i.price*i.quantity),0) AS revenue,COALESCE(SUM(i.cost_price*i.quantity),0) AS cost FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.product_id=? AND o.payment_status='PAID'",[product.id]),
    ]);
    const row=sales.rows[0];
    res.json({...hydrated[0],soldUnits:Number(row.units),soldRevenue:Number(row.revenue),soldCost:Number(row.cost),grossProfit:Number(row.revenue)-Number(row.cost)});
  });

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
        .map(({ cost_price, ...i }) => ({ ...i, id: i.product_id })),
    }));
  }
  async function ownOrder(req) {
    const rows = await readOrders(
      req.user.role === "customer" ? req.user.id : undefined,
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
      const requested=aggregateItems(f.items);
      const promotionMap=await readProductPromotions([...new Set(requested.map((item)=>item.id))]);
      for (const i of requested) {
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
          price: promotionMap.has(p.id)
            ? (promotionMap.get(p.id).promo_price && Number(promotionMap.get(p.id).promo_price) > 0
                ? Number(promotionMap.get(p.id).promo_price)
                : promotionPrice(p.price, promotionMap.get(p.id).discount_percent))
            : p.price,
          oldPrice: promotionMap.has(p.id) ? p.price : p.old_price,
          stock: p.stock,
        });
      }
      const shipment = await deliveryFor(f.shipping, f.shippingOption, canonical);
      const settings = await readStoreSettings();
      const manualFee = Number(settings.manualShippingFee ?? settings.localDeliveryFee ?? 15000);
      res.json({
        ...calculateTotals(canonical, f.coupon, f.shipping, shipment.delivery, manualFee),
        shippingName: shipment.name,
        shippingOption: shipment.option,
        items: canonical,
      });
    },
  );
  app.post("/api/orders", auth, customer, async (req, res) => {
    const f = orderSchema.parse(req.body),
      items = aggregateItems(f.items);
    const methodRow = (await pool.query("SELECT id, name, group_name AS `group`, enabled FROM store_payment_methods WHERE id=? AND enabled=TRUE", [f.payment])).rows[0];
    if (!methodRow)
      throw fail(400, "Metode pembayaran tidak tersedia atau belum diaktifkan admin.");
    const isCod = methodRow.group === "COD" || methodRow.id === "COD";
    if (!isCod && !gateway.configured)
      throw fail(503, "Pembayaran online belum tersedia. Hubungi pengelola.");
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
              "SELECT p.id,p.name,p.image,p.price,p.cost_price,p.variation_label,v.stock,(SELECT sp.discount_percent FROM store_promotions sp WHERE sp.product_id=p.id AND sp.active=TRUE ORDER BY sp.sort_order,sp.created_at DESC LIMIT 1) AS discount_percent,(SELECT sp.promo_price FROM store_promotions sp WHERE sp.product_id=p.id AND sp.active=TRUE ORDER BY sp.sort_order,sp.created_at DESC LIMIT 1) AS promo_price FROM products p JOIN product_variants v ON v.product_id=p.id WHERE p.id=? AND v.size=? AND v.color=? AND p.active=TRUE FOR UPDATE",
              [i.id, i.size, i.color],
            )
          ).rows[0];
          if (!p) throw fail(400, "Varian produk tidak ditemukan.");
          if (p.stock < i.quantity)
            throw fail(409, "Stok " + p.name + " tidak mencukupi.");
          const itemPrice = p.promo_price && Number(p.promo_price) > 0
            ? Number(p.promo_price)
            : (p.discount_percent ? promotionPrice(p.price, p.discount_percent) : p.price);
          canonical.push({
            ...i,
            name: p.name,
            image: p.image,
            price: itemPrice,
            oldPrice: (p.promo_price || p.discount_percent) ? p.price : 0,
            costPrice: p.cost_price,
            variationLabel: p.variation_label,
          });
          await c.query(
            "UPDATE product_variants SET stock=stock-? WHERE product_id=? AND size=? AND color=?",
            [i.quantity, i.id, i.size, i.color],
          );
        }
        const shipment = await deliveryFor(f.shipping, f.shippingOption, canonical);
        const settings = await readStoreSettings();
        const manualFee = Number(settings.manualShippingFee ?? settings.localDeliveryFee ?? 15000);
        const total = calculateTotals(canonical, f.coupon, f.shipping, shipment.delivery, manualFee);
        id = "LJ-" + randomUUID();
        await c.query(
          "INSERT INTO orders(id,user_id,address,shipping,shipping_name,payment,coupon,subtotal,discount,delivery,total,checkout_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            id,
            req.user.id,
            JSON.stringify(f.address),
            f.shipping,
            shipment.name,
            f.payment,
            f.coupon,
            total.subtotal,
            total.discount,
            total.delivery,
            total.total,
            f.checkoutKey,
          ],
        );
        for (const i of canonical) {
          const dimensions = parseDimensions(i.size);
          await c.query(
            "INSERT INTO order_items(id,order_id,product_id,name,image,size,length_cm,width_cm,height_cm,variation_label,color,quantity,price,cost_price) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              randomUUID(),
              id,
              i.id,
              i.name,
              i.image,
              i.size,
              ...(dimensions ? [dimensions.length, dimensions.width, dimensions.height] : [0, 0, 0]),
              i.variationLabel || "Variasi",
              i.color,
              i.quantity,
              i.price,
              i.costPrice || 0,
            ],
          );
        }
        // Simpan alamat untuk belanja berikutnya tanpa perlu input ulang
        await c.query(
          "INSERT INTO customer_profiles(user_id,phone,street,city,postal) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE phone=VALUES(phone),street=VALUES(street),city=VALUES(city),postal=VALUES(postal)",
          [
            req.user.id,
            f.address.phone,
            f.address.street,
            f.address.city,
            f.address.postal,
          ],
        );
        await c.query(
          "UPDATE users SET phone=COALESCE(NULLIF(phone, ''), ?), name=COALESCE(NULLIF(name, ''), ?) WHERE id=?",
          [f.address.phone, f.address.name, req.user.id],
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
  app.get("/api/admin/orders", auth, operations, async (req, res) =>
    res.json(await readOrders()),
  );
  app.post("/api/admin/orders/:id/payment", auth, operations, async (req, res) => {
    const order = await ownOrder(req);
    await payments.sync(order);
    res.json((await readOrders(undefined, order.id))[0]);
  });
  app.patch("/api/admin/orders/:id", auth, operations, async (req, res) => {
    const f = z
      .object({ status: z.enum(Object.keys(transitions)), trackingNumber: z.string().trim().max(100).optional().default("") })
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
      const methodRow = (await c.query("SELECT group_name FROM store_payment_methods WHERE id=?", [o.payment])).rows[0];
      const isCod = o.payment === "COD" || methodRow?.group_name === "COD";
      if (
        (!isCod && o.payment_status !== "PAID") ||
        !transitions[o.status]?.includes(f.status)
      )
        throw fail(
          409,
          !isCod
            ? "Perubahan status tidak diizinkan. Pembayaran harus dikonfirmasi Xendit."
            : "Transisi status pesanan tidak diizinkan.",
        );
      const trackingNumber = f.status === "Dikirim" ? f.trackingNumber : o.tracking_number || "";
      if (isCod && f.status === "Selesai") {
        await c.query("UPDATE orders SET status=?,tracking_number=?,payment_status='PAID',paid_at=UTC_TIMESTAMP(3) WHERE id=?", [f.status, trackingNumber, o.id]);
      } else {
        await c.query("UPDATE orders SET status=?,tracking_number=? WHERE id=?", [f.status, trackingNumber, o.id]);
      }
      const a = orderRow(o).address;
      const templateRow = (await c.query("SELECT setting_value FROM store_settings WHERE setting_key='waTemplates'")).rows[0];
      const rawTemplates = typeof templateRow?.setting_value === "string" ? JSON.parse(templateRow.setting_value) : templateRow?.setting_value;
      const templates = { ...DEFAULT_WA_TEMPLATES, ...(rawTemplates || {}) };
      const brandRow = (await c.query("SELECT setting_value FROM store_settings WHERE setting_key='brand'")).rows[0];
      const brand = brandRow?.setting_value || "Kintsugi";
      const templateKey =
        f.status === "Dikirim"
          ? "shipped"
          : f.status === "Selesai"
            ? "delivered"
            : f.status === "Dibatalkan"
              ? "cancelled"
              : "processing";
      const values = {
        nama: a.name,
        nomor_pesanan: o.id,
        total: `Rp${Number(o.total).toLocaleString("id-ID")}`,
        nomor_resi: trackingNumber,
        kurir: o.shipping_name || o.shipping || "",
        toko: brand,
      };
      if (templates[templateKey] !== false && templates[templateKey]) {
        await queueWhatsApp(
          c,
          "status/" + o.id + "/" + f.status,
          a.phone,
          renderWhatsAppTemplate(templates[templateKey], values),
        );
      }
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
        variants: z.array(variantSchema).min(1).max(400).optional(),
        sizes: z.array(variantSchema.shape.size).min(1).max(20).optional(),
        colors: z.array(colorSchema).min(1).max(20).optional(),
        stock: variantSchema.shape.stock.default(0),
      })
      .refine((o) => o.variants?.length || o.sizes?.length && o.colors?.length, "Tambahkan setidaknya satu variasi produk.")
      .parse(req.body);
    if (f.oldPrice && f.oldPrice <= f.price)
      throw fail(400, "Harga sebelum diskon harus melebihi harga jual.");
    const mainCat = (await pool.query("SELECT id, name FROM product_categories WHERE (id=? OR name=?) AND parent_id IS NULL AND active=TRUE", [f.category, f.category])).rows[0];
    if (!mainCat)
      throw fail(400, "Pilih kategori utama yang valid dan aktif dari pengaturan toko.");
    if (!f.subcategory || !f.subcategory.trim()) {
      throw fail(400, "Subkategori wajib dipilih.");
    }
    const subCat = (await pool.query("SELECT id, name FROM product_categories WHERE (id=? OR name=?) AND parent_id=? AND active=TRUE", [f.subcategory, f.subcategory, mainCat.id])).rows[0];
    if (!subCat) {
      throw fail(400, `Subkategori "${f.subcategory}" tidak valid untuk kategori utama "${mainCat.name}".`);
    }
    const categoryId = mainCat.id;
    const subcategoryId = subCat.id;
    const c = await pool.connect();
    try {
      await c.query("START TRANSACTION");
      const id = "lj-" + randomUUID();
      await c.query(
        "INSERT INTO products(id,sku,name,category,subcategory,price,old_price,cost_price,variation_label,motif,weight_grams,image,description,is_new) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          id,
          f.sku,
          f.name,
          categoryId,
          subcategoryId,
          f.price,
          f.oldPrice,
          f.costPrice,
          f.variationLabel,
          f.motif,
          f.weightGrams,
          f.image,
          f.description,
          f.isNew,
        ],
      );
      const variants = f.variants || f.sizes.flatMap((size) => f.colors.map((color) => ({ size, color, stock: f.stock })));
      const keys = variants.map((v) => `${v.size}:${v.color}`);
      if (new Set(keys).size !== keys.length) throw fail(400,"Ada kombinasi ukuran dan variasi yang duplikat.");
      for (const v of variants) {
        const d = parseDimensions(v.size);
        await c.query(
          "INSERT INTO product_variants(product_id,size,length_cm,width_cm,height_cm,color,image_url,stock) VALUES(?,?,?,?,?,?,?,?)",
          [id, v.size, d?.length ?? v.lengthCm ?? 0, d?.width ?? v.widthCm ?? 0, d?.height ?? v.heightCm ?? 0, v.color, v.imageUrl || null, v.stock],
        );
      }
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
    if (f.category || f.subcategory !== undefined) {
      const current = (await pool.query("SELECT category, subcategory FROM products WHERE id=?", [req.params.id])).rows[0];
      const targetCat = f.category || current?.category;
      const targetSub = f.subcategory !== undefined ? f.subcategory : current?.subcategory;
      const mainCat = (await pool.query("SELECT id, name FROM product_categories WHERE (id=? OR name=?) AND parent_id IS NULL AND active=TRUE", [targetCat, targetCat])).rows[0];
      if (!mainCat) throw fail(400, "Pilih kategori utama yang valid dan aktif.");
      if (!targetSub || !targetSub.trim()) throw fail(400, "Subkategori wajib dipilih.");
      const subCat = (await pool.query("SELECT id, name FROM product_categories WHERE (id=? OR name=?) AND parent_id=? AND active=TRUE", [targetSub, targetSub, mainCat.id])).rows[0];
      if (!subCat) throw fail(400, `Subkategori "${targetSub}" tidak valid untuk kategori utama "${mainCat.name}".`);
      f.category = mainCat.id;
      f.subcategory = subCat.id;
    }
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
      const names = { oldPrice: "old_price", costPrice: "cost_price", weightGrams:"weight_grams", variationLabel: "variation_label", isNew: "is_new", subcategory: "subcategory" };
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
        const existing = (await c.query("SELECT size, color FROM product_variants WHERE product_id=?", [req.params.id])).rows;
        for (const ex of existing) {
          if (!keys.includes(ex.size + ":" + ex.color)) {
            await c.query("DELETE FROM product_variants WHERE product_id=? AND size=? AND color=?", [req.params.id, ex.size, ex.color]);
          }
        }
        for (const v of f.variants) {
          const length = v.lengthCm ?? parseDimensions(v.size)?.length ?? 0;
          const width = v.widthCm ?? parseDimensions(v.size)?.width ?? 0;
          const height = v.heightCm ?? parseDimensions(v.size)?.height ?? 0;
          await c.query(
            `INSERT INTO product_variants(product_id,size,length_cm,width_cm,height_cm,color,image_url,stock)
             VALUES(?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE stock=VALUES(stock), image_url=COALESCE(VALUES(image_url), image_url), length_cm=VALUES(length_cm), width_cm=VALUES(width_cm), height_cm=VALUES(height_cm)`,
            [req.params.id, v.size, length, width, height, v.color, v.imageUrl || null, v.stock],
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
    const [wa,email,settings]=await Promise.all([
      pool.query("SELECT status,COUNT(*) AS count FROM wa_outbox GROUP BY status"),
      pool.query("SELECT status,COUNT(*) AS count FROM email_outbox GROUP BY status"),
      readStoreSettings(),
    ]);
    res.json({
      database: "MySQL",
      gateway: gateway.configured,
      sandbox: gateway.sandbox,
      whatsappConfigured: Boolean(env.WABLAS_TOKEN),
      whatsappHost: env.WABLAS_API_HOST || "https://texas.wablas.com",
      whatsapp: wa.rows,
      email: email.rows,
      rajaOngkirConfigured:Boolean(env.RAJAONGKIR_API_KEY&&(settings.rajaOriginId||env.RAJAONGKIR_ORIGIN_ID)),
    });
  });
  app.get("/api/admin/metrics", auth, leader, async (req,res) => {
    const [sales, capital, expenses, expenseRows] = await Promise.all([
      pool.query("SELECT COALESCE(SUM(subtotal-discount),0) AS revenue,COUNT(*) AS orders FROM orders WHERE payment_status='PAID'"),
      pool.query("SELECT COALESCE(SUM(i.cost_price*i.quantity),0) AS amount FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.payment_status='PAID'"),
      pool.query("SELECT COALESCE(SUM(amount),0) AS amount FROM store_expenses"),
      pool.query("SELECT id,expense_date AS date,description,amount FROM store_expenses ORDER BY expense_date DESC,created_at DESC LIMIT 100"),
    ]);
    const revenue=Number(sales.rows[0].revenue), cogs=Number(capital.rows[0].amount), operating=Number(expenses.rows[0].amount);
    res.json({ revenue, capital:cogs, expenses:operating, netIncome:revenue-cogs-operating, paidOrders:Number(sales.rows[0].orders), expenseRows:expenseRows.rows });
  });
  app.post("/api/admin/expenses", auth, admin, async (req,res) => {
    const f=z.object({ date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description:z.string().trim().min(2).max(200), amount:z.preprocess((v) => parseMoneyInt(v, v), z.number().int().positive().max(100000000)) }).parse(req.body);
    const id=randomUUID();
    await pool.query("INSERT INTO store_expenses(id,expense_date,description,amount,created_by) VALUES(?,?,?,?,?)",[id,f.date,f.description,f.amount,req.user.id]);
    res.status(201).json({id});
  });
  app.get("/api/admin/users", auth, admin, async (_req,res) => {
    res.json((await pool.query("SELECT id,name,email,phone,role,created_at AS createdAt FROM users ORDER BY created_at DESC")).rows);
  });
  app.post("/api/admin/users", auth, admin, async (req,res) => {
    const f=z.object({ name:z.string().trim().min(2).max(100), email:z.email().max(254), phone:z.string().max(20).optional().default(""), password:z.string().min(12).max(72), role:z.enum(["manager","staff"]) }).parse(req.body);
    const id=randomUUID();
    try {
      await pool.query("INSERT INTO users(id,name,email,phone,password_hash,role) VALUES(?,?,?,?,?,?)",[id,f.name,f.email.toLowerCase(),f.phone ? normalizePhone(f.phone) : null,await bcrypt.hash(f.password,12),f.role]);
    } catch(e) { if(e.code==="ER_DUP_ENTRY") throw fail(409,"Email atau nomor sudah digunakan."); throw e; }
    res.status(201).json({id});
  });
  app.patch("/api/admin/users/:id/role", auth, admin, async (req,res) => {
    const f=z.object({role:z.enum(["customer","manager","staff","admin"])}).parse(req.body);
    if(req.params.id===req.user.id && f.role!=="admin") throw fail(400,"Akun admin yang sedang digunakan tidak dapat diturunkan perannya sendiri.");
    const result=await pool.query("UPDATE users SET role=? WHERE id=?",[f.role,req.params.id]);
    if(!result.affectedRows) throw fail(404,"Akun tidak ditemukan.");
    res.json({ok:true});
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

import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pool } from "../server/db.js";
import { queueEmail, flushEmails, escapeHtml } from "../server/integrations.js";
if (!process.env.XENDIT_SECRET_KEY?.startsWith("xnd_development_"))
  throw new Error("Smoke test hanya boleh memakai key Xendit development.");
const base = process.env.APP_URL || "http://localhost:3001";
const evidence = {
  time: new Date().toISOString(),
  database: process.env.DB_NAME || "liny_jaya",
};
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.CUSTOMER_EMAIL,
    password: process.env.CUSTOMER_PASSWORD,
  }),
});
if (!login.ok) throw Error("Login akun seed gagal.");
const cookie = login.headers.get("set-cookie").split(";")[0];
const catalog = await (await fetch(base + "/api/products?pageSize=1")).json();
const p = catalog.items[0],
  v = p.variants.find((v) => v.stock > 0);
const res = await fetch(base + "/api/orders", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({
    checkoutKey: randomUUID(),
    items: [{ id: p.id, size: v.size, color: v.color, quantity: 1 }],
    address: {
      name: "Pengujian Liny Jaya",
      email: process.env.STORE_CONTACT_EMAIL,
      phone: "081234567890",
      street: "Alamat pengujian lokal No. 10",
      city: "Jakarta",
      postal: "12345",
    },
    shipping: "regular",
    payment: "xendit",
    coupon: "",
  }),
});
const order = await res.json();
evidence.xendit = {
  httpStatus: res.status,
  orderId: order.id,
  invoiceId: order.invoice_id,
  status: order.payment_status,
  total: order.total,
  url: order.payment_url,
  error: order.paymentError || order.error,
};
if (order.invoice_id) {
  const verify = await fetch(base + "/api/orders/" + order.id + "/payment", {
    method: "POST",
    headers: { Cookie: cookie },
  });
  evidence.xendit.verifiedStatus = (await verify.json()).payment_status;
}
try {
  const key = "integration/" + randomUUID();
  await queueEmail(
    pool,
    key,
    process.env.STORE_CONTACT_EMAIL,
    "Integrasi Liny Jaya siap diuji",
    "<h1>Liny Jaya</h1><p>Koneksi database MySQL Laragon dan layanan email berhasil diuji.</p><p>Nomor pengujian: " +
      escapeHtml(order.id || "-") +
      ".</p><p>Ini adalah pesan pengujian integrasi, bukan konfirmasi pembayaran.</p>",
  );
  await flushEmails(pool);
  const mail = (
    await pool.query(
      "SELECT status,provider_id,last_error FROM email_outbox WHERE id=?",
      [key],
    )
  ).rows[0];
  evidence.resend = mail;
} finally {
  await pool.end();
}
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/integration-smoke.json",
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence, null, 2));

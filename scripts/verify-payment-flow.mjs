import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
if (!process.env.XENDIT_SECRET_KEY?.startsWith("xnd_development_"))
  throw Error("Pengujian hanya untuk Xendit development.");
const base = process.env.TEST_APP_URL || "http://localhost:3002",
  proof = { testedAt: new Date().toISOString(), sandbox: true };
async function request(path, method = "GET", body, cookie = "") {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const customer = await request("/auth/login", "POST", {
  email: process.env.CUSTOMER_EMAIL,
  password: process.env.CUSTOMER_PASSWORD,
});
const admin = await request("/auth/login", "POST", {
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
const cookie = customer.cookie,
  all = (await request("/products?pageSize=1")).data,
  p = all.items[0],
  v = p.variants.find((v) => v.stock > 0);
const items = [{ id: p.id, size: v.size, color: v.color, quantity: 1 }];
const quote = await request(
  "/checkout/quote",
  "POST",
  { items, coupon: "", shipping: "regular" },
  cookie,
);
const payload = {
  items,
  address: {
    name: "Pengujian Pembayaran",
    email: "qa@example.test",
    phone: "081234567890",
    street: "Jalan Pengujian Lokal Nomor 10",
    city: "Jakarta",
    postal: "12345",
  },
  coupon: "",
  shipping: "regular",
  payment: "xendit",
  checkoutKey: randomUUID(),
};
const created = await request("/orders", "POST", payload, cookie),
  order = created.data;
proof.creation = {
  httpStatus: created.status,
  orderId: order.id,
  invoiceId: order.invoice_id,
  status: order.payment_status,
  checkoutUrlValid: /^https:\/\/checkout-staging\.xendit\.co\//.test(
    order.payment_url || "",
  ),
  serverTotal: order.total,
  quoteMatches: quote.data.total === order.total,
  error: order.paymentError || order.error,
};
if (order.invoice_id) {
  const repeated = await request("/orders", "POST", payload, cookie);
  proof.repeatedCheckoutSameOrder = repeated.data.id === order.id;
  proof.customerReconciliation = (
    await request("/orders/" + order.id + "/payment", "POST", {}, cookie)
  ).status;
  proof.adminCannotCheckout = (
    await request(
      "/orders",
      "POST",
      { ...payload, checkoutKey: randomUUID() },
      admin.cookie,
    )
  ).status;
  proof.adminPaymentInspection = (
    await request(
      "/admin/orders/" + order.id + "/payment",
      "POST",
      {},
      admin.cookie,
    )
  ).status;
  proof.cancellation = (
    await request("/orders/" + order.id + "/cancel", "POST", {}, cookie)
  ).status;
  proof.repeatedCancellation = (
    await request("/orders/" + order.id + "/cancel", "POST", {}, cookie)
  ).status;
  proof.finalStatus = (
    await request("/orders/" + order.id, "GET", undefined, cookie)
  ).data.payment_status;
  const detail = (await request("/products/" + p.id)).data;
  proof.stockRestored =
    detail.variants.find((x) => x.size === v.size && x.color === v.color)
      .stock === v.stock;
}
await request("/auth/logout", "POST", {}, cookie);
await request("/auth/logout", "POST", {}, admin.cookie);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/payment-flow-verification.json",
  JSON.stringify(proof, null, 2),
);
console.log(JSON.stringify(proof, null, 2));

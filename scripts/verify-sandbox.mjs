import { readFile, writeFile } from "node:fs/promises";
import { createGateway } from "../server/integrations.js";
import { pool } from "../server/db.js";
const file = "artifacts/integration-smoke.json";
const proof = JSON.parse(await readFile(file, "utf8"));
const invoice = await createGateway().get(proof.xendit.invoiceId);
proof.xendit.providerStatusAfterSandbox = invoice.status;
const base = process.env.APP_URL || "http://localhost:3001";
const before = (
  await pool.query(
    "SELECT SUM(stock) AS n FROM product_variants WHERE product_id IN (SELECT product_id FROM order_items WHERE order_id=?)",
    [proof.xendit.orderId],
  )
).rows[0].n;
const replay = [];
for (let i = 0; i < 2; i++) {
  const response = await fetch(base + "/api/webhooks/xendit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-callback-token": process.env.XENDIT_WEBHOOK_TOKEN,
    },
    body: JSON.stringify(invoice),
  });
  replay.push({ httpStatus: response.status, result: await response.json() });
}
const after = (
  await pool.query(
    "SELECT SUM(stock) AS n FROM product_variants WHERE product_id IN (SELECT product_id FROM order_items WHERE order_id=?)",
    [proof.xendit.orderId],
  )
).rows[0].n;
const order = (
  await pool.query(
    "SELECT status,payment_status,stock_released FROM orders WHERE id=?",
    [proof.xendit.orderId],
  )
).rows[0];
proof.xendit.localWebhookReplay = replay;
proof.xendit.order = order;
proof.xendit.stockStableOnRepeatedWebhook = before === after;
proof.xendit.publicWebhookDelivery =
  "Belum diuji; pengguna memilih lokal tanpa URL HTTPS publik.";
await writeFile(file, JSON.stringify(proof, null, 2));
await pool.end();
console.log(JSON.stringify(proof, null, 2));

import { parseArgs } from "node:util";
import { randomInt, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
const { values } = parseArgs({
  options: { to: { type: "string" }, from: { type: "string" } },
});
if (!values.to) throw new Error("Gunakan --to alamat-email-yang-diizinkan.");
const recipient = z.email().parse(values.to.trim());
const sender =
  values.from || process.env.RESEND_FROM || "Liny Jaya <onboarding@resend.dev>";
if (/[\r\n]/.test(sender)) throw new Error("Alamat pengirim tidak valid.");
if (!process.env.RESEND_API_KEY)
  throw new Error("RESEND_API_KEY belum diatur.");
const code = String(randomInt(100000, 1000000));
const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  signal: AbortSignal.timeout(15000),
  headers: {
    Authorization: "Bearer " + process.env.RESEND_API_KEY,
    "Content-Type": "application/json",
    "Idempotency-Key": "delivery-check/" + randomUUID(),
  },
  body: JSON.stringify({
    from: sender,
    to: [recipient],
    subject: "Kode uji pengiriman Liny Jaya",
    html:
      '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px"><h2>Liny Jaya</h2><p>Ini adalah pengujian pengiriman kode ke alamat email Anda.</p><p style="font-size:32px;letter-spacing:7px;font-weight:bold">' +
      code +
      "</p><p>Email ini hanya untuk memeriksa pengiriman OTP. Kode uji ini tidak membuat atau mengaktifkan akun apa pun.</p></div>",
  }),
});
const result = await response
  .json()
  .catch(() => ({ name: "invalid_response", message: "Respons bukan JSON" }));
const proof = {
  testedAt: new Date().toISOString(),
  sender,
  recipient,
  httpStatus: response.status,
  providerAccepted: response.ok && Boolean(result.id),
  provider: {
    id: result.id,
    name: result.name,
    message:
      typeof result.message === "string"
        ? result.message.replaceAll(process.env.RESEND_API_KEY, "[redacted]")
        : undefined,
  },
  requestId: response.headers.get("x-request-id"),
};
await mkdir("artifacts", { recursive: true });
const file = "artifacts/resend-delivery-" + Date.now() + ".json";
await writeFile(file, JSON.stringify(proof, null, 2));
console.log(JSON.stringify({ ...proof, evidenceFile: file }, null, 2));
if (!proof.providerAccepted) process.exitCode = 1;

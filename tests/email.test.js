import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "../server/integrations.js";
const env = {
  RESEND_API_KEY: "test-secret",
  RESEND_FROM: "Liny Jaya <otp@verified.example>",
  RESEND_ALLOWED_TO: "owner@example.test",
};
const mail = {
  id: "otp/test",
  recipient: "new-customer@example.test",
  subject: "Kode verifikasi",
  html: "<p>OTP</p>",
};

test("Resend memakai penerima masing-masing; daftar penerima uji tidak membatasi API OTP", async () => {
  const requests = [];
  const transport = async (url, options) => {
    requests.push({
      url,
      body: JSON.parse(options.body),
      headers: options.headers,
    });
    return new Response(JSON.stringify({ id: "sent-id" }), { status: 200 });
  };
  for (const recipient of ["first@example.test", "second@example.test"])
    await sendEmail({ ...mail, recipient }, env, transport);
  assert.deepEqual(
    requests.map((r) => r.body.to),
    [["first@example.test"], ["second@example.test"]],
  );
  assert.equal(requests[0].body.from, env.RESEND_FROM);
  assert.equal(requests[0].url, "https://api.resend.com/emails");
  assert.equal(requests[0].headers["Idempotency-Key"], mail.id);
});
for (const [label, status, message, code] of [
  [
    "pengirim uji",
    403,
    "You can only send testing emails to your own email address.",
    "EMAIL_TEST_SENDER_RESTRICTED",
  ],
  [
    "domain belum diverifikasi",
    403,
    "The domain is not verified. Please verify your domain.",
    "EMAIL_SENDER_UNVERIFIED",
  ],
  ["API key tidak valid", 401, "API key is invalid", "EMAIL_API_KEY_REJECTED"],
  [
    "izin API key",
    403,
    "API key does not have permission to send emails",
    "EMAIL_API_KEY_REJECTED",
  ],
  ["penolakan izin lain", 403, "Sending is forbidden", "EMAIL_ACCESS_DENIED"],
  ["batas pengiriman", 429, "Too many requests", "EMAIL_RATE_LIMITED"],
])
  test("Diagnostik Resend: " + label, async () => {
    await assert.rejects(
      sendEmail(
        mail,
        env,
        async () =>
          new Response(JSON.stringify({ name: "validation_error", message }), {
            status,
          }),
      ),
      (error) => {
        assert.equal(error.code, code);
        assert.equal(error.providerStatus, status);
        assert.equal(error.status, 503);
        assert.ok(!error.message.includes(env.RESEND_API_KEY));
        return true;
      },
    );
  });
test("respons provider bukan JSON tidak diterima sebagai email terkirim", async () => {
  await assert.rejects(
    sendEmail(
      mail,
      env,
      async () => new Response("unavailable", { status: 502 }),
    ),
    (error) => error.code === "EMAIL_PROVIDER_ERROR",
  );
});

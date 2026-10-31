import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "../server/integrations.js";
import { sendWhatsApp, normalizePhone } from "../server/integrations.js";

const env = {
  RESEND_API_KEY: "test-secret",
  RESEND_FROM: "Liny Jaya <otp@verified.example>",
  RESEND_ALLOWED_TO: "owner@example.test",
  WABLAS_API_HOST: "https://smg.wablas.com",
  WABLAS_TOKEN: "test-token",
  WABLAS_SECRET_KEY: "test-secret",
};
const mail = {
  id: "otp/test",
  recipient: "new-customer@example.test",
  subject: "Kode verifikasi",
  html: "<p>OTP</p>",
};

test("normalizePhone format nomor telepon ke format internasional", () => {
  assert.equal(normalizePhone("08123456789"), "628123456789");
  assert.equal(normalizePhone("+628123456789"), "628123456789");
  assert.equal(normalizePhone("628123456789"), "628123456789");
  assert.equal(normalizePhone("0812-3456-7890"), "6281234567890");
  assert.equal(normalizePhone("+62 (812) 3456 7890"), "6281234567890");
});

test("sendWhatsApp mengirim pesan via Wablas API dengan header Authorization token.secret", async () => {
  const requests = [];
  const transport = async (url, options) => {
    requests.push({
      url,
      body: JSON.parse(options.body),
      headers: options.headers,
    });
    return new Response(JSON.stringify({ status: true, message: "Message queued" }), {
      status: 200,
    });
  };
  const result = await sendWhatsApp(
    { phone: "081234567890", message: "Kode OTP Anda: 123456" },
    env,
    transport,
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://smg.wablas.com/api/send-message");
  assert.equal(requests[0].headers["Authorization"], "test-token.test-secret");
  assert.equal(requests[0].body.phone, "6281234567890");
  assert.equal(requests[0].body.message, "Kode OTP Anda: 123456");
  assert.equal(result.status, true);
});
  for (const [label, status, message, code] of [
    [
      "pengirim uji",
      403,
      "You can only send testing emails to your own email address.",
      "WA_AUTH_ERROR",
    ],
    [
      "domain belum diverifikasi",
      403,
      "The domain is not verified. Please verify your domain.",
      "WA_AUTH_ERROR",
    ],
    ["API key tidak valid", 401, "API key is invalid", "WA_AUTH_ERROR"],
    [
      "izin API key",
      403,
      "API key does not have permission to send emails",
      "WA_AUTH_ERROR",
    ],
    ["penolakan izin lain", 403, "Sending is forbidden", "WA_AUTH_ERROR"],
    ["batas pengiriman", 429, "Too many requests", "WA_RATE_LIMITED"],
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
  test("sendWhatsApp error handling saat token ditolak (401)", async () => {
    await assert.rejects(
      sendWhatsApp(
        { phone: "081234567890", message: "OTP" },
        env,
        async () =>
          new Response(JSON.stringify({ status: false, message: "token invalid" }), {
            status: 401,
          }),
      ),
      (error) => {
        assert.equal(error.code, "WA_AUTH_ERROR");
        assert.equal(error.status, 503);
        return true;
      },
    );
  });

    test("sendWhatsApp error handling saat rate limited (429)", async () => {
      await assert.rejects(
        sendWhatsApp(
          { phone: "081234567890", message: "OTP" },
          env,
          async () =>
            new Response(JSON.stringify({ status: false, message: "too many requests" }), {
              status: 429,
            }),
        ),
        (error) => {
          assert.equal(error.code, "WA_RATE_LIMITED");
          assert.equal(error.status, 503);
          return true;
        },
      );
    });

    test("sendWhatsApp error handling saat status: false dari Wablas", async () => {
      await assert.rejects(
        sendWhatsApp(
          { phone: "081234567890", message: "OTP" },
          env,
          async () =>
            new Response(JSON.stringify({ status: false, message: "device disconnected" }), {
              status: 200,
            }),
        ),
        (error) => {
          assert.equal(error.code, "WA_PROVIDER_ERROR");
          return true;
        },
      );
    });

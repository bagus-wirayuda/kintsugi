import mysql from "mysql2/promise";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  databaseConfig,
  createPool,
  pool as unusedPool,
} from "../server/db.js";
import { initialize } from "../server/init.js";
import { createApp } from "../server/app.js";
const name = "liny_jaya_test_liveotp_" + Date.now();
const root = await mysql.createConnection({
  ...databaseConfig(),
  database: undefined,
});
await root.query(
  "CREATE DATABASE \`" +
    name +
    "\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
);
const pool = createPool(name);
let server, code, provider;
const evidence = {
  testedAt: new Date().toISOString(),
  test: "Pendaftaran OTP dengan Resend sesungguhnya, database pengujian terpisah",
};
try {
  await initialize(pool, false);
  const mailTransport = async (url, options) => {
    const mail = JSON.parse(options.body);
    code = mail.subject.match(/\b\d{6}\b/)?.[0];
    const response = await fetch(url, options);
    const result = await response.clone().json();
    provider = { status: response.status, id: result.id, error: result.name };
    return response;
  };
  server = createApp(pool, { mailTransport }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port + "/api";
  async function request(path, body) {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const email = process.env.RESEND_ALLOWED_TO.split(",")[0].trim();
  const pending = await request("/auth/register", {
    name: "Pengujian OTP Liny Jaya",
    email,
    password: "Test-" + randomUUID(),
  });
  evidence.requestStatus = pending.status;
  evidence.provider = provider;
  evidence.accountsBeforeVerification = (
    await pool.query("SELECT COUNT(*) AS n FROM users")
  ).rows[0].n;
  evidence.sessionBeforeVerification = Boolean(pending.cookie);
  if (pending.status === 202 && code) {
    const verified = await request("/auth/otp/verify", {
      challengeId: pending.data.challengeId,
      code,
    });
    evidence.verificationStatus = verified.status;
    evidence.sessionAfterVerification = Boolean(verified.cookie);
    evidence.accountsAfterVerification = (
      await pool.query("SELECT COUNT(*) AS n FROM users")
    ).rows[0].n;
    evidence.replayStatus = (
      await request("/auth/otp/verify", {
        challengeId: pending.data.challengeId,
        code,
      })
    ).status;
  } else evidence.error = pending.data.error;
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/otp-live-verification.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (server) await new Promise((r) => server.close(r));
  await pool.end();
  await unusedPool.end();
  await root.query("DROP DATABASE \`" + name + "\`");
  await root.end();
}

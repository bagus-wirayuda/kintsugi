import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startRuntime } from "../server/runtime.js";

test("port terpakai tidak mencetak sukses atau memulai pekerjaan database", async () => {
  const occupied = createServer();
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  let jobs = 0;
  const logs = [];
  const app = (req, res) => res.end("ok");
  app.locals = {
    background: async () => {
      jobs++;
    },
  };
  try {
    await assert.rejects(
      startRuntime(app, {
        pool: { end: async () => {} },
        host: "127.0.0.1",
        port: occupied.address().port,
        log: (...args) => logs.push(args),
      }),
      { code: "EADDRINUSE" },
    );
    assert.equal(jobs, 0);
    assert.deepEqual(logs, []);
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
});

test("shutdown menunggu pekerjaan aktif sebelum pool ditutup dan hanya menutup satu kali", async () => {
  let finishJob;
  let endCount = 0;
  const job = new Promise((resolve) => {
    finishJob = resolve;
  });
  const app = (req, res) => res.end("ok");
  app.locals = { background: () => job };
  const runtime = await startRuntime(app, {
    pool: {
      end: async () => {
        endCount++;
      },
    },
    host: "127.0.0.1",
    port: 0,
    log: () => {},
  });
  const first = runtime.close();
  const second = runtime.close();
  assert.equal(first, second);
  assert.equal(endCount, 0);
  finishJob();
  await first;
  assert.equal(endCount, 1);
});

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";

const backendPort = Number(process.env.PORT) || 3001;
const backendUrl = `http://127.0.0.1:${backendPort}`;
let backend;
let vite;
let stopping = false;
let backendExit;

async function ready() {
  try {
    const response = await fetch(backendUrl + "/api/health", {
      signal: AbortSignal.timeout(800),
    });
    const health = await response.json();
    return response.ok && health.status === "ok" && health.database === "mysql";
  } catch {
    return false;
  }
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await vite?.close();
  // Hanya hentikan backend yang dimulai oleh proses development ini.
  if (backend && backend.exitCode === null) backend.kill();
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => void stop());

try {
  if (await ready()) {
    console.log(`Backend toko sudah aktif: ${backendUrl}`);
  } else {
    console.log("Menyalakan backend dan menghubungkan MySQL Laragon…");
    backend = spawn(
      process.execPath,
      ["--env-file-if-exists=.env", "server/index.js"],
      { stdio: "inherit", windowsHide: true },
    );
    backend.on("error", (error) => {
      console.error("Backend tidak dapat dimulai:", error.message);
      backendExit = 1;
      void stop(1);
    });
    backend.on("exit", (code) => {
      backendExit = code ?? 1;
      if (!stopping && vite) {
        console.error(
          "Backend berhenti. Periksa MySQL Laragon lalu jalankan npm run dev kembali.",
        );
        void stop(1);
      }
    });
    const deadline = Date.now() + 15000;
    while (!(await ready())) {
      if (backendExit !== undefined || stopping)
        throw new Error("Backend gagal dimulai. Periksa pesan di atas.");
      if (Date.now() >= deadline)
        throw new Error(
          "Backend belum siap. Aktifkan MySQL di Laragon dan jalankan npm run db:init.",
        );
      await delay(200);
    }
  }
  if (!stopping) {
    vite = await createServer({
      server: { host: "127.0.0.1", port: 5173, strictPort: true },
    });
    await vite.listen();
    console.log("\nToko siap. Biarkan terminal ini terbuka selama digunakan.");
    vite.printUrls();
  }
} catch (error) {
  console.error("\nStartup gagal:", error.message);
  await stop(1);
}

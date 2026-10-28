import { createServer } from "node:http";

export async function startRuntime(
  app,
  {
    pool,
    port,
    host,
    interval = 60000,
    log = console.log,
    reportError = console.error,
  },
) {
  const server = createServer(app);
  // Gunakan event HTTP asli: callback app.listen Express 5 juga dipanggil saat gagal.
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  let activeJob;
  let stopping = false;
  let closing;
  function background() {
    if (stopping || activeJob) return;
    activeJob = Promise.resolve()
      .then(() => app.locals.background())
      .catch((error) =>
        reportError("Pekerjaan berkala gagal:", error.code || error.message),
      )
      .finally(() => {
        activeJob = undefined;
      });
  }
  const timer = setInterval(background, interval);
  timer.unref();
  log(`Liny Jaya: http://localhost:${server.address().port} · MySQL Laragon`);
  background();

  function close() {
    if (closing) return closing;
    stopping = true;
    clearInterval(timer);
    // Selesaikan request dan pekerjaan aktif sebelum menutup koneksi MySQL.
    closing = Promise.all([
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
      activeJob,
    ]).then(() => pool.end());
    return closing;
  }
  return { server, close };
}

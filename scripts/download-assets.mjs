import { mkdir, writeFile } from "node:fs/promises";
import { assetSources } from "../src/data.js";
await mkdir(new URL("../public/images/", import.meta.url), { recursive: true });
for (const [name, url] of Object.entries(assetSources)) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  await writeFile(
    new URL(`../public/images/${name}.jpg`, import.meta.url),
    new Uint8Array(await response.arrayBuffer()),
  );
  console.log(`${name}.jpg tersimpan`);
}

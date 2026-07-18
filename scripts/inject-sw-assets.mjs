import { readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const clientDirectory = resolve("dist/client");
const serviceWorkerPath = resolve(clientDirectory, "sw.js");
const marker = "/* __DMPLAYER_BUILD_ASSETS__ */ []";

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return files.flat();
}

const files = await walk(clientDirectory);
const buildAssets = files
  .filter((path) => path !== serviceWorkerPath && /\.(?:css|js|woff2?)$/i.test(path))
  .map((path) => `./${relative(clientDirectory, path).split(sep).join("/")}`)
  .sort();

const serviceWorker = await readFile(serviceWorkerPath, "utf8");
if (!serviceWorker.includes(marker)) {
  throw new Error("Service Worker asset marker was not found.");
}

await writeFile(
  serviceWorkerPath,
  serviceWorker.replace(marker, JSON.stringify(buildAssets)),
);

console.log(`Injected ${buildAssets.length} offline assets into dist/client/sw.js.`);

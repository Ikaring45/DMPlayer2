import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the DMPlayer2 application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="ja">/i);
  assert.match(html, /<title>DMPlayer2/);
  assert.match(html, /音楽を、この端末に。/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /apple-mobile-web-app-status-bar-style/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("ships local-first PWA assets and removes starter UI", async () => {
  const [manifestText, serviceWorker, page, layout] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.short_name, "DMPlayer2");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.match(serviceWorker, /caches\.open/);
  assert.match(page, /<PlayerApp/);
  assert.match(layout, /viewportFit:\s*"cover"/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});

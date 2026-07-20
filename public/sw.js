const CACHE = "dmplayer2-shell-v13";
const LEGACY_CACHE_WITHOUT_UPDATE_UI = "dmplayer2-shell-v7";
const BUILD_ASSETS = /* __DMPLAYER_BUILD_ASSETS__ */ [];
const SHELL = [
  "./",
  "./manifest.webmanifest",
  "./favicon-32.png",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./dmplayer-icon.png",
  ...BUILD_ASSETS,
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => caches.has(LEGACY_CACHE_WITHOUT_UPDATE_UI))
      .then((legacyAppInstalled) => legacyAppInstalled ? self.skipWaiting() : undefined),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys
      .filter((key) => key.startsWith("dmplayer2-") && key !== CACHE)
      .map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING" || event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && response.status === 200) {
      return caches.open(CACHE)
        .then((cache) => cache.put(request, response.clone()))
        .then(() => response, () => response);
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await caches.match("./");
      if (shell) return shell;
    }
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }));
});

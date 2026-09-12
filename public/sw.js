/* SautiSafe service worker.
 * Strategy:
 *  - Navigations: network-first, fall back to the cached app shell offline.
 *  - Static assets (/_next/static, icons, manifest): cache-first (they're hashed/immutable).
 *  - GET /api/* (reads): network-first with a short offline cache so the last
 *    reports list is readable offline.
 *  - POST/PUT/PATCH /api/*: NEVER intercepted. If offline, the app saves the
 *    report to the IndexedDB draft queue and retries on connectivity — the SW
 *    must not swallow writes.
 */
const VERSION = "sautisafe-v1";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const READS = `${VERSION}-reads`;

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE).catch(() => c.put("/", new Response(""))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![SHELL, RUNTIME, READS].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept writes
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin: let it pass

  // Navigations: network-first → cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(request).then((r) => r || caches.match("/")),
        ),
    );
    return;
  }

  // Static, hashed assets: cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:svg|png|webmanifest|ico|woff2?|css|js)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // GET /api/* (reads): network-first, fall back to last cached response.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(READS).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }
});

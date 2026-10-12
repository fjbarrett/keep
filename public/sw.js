const CACHE_NAME = "keep-static-v5";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  // Precache the neutral offline page so a navigation with no network falls back
  // to it instead of the browser's error screen. It carries no account data,
  // unlike the personalized app shell, which is never cached.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Navigations always hit the network for the real (personalized) page — that
  // shell is never cached — but fall back to the neutral /offline page rather
  // than the browser's error screen when there's no connection.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (cached) => cached ?? new Response("Offline", { status: 503 }),
        ),
      ),
    );
    return;
  }

  // Never persist HTML or user-addressable routes. In particular, shared notes,
  // auth pages, and personalized server-rendered headers must disappear when
  // revoked or signed out. IndexedDB owns note data; this cache owns static files.
  const staticAsset =
    url.pathname.startsWith("/_next/static/") ||
    /^\/pdf\.worker\.[0-9.]+\.min\.mjs$/.test(url.pathname);
  if (!staticAsset) return;

  const cached = caches.match(request);
  const fresh = fetch(request);
  // Register lifetime work during event dispatch, before any promise settles.
  event.waitUntil(fresh.then(async (response) => {
    const cacheControl = response.headers.get("cache-control") ?? "";
    if (response.ok && !/no-store|private/i.test(cacheControl)) {
      const clone = response.clone();
      await (await caches.open(CACHE_NAME)).put(request, clone);
    }
  }).catch(() => {}));
  event.respondWith(cached.then((response) => response ?? fresh.catch(() =>
    new Response("Offline", { status: 503 }),
  )));
});

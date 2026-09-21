// Minimal app-shell service worker.
// Chrome will not offer "Install app" on Android without a service worker that
// has a fetch handler, so this is what makes Rephrase installable -- and it
// means the shell opens instantly and offline.
//
// Rewriting itself always needs the network; only the shell is cached.

const VERSION = "v1";
const SHELL = `rephrase-shell-${VERSION}`;

// Bump VERSION to invalidate. Only same-origin static assets go in here.
const PRECACHE = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // a failed precache must not block install
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache the API -- a stale rewrite is worse than no rewrite.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network first so shared text and fresh builds always win,
  // falling back to the cached shell when offline.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error()))
    );
    return;
  }

  // Build assets are content-hashed, so cache-first is safe and fast.
  e.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
    )
  );
});

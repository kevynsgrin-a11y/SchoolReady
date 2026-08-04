/**
 * Service worker: the in-store checklist survives connection loss.
 *
 * Strategy: static assets (styles, script, fonts) are cache-first; the
 * checklist routes are network-first with cache fallback, so the last
 * loaded checklist keeps working in a dead spot. Nothing else is cached —
 * prices and safety data must never be served stale silently by this
 * layer (staleness handling belongs to the API's envelopes and badges).
 */
var CACHE_NAME = "planner-offline-v1";
var PRECACHE = [
  "/assets/ui.css",
  "/assets/app.js",
  "/manifest.webmanifest",
  "/assets/fonts/bricolage-grotesque-latin-600-normal.woff2",
  "/assets/fonts/bricolage-grotesque-latin-700-normal.woff2",
  "/assets/fonts/bricolage-grotesque-latin-800-normal.woff2",
  "/assets/fonts/atkinson-hyperlegible-next-latin-400-normal.woff2",
  "/assets/fonts/atkinson-hyperlegible-next-latin-700-normal.woff2",
  "/assets/fonts/spline-sans-mono-latin-400-normal.woff2",
  "/assets/fonts/spline-sans-mono-latin-500-normal.woff2",
];

self.addEventListener("install", function onInstall(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function precache(cache) {
      return cache.addAll(PRECACHE);
    }),
  );
});

self.addEventListener("activate", function onActivate(event) {
  event.waitUntil(
    caches.keys().then(function cleanup(keys) {
      return Promise.all(
        keys
          .filter(function old(key) {
            return key !== CACHE_NAME;
          })
          .map(function drop(key) {
            return caches.delete(key);
          }),
      );
    }),
  );
});

function isChecklist(url) {
  return url.pathname === "/plan/checklist";
}

function isStaticAsset(url) {
  return url.pathname.indexOf("/assets/") === 0 || url.pathname === "/manifest.webmanifest";
}

self.addEventListener("fetch", function onFetch(event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(function cached(hit) {
        return (
          hit ||
          fetch(request).then(function store(response) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function put(cache) {
              cache.put(request, copy);
            });
            return response;
          })
        );
      }),
    );
    return;
  }

  if (isChecklist(url)) {
    event.respondWith(
      fetch(request)
        .then(function store(response) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function put(cache) {
            cache.put(request, copy);
          });
          return response;
        })
        .catch(function offline() {
          return caches.match(request).then(function fallback(hit) {
            return hit || caches.match("/plan/checklist");
          });
        }),
    );
  }
});

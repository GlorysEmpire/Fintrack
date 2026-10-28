/*
 * FinTrack service worker: makes the app installable and gives it a calm
 * offline screen. It is deliberately tiny and PRIVACY-SAFE:
 *
 *  - It caches STATIC files only: the app's own scripts and styles (/_next/static/),
 *    the icons, and the offline page.
 *  - It NEVER caches an API response or a page. Nothing about the user's money is
 *    ever written to the device's cache, so a shared or lost phone reveals
 *    nothing through it, and a stale balance can never be shown as current.
 *  - Offline, a page request shows the offline screen, not old data.
 *
 * Bump CACHE when this file or the offline page changes.
 */
const CACHE = "fintrack-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // never touch a write
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch another site
  if (url.pathname.startsWith("/api/")) return; // never cache or intercept the API

  // A page: always the network. Only if it fails, the offline screen (never old data).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error()))
    );
    return;
  }

  // Static files: cache first, they are fingerprinted and never hold user data
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
  // anything else: not intercepted
});

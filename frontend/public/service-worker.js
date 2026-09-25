/* Service worker for the installable (PWA) app.
 *
 * Intentionally minimal: it does NOT cache the app or any API data - every
 * request goes to the network exactly as in a normal browser tab, so a new
 * deployment is picked up immediately and nobody ever sees stale tickets.
 * Its only job is to show a friendly offline page when a page load fails
 * because there's no connection (and to make the app installable).
 *
 * Bump CACHE_VERSION when offline.html or its icon changes.
 */
const CACHE_VERSION = "v1";
const OFFLINE_CACHE = `offline-${CACHE_VERSION}`;
const OFFLINE_ASSETS = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only page navigations get the offline fallback; everything else
  // (scripts, images, API calls, websockets) is left to the browser.
  if (request.mode !== "navigate") return;
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      return (await cache.match("/offline.html")) || Response.error();
    })
  );
});

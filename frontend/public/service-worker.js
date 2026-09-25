/* Service worker for the installable (PWA) app.
 *
 * Also receives Web Push messages from the backend (chat messages, request
 * and ticket updates) and shows them as phone/desktop notifications, even
 * when the app is closed.
 *
 * Intentionally minimal: it does NOT cache the app or any API data - every
 * request goes to the network exactly as in a normal browser tab, so a new
 * deployment is picked up immediately and nobody ever sees stale tickets.
 * Its only job is to show a friendly offline page when a page load fails
 * because there's no connection (and to make the app installable).
 *
 * Bump CACHE_VERSION when offline.html or its icon changes.
 */
const CACHE_VERSION = "v2";
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

// ---------- Push notifications ----------

const isIOS = /iphone|ipad|ipod/i.test(self.navigator.userAgent || "");

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Wii Tickets";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || undefined,
    // A newer message in the same chat replaces the old notification but
    // still buzzes the phone.
    renotify: !!data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Someone is looking at the app right now - it already shows the
      // message in-app, so skip the duplicate system notification. (iOS
      // requires every push to show a notification, so always show there.)
      const focused = clients.some((c) => c.focused && c.visibilityState === "visible");
      if (focused && !isIOS) return undefined;
      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        // Reuse the open app: bring it forward and let it route in-app
        // (keeps chat state, avoids a full reload).
        client.postMessage({ type: "notification-click", url });
        return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

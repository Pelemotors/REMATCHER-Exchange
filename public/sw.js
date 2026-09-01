const CACHE_NAME = "rematcher-exchange-v3";
const APP_NAME = "REMATCHER Exchange";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache auth/public HTML shells — always fetch fresh from network
  if (
    event.request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/signup") ||
    url.pathname.startsWith("/forgot-password") ||
    url.pathname.startsWith("/reset-password")
  ) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r ?? new Response("Offline"))
      )
    );
    return;
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || APP_NAME, {
      body: data.body,
      tag: APP_NAME,
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      data: { link: data.link },
      dir: "rtl",
      lang: "he",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? "/activity";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(link);
            return client.focus();
          }
        }
        return self.clients.openWindow(link);
      })
  );
});

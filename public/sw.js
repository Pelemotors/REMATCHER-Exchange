const CACHE_NAME = "rematcher-exchange-v6";
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

async function reportTelemetry(deliveryId, event) {
  if (!deliveryId) return;
  try {
    await fetch("/api/push/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ deliveryId, event }),
    });
  } catch {
    /* non-blocking */
  }
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const deliveryId = data.deliveryId ?? null;

  event.waitUntil(
    (async () => {
      await reportTelemetry(deliveryId, "received");
      await self.registration.showNotification(data.title || APP_NAME, {
        body: data.body,
        tag: deliveryId || APP_NAME,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { link: data.link, deliveryId },
        dir: "rtl",
        lang: "he",
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawLink = event.notification.data?.link ?? "/activity";
  const deliveryId = event.notification.data?.deliveryId ?? null;
  const targetUrl = new URL(rawLink, self.location.origin).href;

  event.waitUntil(
    (async () => {
      await reportTelemetry(deliveryId, "clicked");
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Prefer focusing an existing same-origin PWA / app window
      const sameOrigin = clients.filter((c) => {
        try {
          return new URL(c.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      for (const client of sameOrigin) {
        if ("focus" in client) {
          await client.focus();
          // Prefer SPA client navigation — avoid full document reload via client.navigate()
          client.postMessage({ type: "REMATCHER_NAVIGATE", url: rawLink });
          await reportTelemetry(deliveryId, "destination_opened");
          return;
        }
      }

      const newClient = await self.clients.openWindow(targetUrl);
      if (newClient) {
        await reportTelemetry(deliveryId, "destination_opened");
      }
    })()
  );
});

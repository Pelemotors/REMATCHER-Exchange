/// <reference lib="webworker" />

const CACHE_NAME = "rematcher-exchange-v1";
const APP_NAME = "REMATCHER Exchange";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  (self as unknown as ServiceWorkerGlobalScope).clients.claim();
});

self.addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r ?? new Response("Offline"))
      )
    );
  }
});

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  const data = event.data.json() as {
    title: string;
    body: string;
    link?: string;
  };
  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).registration.showNotification(
      data.title || APP_NAME,
      {
        body: data.body,
        tag: APP_NAME,
        icon: "/icons/icon.svg",
        badge: "/icons/icon.svg",
        data: { link: data.link },
        dir: "rtl",
        lang: "he",
      }
    )
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const link = event.notification.data?.link ?? "/activity";
  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            (client as WindowClient).navigate(link);
            return (client as WindowClient).focus();
          }
        }
        return (self as unknown as ServiceWorkerGlobalScope).clients.openWindow(link);
      })
  );
});

export {};

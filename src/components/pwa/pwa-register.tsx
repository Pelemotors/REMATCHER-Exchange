"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (!data || data.type !== "REMATCHER_NAVIGATE" || !data.url) return;
      try {
        const target = new URL(data.url, window.location.origin);
        if (target.origin !== window.location.origin) return;
        if (window.location.pathname + window.location.search !== target.pathname + target.search) {
          window.location.assign(target.pathname + target.search + target.hash);
        }
      } catch {
        /* ignore malformed */
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);

    const register = () => {
      navigator.serviceWorker
        .getRegistration()
        .then((existing) => existing ?? navigator.serviceWorker.register("/sw.js"))
        .then((registration) => {
          registration.update().catch(() => {});
        })
        .catch(() => {});
    };

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(register, { timeout: 3000 });
      return () => {
        window.cancelIdleCallback(id);
        navigator.serviceWorker.removeEventListener("message", onMessage);
      };
    }

    const timer = setTimeout(register, 1500);
    return () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

/** Registers the Service Worker only — navigation is handled by PwaNavigationBridge. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

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
      return () => window.cancelIdleCallback(id);
    }

    const timer = setTimeout(register, 1500);
    return () => clearTimeout(timer);
  }, []);

  return null;
}

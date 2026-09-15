"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Capacitor deep-link + app lifecycle bridge for the Web shell.
 * No-ops in browsers. Does not duplicate business logic.
 */
export function CapacitorNativeBridge() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform() || cancelled) return;

        document.documentElement.dataset.nativeShell = Capacitor.getPlatform();

        // Custom scheme / app URL open while app is already running
        try {
          const { App } = await import("@capacitor/app");
          const sub = await App.addListener("appUrlOpen", (event) => {
            try {
              const url = new URL(event.url);
              if (url.protocol === "rematcher-exchange:") {
                const host = url.host || "";
                const path =
                  host === "intake" || host === "app"
                    ? host === "intake"
                      ? `/intake/handoff${url.search}`
                      : url.pathname || "/home"
                    : url.pathname || "/home";
                router.push(path.startsWith("/") ? path : `/${path}`);
                return;
              }
              if (url.protocol === "https:") {
                router.push(`${url.pathname}${url.search}`);
              }
            } catch {
              /* ignore malformed */
            }
          });
          if (cancelled) void sub.remove();
        } catch {
          /* @capacitor/app optional until installed in native project */
        }
      } catch {
        /* not in Capacitor */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}

"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  isSameClientDestination,
  sanitizeClientNavigateUrl,
} from "@/lib/pwa-navigate";

/**
 * Bridge: Service Worker REMATCHER_NAVIGATE → Next.js client navigation.
 * Avoids full document reload when the PWA is already open.
 */
export function PwaNavigationBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (!data || data.type !== "REMATCHER_NAVIGATE" || !data.url) return;

      const path = sanitizeClientNavigateUrl(data.url, window.location.origin);
      if (!path) return;

      const search = searchParams?.toString()
        ? `?${searchParams.toString()}`
        : "";
      if (isSameClientDestination(pathname, search, path)) return;

      router.push(path);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [router, pathname, searchParams]);

  return null;
}

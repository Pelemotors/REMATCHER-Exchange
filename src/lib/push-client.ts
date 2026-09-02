"use client";

import {
  detectPushSupport,
  hasPushApis,
  type PushSupportKind,
} from "@/lib/push-support";

const ACTIVATE_TIMEOUT_MS = 15_000;

export type PushClientSnapshot = {
  support: PushSupportKind;
  permission: NotificationPermission | "unsupported";
  deviceSubscribed: boolean;
  endpoint: string | null;
  pushConfigured: boolean;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function getClientPushSupport(): PushSupportKind {
  if (typeof window === "undefined") return "unsupported";
  const hasApis = hasPushApis(
    "serviceWorker" in navigator,
    "PushManager" in window,
    "Notification" in window
  );
  const standaloneNav = (
    navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return detectPushSupport({
    userAgent: navigator.userAgent,
    hasApis,
    displayMode: window.matchMedia("(display-mode: standalone)").matches
      ? "standalone"
      : undefined,
    navigatorStandalone: standaloneNav,
  });
}

export async function ensureServiceWorkerReady() {
  await navigator.serviceWorker.register("/sw.js");
  return withTimeout(navigator.serviceWorker.ready, ACTIVATE_TIMEOUT_MS);
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (getClientPushSupport() !== "supported") return null;
  const reg = await ensureServiceWorkerReady();
  return reg.pushManager.getSubscription();
}

export async function fetchPushStatus(endpoint: string | null) {
  const url = endpoint
    ? `/api/push/status?endpoint=${encodeURIComponent(endpoint)}`
    : "/api/push/status";
  const res = await fetch(url);
  if (!res.ok) {
    return { deviceSubscribed: false, pushConfigured: false, serverSubscriptionCount: 0 };
  }
  return res.json() as Promise<{
    deviceSubscribed: boolean;
    pushConfigured: boolean;
    serverSubscriptionCount: number;
  }>;
}

export async function getPushClientSnapshot(): Promise<PushClientSnapshot> {
  const support = getClientPushSupport();
  if (support !== "supported") {
    return {
      support,
      permission: "unsupported",
      deviceSubscribed: false,
      endpoint: null,
      pushConfigured: false,
    };
  }

  const permission = Notification.permission;
  let endpoint: string | null = null;
  let deviceSubscribed = false;
  let pushConfigured = false;

  try {
    const sub = await getCurrentPushSubscription();
    endpoint = sub?.endpoint ?? null;
    const status = await fetchPushStatus(endpoint);
    deviceSubscribed = Boolean(sub && status.deviceSubscribed);
    pushConfigured = status.pushConfigured;
  } catch {
    /* keep defaults */
  }

  return {
    support,
    permission,
    deviceSubscribed,
    endpoint,
    pushConfigured,
  };
}

/** Request permission only when user explicitly opts in */
export async function subscribeToPush(): Promise<{
  ok: boolean;
  reason?: "denied" | "dismissed" | "not_configured" | "save_failed" | "error";
}> {
  if (getClientPushSupport() !== "supported") {
    return { ok: false, reason: "error" };
  }

  const permission = await Notification.requestPermission();
  if (permission === "denied") return { ok: false, reason: "denied" };
  if (permission !== "granted") return { ok: false, reason: "dismissed" };

  try {
    const reg = await ensureServiceWorkerReady();
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      const status = await fetchPushStatus(existing.endpoint);
      if (status.deviceSubscribed) {
        return { ok: true };
      }
    }

    const vapidRes = await fetch("/api/push/vapid");
    const vapidKey = await vapidRes.json();
    if (!vapidKey.publicKey) {
      return { ok: false, reason: "not_configured" };
    }

    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey.publicKey),
      }));

    const saveRes = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });

    if (!saveRes.ok) return { ok: false, reason: "save_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean }> {
  if (getClientPushSupport() !== "supported") return { ok: false };

  try {
    const sub = await getCurrentPushSubscription();
    if (!sub) {
      return { ok: true };
    }

    const endpoint = sub.endpoint;
    await sub.unsubscribe();

    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });

    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

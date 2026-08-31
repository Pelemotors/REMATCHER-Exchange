"use client";

import { useCallback, useEffect, useState } from "react";

const ACTIVATE_TIMEOUT_MS = 15_000;

type PushUiState =
  | "unsupported"
  | "blocked"
  | "disabled"
  | "activating"
  | "error"
  | "enabled";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

export function PushSubscribeButton() {
  const [state, setState] = useState<PushUiState>("disabled");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState("unsupported");
      return;
    }

    const permission = Notification.permission;
    if (permission === "denied") {
      setState("blocked");
      return;
    }

    try {
      await navigator.serviceWorker.register("/sw.js");
      const reg = await withTimeout(
        navigator.serviceWorker.ready,
        ACTIVATE_TIMEOUT_MS
      );
      const clientSub = await reg.pushManager.getSubscription();
      const serverStatus = await fetch("/api/push/status").then((r) =>
        r.ok ? r.json() : { serverSubscribed: false }
      );

      if (clientSub && serverStatus.serverSubscribed) {
        setState("enabled");
        return;
      }

      setState(permission === "granted" ? "disabled" : "disabled");
    } catch {
      setState("error");
      setErrorMessage("לא הצלחנו לבדוק את מצב ההתראות");
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  async function subscribe() {
    setState("activating");
    setErrorMessage(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("blocked");
        return;
      }
      if (permission !== "granted") {
        setState("disabled");
        return;
      }

      await navigator.serviceWorker.register("/sw.js");
      const reg = await withTimeout(
        navigator.serviceWorker.ready,
        ACTIVATE_TIMEOUT_MS
      );

      const vapidRes = await fetch("/api/push/vapid");
      const vapidKey = await vapidRes.json();
      if (!vapidKey.publicKey) {
        throw new Error("vapid_not_configured");
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey.publicKey),
      });

      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      if (!saveRes.ok) {
        throw new Error("save_failed");
      }

      setState("enabled");
    } catch {
      setState("error");
      setErrorMessage("לא הצלחנו להפעיל התראות");
    }
  }

  if (state === "unsupported") return null;

  if (state === "enabled") {
    return (
      <p className="text-sm font-medium text-success">התראות פעילות</p>
    );
  }

  if (state === "blocked") {
    return (
      <div className="space-y-2 text-sm text-text-secondary">
        <p className="font-medium text-warning">התראות חסומות בדפדפן</p>
        <p>אפשר התראות בהגדרות הדפדפן כדי לקבל עדכונים על התאמות ועניין.</p>
      </div>
    );
  }

  if (state === "activating") {
    return (
      <button className="btn-secondary w-full text-sm" disabled>
        מפעיל...
      </button>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-error">
          {errorMessage ?? "לא הצלחנו להפעיל התראות"}
        </p>
        <button className="btn-secondary w-full text-sm" onClick={subscribe}>
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <button className="btn-secondary w-full text-sm" onClick={subscribe}>
      הפעל התראות
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

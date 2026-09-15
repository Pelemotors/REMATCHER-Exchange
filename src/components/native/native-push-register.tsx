"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

/**
 * Registers for APNs/FCM via Capacitor when available.
 * No-ops in browser. Delivery still OWNER_BLOCKED without Firebase/APNs keys.
 */
export function NativePushRegister() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;
    let cancelled = false;

    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform() || cancelled) return;

        const PushNotifications = await import("@capacitor/push-notifications");
        const perm = await PushNotifications.PushNotifications.requestPermissions();
        if (perm.receive !== "granted") return;

        await PushNotifications.PushNotifications.register();

        try {
          const installationId =
            typeof localStorage !== "undefined"
              ? localStorage.getItem("rmx-installation-id") ||
                crypto.randomUUID()
              : crypto.randomUUID();
          localStorage.setItem("rmx-installation-id", installationId);
          const platform =
            Capacitor.getPlatform() === "ios" ? "IOS" : "ANDROID";
          await fetch("/api/devices/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              installationId,
              platform,
              appVersion: "0.2.0-rc.1",
            }),
          });
        } catch {
          /* device API optional */
        }

        const reg = await PushNotifications.PushNotifications.addListener(
          "registration",
          (token) => {
            const platform =
              Capacitor.getPlatform() === "ios" ? "ios" : "android";
            void fetch("/api/push/native-register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                platform,
                deviceToken: token.value,
              }),
            });
          }
        );

        const err = await PushNotifications.PushNotifications.addListener(
          "registrationError",
          () => {
            /* expected until Firebase/APNs wired in store build */
          }
        );

        if (cancelled) {
          void reg.remove();
          void err.remove();
        }
      } catch {
        /* plugin missing or not in native shell */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, status]);

  return null;
}

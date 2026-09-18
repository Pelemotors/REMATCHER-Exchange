/**
 * Native push (APNs / FCM) — registration + persistence without inventing credentials.
 *
 * Web Push (VAPID) remains in `push.ts` for browsers/PWA.
 * Store apps register device tokens here; delivery waits on Owner APNs/FCM config.
 *
 * OWNER BLOCKERS for live device delivery:
 * - Apple: APNs key (.p8) + Push capability
 * - Google: Firebase + google-services.json / GoogleService-Info.plist
 * - Capacitor PushNotifications wired in signed builds
 */

import "server-only";
import { prisma } from "@/lib/prisma";

export type NativePushPlatform = "ios" | "android";

export type NativePushRegistration = {
  platform: NativePushPlatform;
  /** APNs / FCM device token — never a VAPID endpoint */
  deviceToken: string;
  /** Stable client installation id for logout/revoke ownership */
  installationId?: string;
};

const NATIVE_ENDPOINT_PREFIX = {
  ios: "apns://",
  android: "fcm://",
} as const;

export function isNativePushDeliveryConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_NATIVE_PUSH_READY === "true" ||
      process.env.FCM_SERVER_KEY ||
      process.env.APNS_KEY_ID
  );
}

export function nativeEndpointFor(
  platform: NativePushPlatform,
  deviceToken: string
): string {
  return `${NATIVE_ENDPOINT_PREFIX[platform]}${deviceToken}`;
}

export function isNativePushEndpoint(endpoint: string): boolean {
  return (
    endpoint.startsWith(NATIVE_ENDPOINT_PREFIX.ios) ||
    endpoint.startsWith(NATIVE_ENDPOINT_PREFIX.android)
  );
}

/**
 * Persist native device token using PushSubscription row with apns:// or fcm:// endpoint.
 * Delivery path skips these until FCM/APNs credentials exist.
 */
export async function registerNativePushDevice(input: {
  userId: string;
  registration: NativePushRegistration;
}): Promise<{ ok: boolean; reason?: string }> {
  const token = input.registration.deviceToken?.trim();
  if (!token || token.length < 8 || token.length > 4096) {
    return { ok: false, reason: "invalid_token" };
  }
  if (!/^[a-zA-Z0-9_\-:]+$/.test(token) && !/^[0-9a-fA-F]+$/.test(token)) {
    // Allow common FCM/APNs token char sets (hex or url-safe)
    if (!/^[a-zA-Z0-9_\-:.]+$/.test(token)) {
      return { ok: false, reason: "invalid_token_charset" };
    }
  }

  const endpoint = nativeEndpointFor(input.registration.platform, token);
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: input.userId,
      endpoint,
      p256dh: `native:${input.registration.platform}`,
      auth: "native-device-token",
    },
    update: {
      userId: input.userId,
      p256dh: `native:${input.registration.platform}`,
      auth: "native-device-token",
      invalidatedAt: null,
    },
  });

  if (input.registration.installationId) {
    const { registerOrUpdateInstallation } = await import(
      "@/services/devices/installations"
    );
    await registerOrUpdateInstallation({
      installationId: input.registration.installationId,
      platform: input.registration.platform === "ios" ? "IOS" : "ANDROID",
      userId: input.userId,
      pushToken: token,
      pushProvider: input.registration.platform === "ios" ? "APNS" : "FCM",
      pushPermission: "GRANTED",
    });
  }

  return { ok: true };
}

export async function unregisterNativePushDevice(input: {
  userId: string;
  platform: NativePushPlatform;
  deviceToken: string;
}): Promise<boolean> {
  const endpoint = nativeEndpointFor(input.platform, input.deviceToken);
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });
  if (!existing || existing.userId !== input.userId) return false;
  await prisma.pushSubscription.delete({ where: { endpoint } });
  return true;
}

/**
 * Placeholder send — never invents APNs/FCM credentials.
 * Returns not_configured until Owner env is present.
 */
export async function sendNativePushToUser(_input: {
  userId: string;
  title: string;
  body: string;
  link?: string;
}): Promise<{ sent: number; failed: number; reason?: string }> {
  if (!isNativePushDeliveryConfigured()) {
    return { sent: 0, failed: 0, reason: "native_push_not_configured" };
  }
  return { sent: 0, failed: 0, reason: "native_push_sender_pending_credentials" };
}

/** @deprecated use isNativePushDeliveryConfigured */
export function isNativePushConfigured(): boolean {
  return isNativePushDeliveryConfigured();
}

/**
 * Native push architecture (APNs / FCM) — scaffolding without store credentials.
 *
 * Current production path: Web Push (VAPID) via `src/services/notifications/push.ts`.
 * Store apps SHOULD use platform push; this module defines the bridge contract.
 *
 * OWNER BLOCKERS before device push works in Store builds:
 * - Apple: APNs key (.p8) + App ID Push capability + Team ID
 * - Google: Firebase project + google-services.json / GoogleService-Info.plist
 * - Wire `@capacitor/push-notifications` on Mac/CI after credentials exist
 */

export type NativePushPlatform = "ios" | "android" | "web" | "unknown";

export type NativePushRegistration = {
  platform: NativePushPlatform;
  /** APNs / FCM device token — never a VAPID endpoint */
  deviceToken: string;
};

export function isNativePushConfigured(): boolean {
  // Credentials are injected at build time by Owner; code must not invent them.
  return Boolean(
    process.env.NEXT_PUBLIC_NATIVE_PUSH_READY === "true" ||
      process.env.FCM_SERVER_KEY ||
      process.env.APNS_KEY_ID
  );
}

/**
 * Server-side registration hook (future). Persists device tokens separately from Web Push.
 * Returns false until Owner credentials + native plugin are wired.
 */
export async function registerNativePushDevice(_input: {
  dealerId: string;
  userId: string;
  registration: NativePushRegistration;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!isNativePushConfigured()) {
    return { ok: false, reason: "native_push_not_configured" };
  }
  return { ok: false, reason: "native_push_persistence_pending" };
}

/** Feature detection and status helpers — testable without DOM where noted. */

export type PushSupportKind =
  | "supported"
  | "unsupported"
  | "ios_needs_install"
  | "permission_denied";

export type PushDisplayStatus =
  | "active"
  | "off"
  | "blocked"
  | "unsupported"
  | "ios_needs_install";

export function isIosDevice(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}

export function isStandaloneDisplayMode(
  displayMode: string | undefined,
  navigatorStandalone?: boolean
): boolean {
  return displayMode === "standalone" || navigatorStandalone === true;
}

/** Browser APIs required for Web Push */
export function hasPushApis(
  sw: boolean,
  pushManager: boolean,
  notification: boolean
): boolean {
  return sw && pushManager && notification;
}

/**
 * iOS Safari supports Web Push only for installed PWAs (16.4+).
 * Avoid broken permission prompts when opened in mobile Safari tab.
 */
export function detectPushSupport(input: {
  userAgent: string;
  hasApis: boolean;
  displayMode?: string;
  navigatorStandalone?: boolean;
}): PushSupportKind {
  if (!input.hasApis) {
    if (
      isIosDevice(input.userAgent) &&
      !isStandaloneDisplayMode(input.displayMode, input.navigatorStandalone)
    ) {
      return "ios_needs_install";
    }
    return "unsupported";
  }
  return "supported";
}

export function permissionToDisplayStatus(
  permission: NotificationPermission | "unsupported",
  deviceSubscribed: boolean,
  support: PushSupportKind
): PushDisplayStatus {
  if (support === "unsupported") return "unsupported";
  if (support === "ios_needs_install") return "ios_needs_install";
  if (permission === "denied") return "blocked";
  if (deviceSubscribed && permission === "granted") return "active";
  return "off";
}

export function shouldShowPushOnboarding(input: {
  support: PushSupportKind;
  permission: NotificationPermission;
  deviceSubscribed: boolean;
  dismissed: boolean;
  isMobileViewport: boolean;
}): boolean {
  if (!input.isMobileViewport) return false;
  if (input.support !== "supported") return false;
  if (input.permission === "denied") return false;
  if (input.deviceSubscribed) return false;
  if (input.dismissed) return false;
  // Show when permission not yet granted, or granted but registration did not persist.
  return true;
}

export const PUSH_ONBOARDING_DISMISS_KEY = "rematcher_push_onboarding_dismissed";

export function pushOnboardingStorageKey(userId: string): string {
  return `${PUSH_ONBOARDING_DISMISS_KEY}:${userId}`;
}

/**
 * Canonical actionable deep links — single navigation model for Push, Activity, Agent.
 * Deep links identify objects; server state determines allowed actions.
 */
export const SAFE_DEEP_LINK_PREFIXES = [
  "/home",
  "/matches",
  "/opportunities",
  "/inventory",
  "/demand",
  "/validations",
  "/reveals/",
  "/activity",
  "/account",
  "/privacy-ai",
  "/onboarding",
  "/pending-approval",
  "/verify-email",
  "/admin",
] as const;

export type DeepLinkKind =
  | "match"
  | "opportunity"
  | "vehicle"
  | "vehicle_enrich"
  | "validation"
  | "reveal"
  | "demand"
  | "activity"
  | "home";

/** Reject open redirects and protocol-relative URLs. */
export function isSafeInternalPath(path: string | null | undefined): boolean {
  if (!path || typeof path !== "string") return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.includes("://")) return false;
  if (trimmed.includes("\\")) return false;
  if (/\s/.test(trimmed)) return false;
  if (trimmed.length > 500) return false;

  const pathOnly = trimmed.split("?")[0]!.split("#")[0]!;
  return SAFE_DEEP_LINK_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(prefix)
  );
}

/** Sanitize callback/return destination; null if unsafe. */
export function sanitizeReturnPath(
  path: string | null | undefined
): string | null {
  if (!path) return null;
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  return isSafeInternalPath(decoded) ? decoded : null;
}

export function deepLinkForMatch(matchId: string): string {
  return `/matches?focus=${encodeURIComponent(matchId)}`;
}

export function deepLinkForOpportunity(opportunityId: string): string {
  return `/opportunities?focus=${encodeURIComponent(opportunityId)}`;
}

export function deepLinkForVehicle(
  vehicleId: string,
  opts?: { enrich?: boolean }
): string {
  const q = new URLSearchParams({ focus: vehicleId });
  if (opts?.enrich) q.set("enrich", "1");
  return `/inventory?${q.toString()}`;
}

export function deepLinkForValidation(validationId: string): string {
  return `/validations?focus=${encodeURIComponent(validationId)}`;
}

export function deepLinkForReveal(revealId: string): string {
  return `/reveals/${encodeURIComponent(revealId)}`;
}

export function deepLinkForDemand(demandId: string): string {
  return `/demand?edit=${encodeURIComponent(demandId)}`;
}

export function parseFocusId(
  searchParams: URLSearchParams | { get(name: string): string | null }
): string | null {
  const focus = searchParams.get("focus");
  if (!focus || focus.length > 80) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(focus)) return null;
  return focus;
}

export function parseEnrichFlag(
  searchParams: URLSearchParams | { get(name: string): string | null }
): boolean {
  return searchParams.get("enrich") === "1";
}

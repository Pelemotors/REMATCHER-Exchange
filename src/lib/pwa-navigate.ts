/**
 * Sanitize Push / SW navigate targets for client-side router.push.
 * Reuses deep-link allowlist — never allow open redirects.
 */
import { isSafeInternalPath } from "@/lib/deep-links";

export function sanitizeClientNavigateUrl(
  raw: string | null | undefined,
  origin: string
): string | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const target = new URL(raw, origin);
    if (target.origin !== origin) return null;
    const pathWithQuery = `${target.pathname}${target.search}`;
    if (!isSafeInternalPath(pathWithQuery)) return null;
    return `${pathWithQuery}${target.hash}`;
  } catch {
    return null;
  }
}

/** Compare current location to a sanitized path (ignore hash). */
export function isSameClientDestination(
  currentPathname: string,
  currentSearch: string,
  targetPath: string
): boolean {
  try {
    const t = new URL(targetPath, "https://rematcher.local");
    return (
      currentPathname === t.pathname &&
      (currentSearch || "") === (t.search || "")
    );
  } catch {
    return false;
  }
}

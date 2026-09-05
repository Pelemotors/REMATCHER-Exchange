/**
 * TEST / INTERNAL account classification for analytics exclusion.
 * Do not scatter email checks — import from here.
 */
export const TEST_ACCOUNT_EMAILS = [
  "galsamama@gmail.com",
  "irasamama@gmail.com",
] as const;

const TEST_EMAIL_SET = new Set(
  TEST_ACCOUNT_EMAILS.map((e) => e.toLowerCase())
);

export function isTestAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  if (TEST_EMAIL_SET.has(normalized)) return true;
  if (normalized.endsWith("@rematcher-exchange.test")) return true;
  if (normalized.startsWith("qa-") && normalized.endsWith(".test")) return true;
  return false;
}

/** Pilot cohort tag values (analytics only — never authorization). */
export const DEALER_COHORT = {
  PILOT: "PILOT",
  STANDARD: "STANDARD",
} as const;

export type DealerCohortValue =
  (typeof DEALER_COHORT)[keyof typeof DEALER_COHORT];

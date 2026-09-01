/** App URLs and operational config — canonical production domain for links/emails */

/** LOCKED — user-facing production domain (PRD / production-qa.mdc) */
export const CANONICAL_APP_URL = "https://exchange.rematcher.co.il";

export const APP_CONFIG = {
  url:
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    CANONICAL_APP_URL,
  adminApprovalEmail:
    process.env.REMATCHER_ADMIN_APPROVAL_EMAIL ?? "galsamama@gmail.com",
  emailFrom:
    process.env.EMAIL_FROM ?? "REMATCHER Exchange <exchange@rematcher.co.il>",
  /** Verified sender mailbox — same domain as From; used for Reply-To */
  emailReplyTo:
    process.env.EMAIL_REPLY_TO ?? "exchange@rematcher.co.il",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
} as const;

/**
 * Base URL for transactional email links.
 * Production always uses the canonical domain — never vercel.app deployment aliases.
 */
export function getTransactionalEmailBaseUrl(): string {
  if (process.env.NODE_ENV === "production") {
    return CANONICAL_APP_URL;
  }
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv && !fromEnv.includes("vercel.app")) {
    return fromEnv;
  }
  return process.env.AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export function isEmailConfigured(): boolean {
  return Boolean(APP_CONFIG.resendApiKey);
}

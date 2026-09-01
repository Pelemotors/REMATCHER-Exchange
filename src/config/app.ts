/** App URLs and operational config — canonical production domain for links/emails */

export const APP_CONFIG = {
  url:
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://exchange.rematcher.co.il",
  adminApprovalEmail:
    process.env.REMATCHER_ADMIN_APPROVAL_EMAIL ?? "galsamama@gmail.com",
  emailFrom:
    process.env.EMAIL_FROM ?? "REMATCHER Exchange <exchange@rematcher.co.il>",
  /** Verified sender mailbox — same domain as From; used for Reply-To */
  emailReplyTo:
    process.env.EMAIL_REPLY_TO ?? "exchange@rematcher.co.il",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
} as const;

export function isEmailConfigured(): boolean {
  return Boolean(APP_CONFIG.resendApiKey);
}

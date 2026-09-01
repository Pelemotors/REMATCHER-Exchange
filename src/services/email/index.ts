import { Resend } from "resend";
import { APP_CONFIG, isEmailConfigured } from "@/config/app";
import { BRAND } from "@/config/brand";
import { logAppEvent } from "@/services/notifications";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!isEmailConfigured()) return null;
  if (!resendClient) {
    resendClient = new Resend(APP_CONFIG.resendApiKey);
  }
  return resendClient;
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  eventType?: string;
  dealerId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const client = getResend();
  if (!client) {
    await logAppEvent({
      eventType: "email_send_skipped",
      dealerId: params.dealerId,
      metadata: { reason: "not_configured", subject: params.subject },
    });
    return { ok: false, error: "not_configured" };
  }

  try {
    const { error } = await client.emails.send({
      from: APP_CONFIG.emailFrom,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      await logAppEvent({
        eventType: "email_send_failed",
        dealerId: params.dealerId,
        metadata: { subject: params.subject, error: error.message },
      });
      return { ok: false, error: error.message };
    }

    if (params.eventType) {
      await logAppEvent({
        eventType: params.eventType,
        dealerId: params.dealerId,
        metadata: { subject: params.subject },
      });
    }

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    await logAppEvent({
      eventType: "email_send_failed",
      dealerId: params.dealerId,
      metadata: { subject: params.subject, error: message },
    });
    return { ok: false, error: message };
  }
}

function emailLayout(content: string): string {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"></head>
<body style="font-family:Heebo,Arial,sans-serif;background:#F6F8FA;padding:24px;color:#111827;">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E2E7EC;border-radius:12px;padding:32px;">
<div style="font-weight:700;font-size:18px;margin-bottom:8px;">${BRAND.product}</div>
${content}
</div></body></html>`;
}

function ctaButton(href: string, label: string): string {
  return `<p style="margin-top:24px;"><a href="${href}" style="display:inline-block;background:#18C37E;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">${label}</a></p>`;
}

export async function sendUserVerificationEmail(params: {
  to: string;
  name: string;
  token: string;
}) {
  const link = `${APP_CONFIG.url}/verify-email?token=${encodeURIComponent(params.token)}`;
  return sendEmail({
    to: params.to,
    subject: `אימות כתובת אימייל · ${BRAND.product}`,
    eventType: "user_verification_email_sent",
    html: emailLayout(`
<p>שלום ${params.name},</p>
<p>תודה שנרשמת ל-${BRAND.product}. לחץ לאימות כתובת האימייל שלך:</p>
${ctaButton(link, "אימות אימייל")}
<p style="margin-top:16px;font-size:13px;color:#5F6B7A;">הקישור תקף ל-48 שעות.</p>
`),
  });
}

export async function sendAdminDealerPendingEmail(params: {
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  city?: string | null;
  region?: string | null;
  businessId?: string | null;
  dealerId: string;
  signedUpAt: Date;
}) {
  const reviewUrl = `${APP_CONFIG.url}/admin/dealers/${params.dealerId}`;
  const location = [params.city, params.region].filter(Boolean).join(" · ") || "—";

  return sendEmail({
    to: APP_CONFIG.adminApprovalEmail,
    subject: `סוחר חדש ממתין לאישור · ${BRAND.product}`,
    eventType: "admin_approval_email_sent",
    dealerId: params.dealerId,
    html: emailLayout(`
<p>נרשם סוחר חדש ל-${BRAND.product} וממתין לאישור.</p>
<table style="width:100%;margin-top:16px;font-size:14px;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#5F6B7A;">שם העסק</td><td><strong>${params.businessName}</strong></td></tr>
<tr><td style="padding:6px 0;color:#5F6B7A;">איש קשר</td><td>${params.contactName}</td></tr>
<tr><td style="padding:6px 0;color:#5F6B7A;">טלפון</td><td dir="ltr">${params.phone}</td></tr>
<tr><td style="padding:6px 0;color:#5F6B7A;">אימייל</td><td dir="ltr">${params.email}</td></tr>
<tr><td style="padding:6px 0;color:#5F6B7A;">מיקום</td><td>${location}</td></tr>
${params.businessId ? `<tr><td style="padding:6px 0;color:#5F6B7A;">ח.פ./עוסק</td><td>${params.businessId}</td></tr>` : ""}
<tr><td style="padding:6px 0;color:#5F6B7A;">תאריך הרשמה</td><td>${params.signedUpAt.toLocaleString("he-IL")}</td></tr>
</table>
${ctaButton(reviewUrl, "בדיקת הסוחר")}
<p style="margin-top:16px;font-size:13px;color:#5F6B7A;">האישור מתבצע רק לאחר כניסה למערכת — לא דרך קישור ישיר.</p>
`),
  });
}

export async function sendDealerApprovedEmail(params: {
  to: string;
  name: string;
}) {
  const loginUrl = `${APP_CONFIG.url}/login`;
  return sendEmail({
    to: params.to,
    subject: `החשבון שלך אושר · ${BRAND.product}`,
    eventType: "dealer_approved_email_sent",
    html: emailLayout(`
<p>שלום ${params.name},</p>
<p>ההצטרפות שלך ל-${BRAND.product} אושרה. אפשר להתחיל להשתמש ברשת.</p>
${ctaButton(loginUrl, "כניסה ל-Exchange")}
`),
  });
}

export async function sendDealerRejectedEmail(params: {
  to: string;
  name: string;
}) {
  return sendEmail({
    to: params.to,
    subject: `עדכון לגבי הבקשה שלך · ${BRAND.product}`,
    eventType: "dealer_rejected_email_sent",
    html: emailLayout(`
<p>שלום ${params.name},</p>
<p>תודה על פנייתך ל-${BRAND.product}. לאחר בדיקה, לא ניתן לאשר את הבקשה כרגע.</p>
<p style="font-size:14px;color:#5F6B7A;">לשאלות נוספות ניתן לפנות אלינו.</p>
`),
  });
}

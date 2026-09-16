import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { getAdminFunnelMetrics } from "@/services/admin/control-center";
import { requireAdminPageSession } from "@/lib/admin-page-gate";
import { isEmailConfigured } from "@/config/app";
import { isMonetizationEnabled } from "@/services/product-policy";

export default async function AdminSystemPage() {
  if (!(await requireAdminPageSession())) return null;

  const [funnelToday, aiFail24h, pushSubs, campaigns, dbOk, monetization] =
    await Promise.all([
      getAdminFunnelMetrics(1),
      prisma.aiOperationLog.count({
        where: {
          success: false,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.pushSubscription.count(),
      prisma.pushCampaign.count(),
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      isMonetizationEnabled(),
    ]);

  const sha =
    process.env.GIT_COMMIT?.slice(0, 12) ??
    process.env.GIT_COMMIT_REF ??
    "unknown";

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">מערכת</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        בריאות פלטפורמה — בלי סודות או מחרוזות חיבור
      </p>

      <Surface depth="raised" className="mb-8 grid gap-2 p-4 text-sm md:grid-cols-2">
        <p>
          SHA: <span dir="ltr">{sha}</span>
        </p>
        <p>סביבה: {process.env.NODE_ENV ?? "unknown"}</p>
        <p>DB: {dbOk ? "תקין" : "שגיאה"}</p>
        <p>Resend: {isEmailConfigured() ? "מוגדר" : "חסר"}</p>
        <p>מונטיזציה: {monetization ? "ON" : "OFF"}</p>
        <p>עיבוד: {aiFail24h === 0 ? "אין כשלי AI ב-24ש" : `${aiFail24h} כשלי AI`}</p>
      </Surface>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Surface depth="raised" className="p-3 text-center">
          <p className="text-xl font-bold text-v2-warm">{aiFail24h}</p>
          <p className="text-xs text-v2-text-secondary">כשלי AI (24ש)</p>
        </Surface>
        <Surface depth="raised" className="p-3 text-center">
          <p className="text-xl font-bold text-v2-warm">{pushSubs}</p>
          <p className="text-xs text-v2-text-secondary">מכשירי Push</p>
        </Surface>
        <Surface depth="raised" className="p-3 text-center">
          <p className="text-xl font-bold text-v2-warm">{campaigns}</p>
          <p className="text-xs text-v2-text-secondary">קמפיינים</p>
        </Surface>
        <Surface depth="raised" className="p-3 text-center">
          <p className="text-xl font-bold text-v2-warm">{funnelToday.reveals}</p>
          <p className="text-xs text-v2-text-secondary">חיבורים היום</p>
        </Surface>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/admin/communications">
          <Surface depth="raised" className="p-4 transition hover:opacity-95">
            <p className="font-semibold text-v2-text-primary">תקשורת Push</p>
            <p className="mt-1 text-sm text-v2-text-secondary">
              שליחת הודעות לקהלים וקמפיינים
            </p>
          </Surface>
        </Link>
        <Link href="/admin/intelligence">
          <Surface depth="raised" className="p-4 transition hover:opacity-95">
            <p className="font-semibold text-v2-text-primary">Product Intelligence</p>
            <p className="mt-1 text-sm text-v2-text-secondary">
              מדדי מוצר והפעלה
            </p>
          </Surface>
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { getAdminFunnelMetrics } from "@/services/admin/control-center";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminSystemPage() {
  if (!(await requireAdminPageSession())) return null;

  const [funnelToday, aiFail24h, pushSubs, campaigns] = await Promise.all([
    getAdminFunnelMetrics(1),
    prisma.aiOperationLog.count({
      where: {
        success: false,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.pushSubscription.count(),
    prisma.pushCampaign.count(),
  ]);

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">מערכת</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        תפעול פלטפורמה, תקשורת ומודיעין מוצר
      </p>

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

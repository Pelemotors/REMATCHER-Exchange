import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { AdminCreateDealer } from "@/components/admin/admin-create-dealer";
import { countPendingDealersForApproval, getPendingDealers } from "@/services/admin/dealer-verification";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminDealersPage() {
  if (!(await requireAdminPageSession())) return null;

  const [count, dealers, all] = await Promise.all([
    countPendingDealersForApproval(),
    getPendingDealers(),
    prisma.dealer.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        businessName: true,
        verificationStatus: true,
        isActive: true,
        city: true,
        catalog: { select: { slug: true, status: true } },
        entitlement: { select: { status: true } },
        _count: {
          select: {
            vehicles: true,
            demands: true,
            customers: true,
            intakeBatches: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-v2-warm">סוחרים</h1>
          <p className="text-sm text-v2-text-secondary">
            {count} בקשות פתוחות · {all.length} סוחרים
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AdminCreateDealer />
          <Link href="/admin" className="text-sm text-v2-signal">
            סקירה
          </Link>
        </div>
      </div>

      <h2 className="mb-3 font-semibold text-v2-text-primary">ממתינים לאישור</h2>
      {dealers.length === 0 ? (
        <Surface depth="raised" className="mb-8 p-6 text-center text-v2-text-secondary">
          אין סוחרים שממתינים לאישור
        </Surface>
      ) : (
        <div className="mb-8 space-y-3">
          {dealers.map((d) => {
            const owner = d.memberships[0]?.user;
            return (
              <Link key={d.id} href={`/admin/dealers/${d.id}`} className="block">
                <Surface depth="raised" className="p-4 transition-opacity hover:opacity-95">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-v2-text-primary">{d.businessName}</p>
                      <p className="text-sm text-v2-text-secondary">
                        {d.contactName}
                        {d.city ? ` · ${d.city}` : ""}
                      </p>
                      <p
                        className={`mt-1 text-xs ${
                          owner?.emailVerifiedAt ? "text-v2-text-muted" : "text-amber-400"
                        }`}
                      >
                        {owner?.email ?? "אין מייל בעלים"} ·{" "}
                        {owner?.emailVerifiedAt ? "מייל מאומת" : "מייל לא אומת"}
                      </p>
                    </div>
                    <span className="text-xs text-v2-text-muted">
                      {new Date(d.createdAt).toLocaleDateString("he-IL")}
                    </span>
                  </div>
                </Surface>
              </Link>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 font-semibold text-v2-text-primary">כל הסוחרים</h2>
      <div className="space-y-2">
        {all.map((d) => (
          <Link key={d.id} href={`/admin/dealers/${d.id}`} className="block">
            <Surface depth="raised" className="p-4 transition-opacity hover:opacity-95">
              <p className="font-medium text-v2-text-primary">{d.businessName}</p>
              <p className="mt-1 text-sm text-v2-text-secondary">
                {d.verificationStatus}
                {d.isActive ? "" : " · מושעה"}
                {d.city ? ` · ${d.city}` : ""}
                {" · "}
                {d._count.vehicles} רכבים · {d._count.demands} חיפושים ·{" "}
                {d._count.customers} לקוחות · {d._count.intakeBatches} Intake
                {d.catalog
                  ? ` · קטלוג ${d.catalog.slug} (${d.catalog.status})`
                  : " · בלי קטלוג"}
                {d.entitlement ? ` · entitlement ${d.entitlement.status}` : ""}
              </p>
            </Surface>
          </Link>
        ))}
      </div>
    </div>
  );
}

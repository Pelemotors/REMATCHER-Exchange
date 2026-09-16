import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminOpportunitiesPage() {
  if (!(await requireAdminPageSession())) return null;
  const [rows, sellerRows] = await Promise.all([
    prisma.dealerOpportunity.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        createdAt: true,
        dealer: { select: { id: true, businessName: true } },
      },
    }),
    prisma.sellerOpportunity.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        status: true,
        createdAt: true,
        vehicle: {
          select: {
            make: true,
            model: true,
            dealer: { select: { id: true, businessName: true } },
          },
        },
      },
    }),
  ]);

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">הזדמנויות</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        מנוע הזדמנויות ו-Seller Opportunity אחרי Interest — בלי זהויות צד שני
      </p>

      <h2 className="mb-3 font-semibold text-v2-text-primary">Dealer Opportunity</h2>
      <div className="mb-8 space-y-2">
        {rows.length === 0 && (
          <Surface depth="raised" className="p-6 text-sm text-v2-text-muted">
            אין הזדמנויות מנוע
          </Surface>
        )}
        {rows.map((o) => (
          <Surface key={o.id} depth="raised" className="p-4 text-sm">
            <p className="font-medium text-v2-text-primary">{o.title}</p>
            <p className="mt-1 text-v2-text-secondary">
              <Link href={`/admin/dealers/${o.dealer.id}`} className="text-v2-signal">
                {o.dealer.businessName}
              </Link>
              {" · "}
              {o.type} · {o.status}
            </p>
          </Surface>
        ))}
      </div>

      <h2 className="mb-3 font-semibold text-v2-text-primary">Seller Opportunity</h2>
      <div className="space-y-2">
        {sellerRows.length === 0 && (
          <Surface depth="raised" className="p-6 text-sm text-v2-text-muted">
            אין הזדמנויות מוכר פתוחות
          </Surface>
        )}
        {sellerRows.map((o) => (
          <Surface key={o.id} depth="raised" className="p-4 text-sm">
            <p className="font-medium text-v2-text-primary">
              {[o.vehicle.make, o.vehicle.model].filter(Boolean).join(" ") || "הזדמנות מוכר"}
            </p>
            <p className="mt-1 text-v2-text-secondary">
              <Link
                href={`/admin/dealers/${o.vehicle.dealer.id}`}
                className="text-v2-signal"
              >
                {o.vehicle.dealer.businessName}
              </Link>
              {" · "}
              {o.status} · {o.createdAt.toLocaleString("he-IL")}
            </p>
          </Surface>
        ))}
      </div>
    </div>
  );
}

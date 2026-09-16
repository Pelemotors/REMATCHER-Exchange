import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminDemandsPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  if (!(await requireAdminPageSession())) return null;
  const { focus } = await searchParams;
  const rows = await prisma.demand.findMany({
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: {
      id: true,
      status: true,
      networkVisibility: true,
      rawText: true,
      updatedAt: true,
      dealer: { select: { id: true, businessName: true } },
      customer: { select: { name: true } },
      _count: { select: { candidateMatches: true } },
    },
  });

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">חיפושים</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        סטטוס, נראות רשת, והתאמות — בלי זהויות צד שני
      </p>
      <div className="space-y-2">
        {rows.length === 0 && (
          <Surface depth="raised" className="p-6 text-sm text-v2-text-muted">
            אין חיפושים
          </Surface>
        )}
        {rows.map((d) => (
          <Surface
            key={d.id}
            id={d.id}
            depth="raised"
            className={`p-4 text-sm ${focus === d.id ? "ring-1 ring-[#D4AF3B]" : ""}`}
          >
            <p className="font-medium text-v2-text-primary">
              {(d.rawText || "").slice(0, 120) || "חיפוש"}
            </p>
            <p className="mt-1 text-v2-text-secondary">
              <Link href={`/admin/dealers/${d.dealer.id}`} className="text-v2-signal">
                {d.dealer.businessName}
              </Link>
              {d.customer?.name ? ` · לקוח: ${d.customer.name}` : ""} · {d.status} · רשת:{" "}
              {d.networkVisibility} · {d._count.candidateMatches} התאמות
            </p>
          </Surface>
        ))}
      </div>
    </div>
  );
}

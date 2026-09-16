import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  if (!(await requireAdminPageSession())) return null;
  const { focus } = await searchParams;
  const rows = await prisma.customer.findMany({
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: {
      id: true,
      name: true,
      rawPhone: true,
      status: true,
      createdAt: true,
      dealer: { select: { id: true, businessName: true } },
      _count: { select: { demands: true } },
    },
  });

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">לקוחות</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        פיקוח תפעולי — לא CRM של הסוחר
      </p>
      <div className="space-y-2">
        {rows.length === 0 && (
          <Surface depth="raised" className="p-6 text-sm text-v2-text-muted">
            אין לקוחות במערכת
          </Surface>
        )}
        {rows.map((c) => (
          <Surface
            key={c.id}
            id={c.id}
            depth="raised"
            className={`flex justify-between gap-3 p-4 text-sm ${focus === c.id ? "ring-1 ring-[#D4AF3B]" : ""}`}
          >
            <div>
              <p className="font-medium text-v2-text-primary">{c.name || "ללא שם"}</p>
              <p className="text-v2-text-secondary">
                <Link href={`/admin/dealers/${c.dealer.id}`} className="text-v2-signal">
                  {c.dealer.businessName}
                </Link>
                {c.rawPhone ? ` · ${c.rawPhone}` : ""} · {c._count.demands} חיפושים
              </p>
            </div>
            <span className="text-xs text-v2-text-muted">{c.status}</span>
          </Surface>
        ))}
      </div>
    </div>
  );
}

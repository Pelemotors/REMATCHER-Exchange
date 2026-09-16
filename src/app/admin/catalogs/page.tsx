import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminCatalogsPage() {
  if (!(await requireAdminPageSession())) return null;

  const catalogs = await prisma.dealerCatalog.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      dealer: { select: { id: true, businessName: true, isActive: true } },
      _count: {
        select: {
          publications: { where: { isActive: true } },
        },
      },
    },
  });

  const enabledEmpty = catalogs.filter(
    (c) => c.status === "ENABLED" && c._count.publications === 0
  ).length;

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">קטלוגים ציבוריים</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        {catalogs.length} קטלוגים · {enabledEmpty} פעילים ללא רכבים מפורסמים
      </p>

      <div className="space-y-3">
        {catalogs.length === 0 && (
          <Surface depth="raised" className="p-6 text-sm text-v2-text-muted">
            עדיין אין קטלוגים. סוחר יכול ליצור קטלוג אופציונלי מתוך האפליקציה.
          </Surface>
        )}
        {catalogs.map((c) => (
          <Surface
            key={c.id}
            depth="raised"
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div>
              <p className="font-semibold text-v2-text-primary">
                {c.displayName}
              </p>
              <p className="text-sm text-v2-text-secondary" dir="ltr">
                {c.slug}.rematcher.co.il
              </p>
              <p className="mt-1 text-xs text-v2-text-muted">
                {c.dealer.businessName} · {c.status} ·{" "}
                {c._count.publications} רכבים מפורסמים
                {!c.dealer.isActive ? " · סוחר מושעה" : ""}
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              <Link
                href={`/admin/dealers/${c.dealer.id}`}
                className="rounded-lg border border-white/10 px-3 py-2 text-v2-text-primary"
              >
                סוחר
              </Link>
              <a
                href={`https://${c.slug}.rematcher.co.il`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/10 px-3 py-2 text-v2-signal"
                dir="ltr"
              >
                פתח
              </a>
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";
import { formatCurrency } from "@/lib/utils";
import { simulateCatalogFinance } from "@/services/catalog/finance-rules";

export default async function AdminVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  if (!(await requireAdminPageSession())) return null;
  const { focus } = await searchParams;
  const rows = await prisma.vehicle.findMany({
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      mileage: true,
      status: true,
      dealerRelationship: true,
      visibility: true,
      mediaReady: true,
      b2bPrice: true,
      retailPrice: true,
      dealer: { select: { id: true, businessName: true } },
      catalogPublications: {
        where: { isActive: true },
        take: 1,
        select: {
          showMonthlyFinance: true,
          catalog: { select: { slug: true } },
        },
      },
    },
  });

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">רכבים</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        קשר לסוחר ≠ פרסום לרשת ≠ פרסום לקטלוג ציבורי · מחיר סוחר אינו ציבורי
      </p>
      <div className="space-y-2">
        {rows.length === 0 && (
          <Surface depth="raised" className="p-6 text-sm text-v2-text-muted">
            אין רכבים
          </Surface>
        )}
        {rows.map((v) => {
          const pub = v.catalogPublications[0];
          const quote = simulateCatalogFinance({
            enabled: Boolean(pub?.showMonthlyFinance),
            retailPrice: v.retailPrice,
            year: v.year,
            mileage: v.mileage,
          });
          return (
            <Surface
              key={v.id}
              id={v.id}
              depth="raised"
              className={`p-4 text-sm ${focus === v.id ? "ring-1 ring-[#D4AF3B]" : ""}`}
            >
              <p className="font-medium text-v2-text-primary">
                {[v.make, v.model, v.year].filter(Boolean).join(" ") || "רכב"}
              </p>
              <p className="mt-1 text-v2-text-secondary">
                <Link href={`/admin/dealers/${v.dealer.id}`} className="text-v2-signal">
                  {v.dealer.businessName}
                </Link>
                {" · "}קשר: {v.dealerRelationship}
                {" · "}רשת: {v.visibility}
                {" · "}קטלוג: {pub ? pub.catalog.slug : "לא מפורסם"}
                {" · "}
                {v.status}
                {v.mediaReady ? " · מדיה מוכנה" : " · בלי מדיה"}
              </p>
              <p className="mt-1 text-xs text-v2-text-muted">
                מחיר לסוחר: {v.b2bPrice != null ? formatCurrency(v.b2bPrice) : "—"}
                {" · "}מחיר ללקוח:{" "}
                {v.retailPrice != null ? formatCurrency(v.retailPrice) : "—"}
                {" · "}מימון בקטלוג: {pub?.showMonthlyFinance ? "מופעל" : "כבוי"}
                {quote
                  ? ` · ${formatCurrency(quote.monthlyIls)}/חודש · ${quote.termMonths} תשלומים · ${(quote.annualRate * 100).toFixed(1)}% ${quote.conditionClass}`
                  : ""}
              </p>
            </Surface>
          );
        })}
      </div>
    </div>
  );
}

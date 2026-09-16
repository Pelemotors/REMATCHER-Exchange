import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminMatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  if (!(await requireAdminPageSession())) return null;
  const { focus } = await searchParams;
  const rows = await prisma.candidateMatch.findMany({
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: {
      id: true,
      status: true,
      scoreBand: true,
      resolutionState: true,
      demand: {
        select: {
          dealer: { select: { businessName: true } },
        },
      },
      vehicle: {
        select: {
          make: true,
          model: true,
          dealer: { select: { businessName: true } },
        },
      },
    },
  });

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">התאמות</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        אבחון תפעולי בלי לחשוף זהויות מעבר לשמות סוחרים
      </p>
      <div className="space-y-2">
        {rows.length === 0 && (
          <Surface depth="raised" className="p-6 text-sm text-v2-text-muted">
            אין התאמות
          </Surface>
        )}
        {rows.map((m) => (
          <Surface
            key={m.id}
            id={m.id}
            depth="raised"
            className={`p-4 text-sm ${focus === m.id ? "ring-1 ring-[#D4AF3B]" : ""}`}
          >
            <p className="font-medium text-v2-text-primary">
              {[m.vehicle.make, m.vehicle.model].filter(Boolean).join(" ") || "התאמה"}
            </p>
            <p className="mt-1 text-v2-text-secondary">
              ביקוש: {m.demand.dealer.businessName} · היצע:{" "}
              {m.vehicle.dealer.businessName} · {m.status}
              {m.scoreBand ? ` · ${m.scoreBand}` : ""} · {m.resolutionState}
            </p>
          </Surface>
        ))}
      </div>
    </div>
  );
}

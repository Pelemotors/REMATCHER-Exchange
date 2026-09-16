import { prisma } from "@/lib/prisma";
import { Surface } from "@/components/ui/brand-v2";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminInterestPage() {
  if (!(await requireAdminPageSession())) return null;
  const [interests, mutuals, reveals] = await Promise.all([
    prisma.buyerInterest.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        status: true,
        createdAt: true,
        dealer: { select: { businessName: true } },
      },
    }),
    prisma.mutualInterest.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        createdAt: true,
        reveal: { select: { id: true, revealedAt: true } },
      },
    }),
    prisma.reveal.findMany({
      orderBy: { revealedAt: "desc" },
      take: 40,
      select: {
        id: true,
        revealedAt: true,
        buyerDealer: { select: { businessName: true } },
        sellerDealer: { select: { businessName: true } },
        outcome: { select: { status: true } },
      },
    }),
  ]);

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">Interest / Reveal</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        עניין, עניין הדדי וחשיפה — אבחון בלי לפרוץ פרטיות
      </p>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold text-v2-text-primary">Interest</h2>
        <div className="space-y-2">
          {interests.length === 0 && (
            <p className="text-sm text-v2-text-muted">אין רשומות</p>
          )}
          {interests.map((i) => (
            <Surface key={i.id} depth="raised" className="p-3 text-sm">
              {i.dealer.businessName} · {i.status} ·{" "}
              {i.createdAt.toLocaleString("he-IL")}
            </Surface>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold text-v2-text-primary">Mutual Interest</h2>
        <div className="space-y-2">
          {mutuals.length === 0 && (
            <p className="text-sm text-v2-text-muted">אין רשומות</p>
          )}
          {mutuals.map((m) => (
            <Surface key={m.id} depth="raised" className="p-3 text-sm">
              {m.id.slice(0, 8)} · {m.createdAt.toLocaleString("he-IL")} · Reveal:{" "}
              {m.reveal ? "כן" : "לא"}
            </Surface>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-v2-text-primary">Reveal</h2>
        <div className="space-y-2">
          {reveals.length === 0 && (
            <p className="text-sm text-v2-text-muted">אין רשומות</p>
          )}
          {reveals.map((r) => (
            <Surface key={r.id} depth="raised" className="p-3 text-sm">
              {r.buyerDealer.businessName} ↔ {r.sellerDealer.businessName} ·{" "}
              {r.revealedAt.toLocaleString("he-IL")} · תוצאה:{" "}
              {r.outcome?.status ?? "אין"}
            </Surface>
          ))}
        </div>
      </section>
    </div>
  );
}

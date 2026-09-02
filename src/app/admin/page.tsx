import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { AdminTestPushButton } from "@/components/admin/admin-test-push";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";
import { verificationLabel } from "@/lib/brand-copy";
import {
  getAdminAttentionItems,
  getAdminFunnelMetrics,
} from "@/services/admin/control-center";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return null;
  }

  const [attention, funnel7d, funnel30d, funnelToday] = await Promise.all([
    getAdminAttentionItems(),
    getAdminFunnelMetrics(7),
    getAdminFunnelMetrics(30),
    getAdminFunnelMetrics(1),
  ]);

  const [
    dealers,
    verifiedDealers,
    activeInventory,
    activeDemands,
    pendingValidations,
    validatedMatches,
    opportunities,
    mutualInterests,
    reveals,
    outcomes,
    dealClosed,
    pushSubs,
    aiLogs,
    dealerList,
    revealsNoOutcome,
  ] = await Promise.all([
    prisma.dealer.count(),
    prisma.dealer.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.vehicle.count({ where: { status: "ACTIVE" } }),
    prisma.demand.count({ where: { status: "ACTIVE" } }),
    prisma.validationEvent.count({ where: { status: "PENDING" } }),
    prisma.candidateMatch.count({ where: { status: "VALIDATED" } }),
    prisma.sellerOpportunity.count({ where: { status: "OPEN" } }),
    prisma.mutualInterest.count(),
    prisma.reveal.count(),
    prisma.outcome.count(),
    prisma.outcome.count({ where: { status: "DEAL_CLOSED" } }),
    prisma.pushSubscription.count(),
    prisma.aiOperationLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.dealer.findMany({
      include: {
        _count: { select: { vehicles: true, demands: true } },
        commercial: true,
        onboardingState: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.reveal.count({
      where: {
        outcome: null,
        revealedAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const revealToDealPct =
    reveals > 0 ? Math.round((dealClosed / reveals) * 100) : null;

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">Control Center</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        האם ה-Exchange פעיל, מה קורה, ומה דורש טיפול
      </p>

      {attention.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 font-semibold text-v2-text-primary">דורש תשומת לב</h2>
          <div className="space-y-2">
            {attention.map((item) => (
              <Surface
                key={item.type}
                depth="raised"
                className={`flex items-center justify-between p-4 ${
                  item.severity === "high" ? "border border-v2-signal/30" : ""
                }`}
              >
                <span className="font-medium text-v2-text-primary">{item.label}</span>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-v2-surface-secondary px-3 py-1 text-sm font-bold text-v2-warm">
                    {item.count}
                  </span>
                  {item.href && (
                    <Link href={item.href} className="text-sm text-v2-signal">
                      פתח
                    </Link>
                  )}
                </div>
              </Surface>
            ))}
          </div>
        </section>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {[
          { label: "סוחרים", value: dealers },
          { label: "מאומתים", value: verifiedDealers },
          { label: "רכבים פעילים", value: activeInventory },
          { label: "חיפושים פעילים", value: activeDemands },
          { label: "אימותים ממתינים", value: pendingValidations },
          { label: "התאמות מאומתות", value: validatedMatches },
          { label: "הזדמנויות", value: opportunities },
          { label: "עניין הדדי", value: mutualInterests },
          { label: "חיבורים", value: reveals },
          { label: "תוצאות", value: outcomes },
          { label: "עסקאות", value: dealClosed },
          { label: "חיבורים ללא תוצאה", value: revealsNoOutcome },
          { label: "מכשירי Push", value: pushSubs },
        ].map((m) => (
          <Surface key={m.label} depth="raised" className="p-3 text-center">
            <p className="text-xl font-bold text-v2-warm">{m.value}</p>
            <p className="text-xs text-v2-text-secondary">{m.label}</p>
          </Surface>
        ))}
      </div>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-v2-text-primary">משפך — 7 / 30 יום / היום</h2>
        {[funnelToday, funnel7d, funnel30d].map((f) => (
          <Surface key={f.period} depth="raised" className="mb-3 flex flex-wrap items-center gap-2 p-4 text-sm text-v2-text-secondary">
            <span className="font-medium text-v2-text-primary">{f.period}</span>
            <span>מועמדים {f.candidates}</span>
            <span>→</span>
            <span>מאומתים {f.validatedMatches}</span>
            <span>→</span>
            <span>קונה {f.buyerInterested}</span>
            <span>→</span>
            <span>הזדמנות {f.opportunities}</span>
            <span>→</span>
            <span>מוכר {f.sellerInterested}</span>
            <span>→</span>
            <span>חיבור {f.reveals}</span>
            <span>→</span>
            <span>עסקה {f.dealClosed}</span>
            {f.revealToDealPct != null && (
              <span className="text-v2-text-muted">({f.revealToDealPct}% Reveal→Deal)</span>
            )}
          </Surface>
        ))}
        {revealToDealPct != null && (
          <p className="mt-2 text-sm text-v2-text-muted">
            Reveal → Deal (כל הזמנים): {revealToDealPct}%
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-v2-text-primary">בדיקת Push</h2>
        <Surface depth="raised" className="p-4">
          <AdminTestPushButton />
        </Surface>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-v2-text-primary">סוחרים — Dealer 360</h2>
        <div className="space-y-2">
          {dealerList.map((d) => (
            <Link key={d.id} href={`/admin/dealers/${d.id}`}>
              <Surface depth="raised" className="flex justify-between p-4 text-sm transition hover:opacity-95">
                <div>
                  <p className="font-medium text-v2-text-primary">{d.businessName}</p>
                  <p className="text-v2-text-secondary">
                    {verificationLabel(d.verificationStatus)} · {d._count.vehicles} רכבים ·{" "}
                    {d._count.demands} חיפושים
                    {d.onboardingState?.completedAt ? " · onboarding הושלם" : ""}
                    {!d.onboardingState?.completedAt &&
                    d._count.vehicles === 0 &&
                    d.verificationStatus === "VERIFIED"
                      ? " · ללא מלאי רכבים"
                      : ""}
                  </p>
                </div>
                <div className="text-left text-v2-text-muted">
                  {d.commercial
                    ? `${d.commercial.freeRevealUsed}/${d.commercial.freeRevealAllowance} חיבורים`
                    : "—"}
                </div>
              </Surface>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-semibold text-v2-text-primary">AI Operations</h2>
        <div className="space-y-1 text-sm">
          {aiLogs.map((log) => (
            <div
              key={log.id}
              className={`rounded-lg px-3 py-2 ${log.success ? "bg-success-soft" : "bg-error-soft"}`}
            >
              {log.operation} · {log.model} · {log.success ? "OK" : log.errorMessage}
            </div>
          ))}
          {aiLogs.length === 0 && (
            <p className="text-v2-text-muted">אין פעולות AI עדיין</p>
          )}
        </div>
      </section>

      <ButtonV2 variant="secondary" href="/home" className="mt-8">
        חזרה לאפליקציה
      </ButtonV2>
    </div>
  );
}

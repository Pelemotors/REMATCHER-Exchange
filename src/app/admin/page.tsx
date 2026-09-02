import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { AdminTestPushButton } from "@/components/admin/admin-test-push";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";
import { verificationLabel } from "@/lib/brand-copy";
import { countPendingDealersForApproval } from "@/services/admin/dealer-verification";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return null;
  }

  const pendingDealerApprovals = await countPendingDealersForApproval();

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
    candidates,
    buyerInterested,
    sellerInterested,
    pushSubs,
    aiLogs,
    dealerList,
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
    prisma.candidateMatch.count(),
    prisma.buyerInterest.count({ where: { status: "INTERESTED" } }),
    prisma.sellerInterest.count({ where: { status: "INTERESTED" } }),
    prisma.pushSubscription.count(),
    prisma.aiOperationLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.dealer.findMany({
      include: {
        _count: {
          select: { vehicles: true, demands: true },
        },
        commercial: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const revealToDealPct =
    reveals > 0 ? Math.round((dealClosed / reveals) * 100) : null;

  const stuckValidations = await prisma.validationEvent.count({
    where: {
      status: "PENDING",
      requestedAt: { lte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
  });

  const stuckOpportunities = await prisma.sellerOpportunity.count({
    where: {
      status: "OPEN",
      createdAt: { lte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
  });

  return (
    <div className="container-app py-8">
      <h1 className="mb-2 text-2xl font-bold text-v2-warm">Pilot Control Room</h1>
      <p className="mb-6 text-sm text-v2-text-secondary">
        מעקב תפעולי — לא BI מתקדם
      </p>

      {pendingDealerApprovals > 0 && (
        <Link href="/admin/dealers">
          <Surface
            depth="raised"
            className="mb-6 flex items-center justify-between border border-v2-signal/30 p-4 transition-opacity hover:opacity-95"
          >
            <span className="font-semibold text-v2-text-primary">סוחרים שממתינים לאישור</span>
            <span className="rounded-full bg-v2-signal px-3 py-1 text-sm font-bold text-v2-warm">
              {pendingDealerApprovals}
            </span>
          </Surface>
        </Link>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {[
          { label: "סוחרים", value: dealers },
          { label: "מאומתים", value: verifiedDealers },
          { label: "מלאי פעיל", value: activeInventory },
          { label: "ביקושים פעילים", value: activeDemands },
          { label: "אימותים ממתינים", value: pendingValidations },
          { label: "התאמות מאומתות", value: validatedMatches },
          { label: "הזדמנויות", value: opportunities },
          { label: "עניין הדדי", value: mutualInterests },
          { label: "חיבורים", value: reveals },
          { label: "תוצאות", value: outcomes },
          { label: "עסקאות", value: dealClosed },
          { label: "מכשירי Push", value: pushSubs },
        ].map((m) => (
          <Surface key={m.label} depth="raised" className="p-3 text-center">
            <p className="text-xl font-bold text-v2-warm">{m.value}</p>
            <p className="text-xs text-v2-text-secondary">{m.label}</p>
          </Surface>
        ))}
      </div>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-v2-text-primary">משפך</h2>
        <Surface depth="raised" className="flex flex-wrap items-center gap-2 p-4 text-sm text-v2-text-secondary">
          <span>מועמדים {candidates}</span>
          <span>→</span>
          <span>מאומתים {validatedMatches}</span>
          <span>→</span>
          <span>קונה מעוניין {buyerInterested}</span>
          <span>→</span>
          <span>הזדמנות {opportunities}</span>
          <span>→</span>
          <span>מוכר מעוניין {sellerInterested}</span>
          <span>→</span>
          <span>חיבור {reveals}</span>
          <span>→</span>
          <span>עסקה {dealClosed}</span>
        </Surface>
        {revealToDealPct != null && (
          <p className="mt-2 text-sm text-v2-text-muted">
            Reveal → Deal: {revealToDealPct}% (היפותזת פיילוט פנימית)
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-v2-text-primary">תורים תקועים</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Surface depth="raised" className="p-4">
            <p className="font-medium text-v2-text-primary">אימותים &gt; 48 שעות</p>
            <p className="text-2xl font-bold text-v2-warm">{stuckValidations}</p>
          </Surface>
          <Surface depth="raised" className="p-4">
            <p className="font-medium text-v2-text-primary">הזדמנויות &gt; 48 שעות</p>
            <p className="text-2xl font-bold text-v2-warm">{stuckOpportunities}</p>
          </Surface>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-v2-text-primary">בדיקת Push</h2>
        <Surface depth="raised" className="p-4">
          <AdminTestPushButton />
        </Surface>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-v2-text-primary">סוחרים</h2>
        <div className="space-y-2">
          {dealerList.map((d) => (
            <Surface key={d.id} depth="raised" className="flex justify-between p-4 text-sm">
              <div>
                <p className="font-medium text-v2-text-primary">{d.businessName}</p>
                <p className="text-v2-text-secondary">
                  {verificationLabel(d.verificationStatus)} · {d._count.vehicles}{" "}
                  רכבים · {d._count.demands} ביקושים
                </p>
              </div>
              <div className="text-left text-v2-text-muted">
                {d.commercial
                  ? `${d.commercial.freeRevealUsed}/${d.commercial.freeRevealAllowance} חיבורים`
                  : "—"}
              </div>
            </Surface>
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

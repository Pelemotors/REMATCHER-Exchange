import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { AdminTestPushButton } from "@/components/admin/admin-test-push";
import { verificationLabel } from "@/lib/brand-copy";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return null;
  }

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
      <h1 className="mb-2 text-2xl font-bold">Pilot Control Room</h1>
      <p className="mb-6 text-sm text-text-secondary">
        מעקב תפעולי — לא BI מתקדם
      </p>

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
          <div key={m.label} className="card text-center">
            <p className="text-xl font-bold">{m.value}</p>
            <p className="text-xs text-text-secondary">{m.label}</p>
          </div>
        ))}
      </div>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold">משפך</h2>
        <div className="card flex flex-wrap items-center gap-2 text-sm">
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
        </div>
        {revealToDealPct != null && (
          <p className="mt-2 text-sm text-text-muted">
            Reveal → Deal: {revealToDealPct}% (היפותזת פיילוט פנימית)
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold">תורים תקועים</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card">
            <p className="font-medium">אימותים &gt; 48 שעות</p>
            <p className="text-2xl font-bold">{stuckValidations}</p>
          </div>
          <div className="card">
            <p className="font-medium">הזדמנויות &gt; 48 שעות</p>
            <p className="text-2xl font-bold">{stuckOpportunities}</p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold">בדיקת Push</h2>
        <div className="card">
          <AdminTestPushButton />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold">סוחרים</h2>
        <div className="space-y-2">
          {dealerList.map((d) => (
            <div key={d.id} className="card flex justify-between text-sm">
              <div>
                <p className="font-medium">{d.businessName}</p>
                <p className="text-text-secondary">
                  {verificationLabel(d.verificationStatus)} · {d._count.vehicles}{" "}
                  רכבים · {d._count.demands} ביקושים
                </p>
              </div>
              <div className="text-left text-text-muted">
                {d.commercial
                  ? `${d.commercial.freeRevealUsed}/${d.commercial.freeRevealAllowance} חיבורים`
                  : "—"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-semibold">AI Operations</h2>
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
            <p className="text-text-muted">אין פעולות AI עדיין</p>
          )}
        </div>
      </section>

      <Link href="/home" className="btn-secondary mt-8 inline-block">
        חזרה לאפליקציה
      </Link>
    </div>
  );
}

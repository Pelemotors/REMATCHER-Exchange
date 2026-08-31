import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { PageHeader } from "@/components/ui/common";
import { formatRelative } from "@/lib/utils";
import { getDealerUsageSummary } from "@/services/commercial/reveal-usage";
import { COPY, BRAND } from "@/config/brand";

export default async function HomePage() {
  const session = await auth();
  const dealerId = session!.user!.dealerId!;

  const [matches, opps, validations, demands, usage] = await Promise.all([
    prisma.candidateMatch.count({
      where: {
        demand: { dealerId },
        status: "VALIDATED",
        buyerInterests: { none: { dealerId } },
      },
    }),
    prisma.sellerOpportunity.count({
      where: {
        vehicle: { dealerId },
        status: "OPEN",
      },
    }),
    prisma.validationEvent.count({
      where: { dealerId, status: "PENDING" },
    }),
    prisma.demand.count({
      where: { dealerId, status: "ACTIVE" },
    }),
    getDealerUsageSummary(dealerId),
  ]);

  const connectionsUsed = usage.freeUsed + usage.monthlyUsed;
  const connectionsTotal = usage.freeAllowance + usage.monthlyAllowance;
  const connectionsLabel =
    usage.planSlug === "onboarding"
      ? COPY.connectionsRemaining(usage.freeUsed, usage.freeAllowance)
      : `${connectionsUsed} מתוך ${connectionsTotal} חיבורים החודש`;

  const recentNotifications = await prisma.notification.findMany({
    where: { userId: session!.user!.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const actionItems = [
    usage.actionRequired && {
      href: "/account",
      label: "נדרשת פעולה מסחרית",
      count: 1,
      urgent: true,
    },
    validations > 0 && {
      href: "/validations",
      label: "נדרש אימות",
      count: validations,
      urgent: true,
    },
    matches > 0 && {
      href: "/matches",
      label: "התאמות חדשות",
      count: matches,
    },
    opps > 0 && {
      href: "/opportunities",
      label: "יש עניין ברכבים שלך",
      count: opps,
    },
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    count: number;
    urgent?: boolean;
  }>;

  return (
    <div>
      <PageHeader
        title={`שלום, ${session!.user!.name}`}
        subtitle={session!.user!.dealerName ?? BRAND.product}
      />

      {actionItems.length > 0 ? (
        <section className="mb-6 space-y-3">
          <h3 className="text-sm font-semibold text-text-secondary">דורש פעולה</h3>
          {actionItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="card flex items-center justify-between hover:shadow-elevated"
            >
              <span className="font-medium">{item.label}</span>
              <span
                className={
                  item.urgent ? "badge-validation" : "badge-neutral"
                }
              >
                {item.count}
              </span>
            </Link>
          ))}
        </section>
      ) : (
        <div className="card mb-6 text-center text-sm text-text-secondary">
          אין פעולות דחופות — {BRAND.parent} עובד ברקע
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-text-primary">{demands}</p>
          <p className="text-xs text-text-secondary">חיפושים פעילים</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold">{matches}</p>
          <p className="text-xs text-text-secondary">התאמות חדשות</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold">{opps}</p>
          <p className="text-xs text-text-secondary">יש עניין ברכבים שלך</p>
        </div>
        <div className="card col-span-2 text-center md:col-span-1">
          <p className="text-lg font-bold text-text-primary">{connectionsLabel}</p>
          <p className="text-xs text-text-secondary">חיבורים</p>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">פעילות אחרונה</h3>
          <Link href="/activity" className="text-sm text-signal">
            הכל
          </Link>
        </div>
        <div className="space-y-2">
          {recentNotifications.map((n) => (
            <Link
              key={n.id}
              href={n.link ?? "/activity"}
              className="card block hover:shadow-elevated"
            >
              <p className="font-medium">{n.title}</p>
              <p className="text-sm text-text-secondary">{n.body}</p>
              <p className="mt-1 text-xs text-text-muted">
                {formatRelative(n.createdAt)}
              </p>
            </Link>
          ))}
          {recentNotifications.length === 0 && (
            <p className="text-sm text-text-muted">אין פעילות עדיין</p>
          )}
        </div>
      </section>
    </div>
  );
}

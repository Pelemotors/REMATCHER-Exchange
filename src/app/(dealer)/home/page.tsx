import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { PageHeader } from "@/components/ui/common";
import { HomeKpiGrid } from "@/components/home/home-kpi-grid";
import { formatRelative } from "@/lib/utils";
import { getDealerUsageSummary } from "@/services/commercial/reveal-usage";
import { BRAND } from "@/config/brand";
import {
  connectionsMonthlyUsedLabel,
  connectionsRemainingSecondary,
  connectionsUsedLabel,
} from "@/lib/brand-copy";

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

  const connectionsLabel =
    usage.planSlug === "onboarding"
      ? connectionsUsedLabel(usage.freeUsed, usage.freeAllowance)
      : connectionsMonthlyUsedLabel(usage.monthlyUsed, usage.monthlyAllowance);
  const connectionsSecondary =
    usage.planSlug === "onboarding"
      ? connectionsRemainingSecondary(usage.freeUsed, usage.freeAllowance, true)
      : connectionsRemainingSecondary(
          usage.monthlyUsed,
          usage.monthlyAllowance,
          false
        );

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

      <HomeKpiGrid
        activeDemands={demands}
        matches={matches}
        opportunities={opps}
        connectionsLabel={connectionsLabel}
        connectionsSecondary={connectionsSecondary}
      />

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

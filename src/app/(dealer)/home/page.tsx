import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HomeV2 } from "@/components/home/home-v2";
import { getDealerUsageSummary } from "@/services/commercial/reveal-usage";
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
    <HomeV2
      userName={session!.user!.name ?? ""}
      dealerName={session!.user!.dealerName ?? null}
      actionItems={actionItems}
      activeDemands={demands}
      matches={matches}
      opportunities={opps}
      connectionsLabel={connectionsLabel}
      connectionsSecondary={connectionsSecondary}
      notifications={recentNotifications}
    />
  );
}

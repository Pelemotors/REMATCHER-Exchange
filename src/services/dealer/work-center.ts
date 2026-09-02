import "server-only";
import { prisma } from "@/lib/prisma";
import { getDealerUsageSummary } from "@/services/commercial/reveal-usage";
import { getPendingActionsForDealer } from "@/services/demand/demand-queries";
import {
  connectionsMonthlyUsedLabel,
  connectionsRemainingSecondary,
  connectionsUsedLabel,
} from "@/lib/brand-copy";
import { getDealerSetupStatus } from "./onboarding-state";
import { processOutcomeReminders } from "@/services/notifications/product-events";

export interface WorkCenterActionItem {
  href: string;
  label: string;
  count: number;
  urgent?: boolean;
  entityId?: string;
}

export interface WorkCenterSnapshot {
  actionItems: WorkCenterActionItem[];
  activeDemands: number;
  inventoryCount: number;
  matches: number;
  opportunities: number;
  pendingOutcomes: number;
  recentReveals: number;
  connectionsLabel: string;
  connectionsSecondary: string;
  setupStatus: Awaited<ReturnType<typeof getDealerSetupStatus>>;
  notifications: Array<{
    id: string;
    title: string;
    body: string | null;
    link: string | null;
    createdAt: Date;
  }>;
}

export async function getWorkCenterSnapshot(
  dealerId: string,
  userId: string
): Promise<WorkCenterSnapshot> {
  const [
    pendingActions,
    usage,
    inventoryCount,
    activeDemands,
    pendingOutcomes,
    recentReveals,
    recentNotifications,
  ] = await Promise.all([
    getPendingActionsForDealer(dealerId),
    getDealerUsageSummary(dealerId),
    prisma.vehicle.count({ where: { dealerId, status: "ACTIVE" } }),
    prisma.demand.count({ where: { dealerId, status: "ACTIVE" } }),
    prisma.reveal.count({
      where: {
        OR: [{ buyerDealerId: dealerId }, { sellerDealerId: dealerId }],
        outcome: null,
        revealedAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.reveal.count({
      where: {
        OR: [{ buyerDealerId: dealerId }, { sellerDealerId: dealerId }],
        revealedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        body: true,
        link: true,
        createdAt: true,
      },
    }),
  ]);

  const setupStatus = await getDealerSetupStatus(dealerId, {
    vehicleCount: inventoryCount,
    demandCount: activeDemands,
  });

  const actionItems: WorkCenterActionItem[] = [];

  if (usage.actionRequired) {
    actionItems.push({
      href: "/account",
      label: "נדרשת פעולה מסחרית",
      count: 1,
      urgent: true,
    });
  }

  for (const item of pendingActions.items) {
    actionItems.push({
      href: item.href,
      label: item.label,
      count: item.count,
      urgent: item.urgent,
    });
  }

  if (pendingOutcomes > 0) {
    actionItems.push({
      href: "/activity?filter=outcomes",
      label: "חיבורים שממתינים לעדכון",
      count: pendingOutcomes,
      urgent: true,
    });
  }

  if (!setupStatus.hasInventory && setupStatus.shouldShowOnboarding) {
    actionItems.push({
      href: "/inventory",
      label: "הוסף רכבים למלאי",
      count: 1,
      urgent: true,
    });
  }

  if (!setupStatus.hasActiveDemand && setupStatus.hasInventory) {
    actionItems.push({
      href: "/demand?new=1",
      label: "פתח חיפוש ראשון",
      count: 1,
    });
  }

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

  void processOutcomeReminders(dealerId).catch(() => {});

  const matches =
    pendingActions.items.find((i) => i.type === "match")?.count ?? 0;
  const opportunities =
    pendingActions.items.find((i) => i.type === "opportunity")?.count ?? 0;

  return {
    actionItems,
    activeDemands,
    inventoryCount,
    matches,
    opportunities,
    pendingOutcomes,
    recentReveals,
    connectionsLabel,
    connectionsSecondary,
    setupStatus,
    notifications: recentNotifications,
  };
}

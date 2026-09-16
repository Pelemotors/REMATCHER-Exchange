import "server-only";
import { prisma } from "@/lib/prisma";

export interface AdminAttentionItem {
  type: string;
  label: string;
  count: number;
  href?: string;
  severity: "high" | "medium" | "low";
}

export interface AdminFunnelMetrics {
  period: string;
  candidates: number;
  validatedMatches: number;
  buyerInterested: number;
  opportunities: number;
  sellerInterested: number;
  reveals: number;
  dealClosed: number;
  revealToDealPct: number | null;
}

function periodStart(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function getAdminAttentionItems(): Promise<AdminAttentionItem[]> {
  const [
    pendingApprovals,
    noInventoryDealers,
    noDemandDealers,
    stuckValidations,
    stuckOpportunities,
    revealsNoOutcome,
    pushFailures,
    unverifiedUsers,
    failedIntakes,
    emptyEnabledCatalogs,
    suspendedWithCatalog,
    incompleteOnboarding,
    suspendedUsers,
    stuckIntakes,
    brokenCatalogMedia,
  ] = await Promise.all([
    prisma.dealer.count({ where: { verificationStatus: "PENDING" } }),
    prisma.dealer.count({
      where: {
        verificationStatus: "VERIFIED",
        vehicles: { none: { status: "ACTIVE" } },
      },
    }),
    prisma.dealer.count({
      where: {
        verificationStatus: "VERIFIED",
        demands: { none: { status: "ACTIVE" } },
      },
    }),
    prisma.validationEvent.count({
      where: {
        status: "PENDING",
        requestedAt: { lte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
    }),
    prisma.sellerOpportunity.count({
      where: {
        status: "OPEN",
        createdAt: { lte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
    }),
    prisma.reveal.count({
      where: {
        outcome: null,
        revealedAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.aiOperationLog.count({
      where: {
        success: false,
        createdAt: { gte: periodStart(1) },
      },
    }),
    prisma.user.count({
      where: { role: "DEALER_USER", emailVerifiedAt: null },
    }),
    prisma.intakeBatch.count({
      where: { status: "FAILED" },
    }),
    prisma.dealerCatalog.count({
      where: {
        status: "ENABLED",
        publications: { none: { isActive: true } },
      },
    }),
    prisma.dealerCatalog.count({
      where: {
        status: "ENABLED",
        dealer: { isActive: false },
      },
    }),
    prisma.dealer.count({
      where: {
        verificationStatus: "VERIFIED",
        OR: [
          { onboardingState: null },
          { onboardingState: { completedAt: null } },
        ],
      },
    }),
    prisma.user.count({ where: { accountStatus: "SUSPENDED" } }),
    prisma.intakeBatch.count({
      where: {
        status: "PROCESSING",
        processingStartedAt: { lte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      },
    }),
    prisma.catalogPublication.count({
      where: { isActive: true, vehicle: { mediaReady: false } },
    }),
  ]);

  const items: AdminAttentionItem[] = [];

  if (pendingApprovals > 0) {
    items.push({
      type: "pending_approval",
      label: "סוחרים שממתינים לאישור",
      count: pendingApprovals,
      href: "/admin/dealers",
      severity: "high",
    });
  }
  if (stuckValidations > 0) {
    items.push({
      type: "stuck_validations",
      label: "אימותים תקועים מעל 48 שעות",
      count: stuckValidations,
      href: "/admin/matches",
      severity: "high",
    });
  }
  if (revealsNoOutcome > 0) {
    items.push({
      type: "reveals_no_outcome",
      label: "חיבורים ללא תוצאה מעל 7 ימים",
      count: revealsNoOutcome,
      href: "/admin/interest",
      severity: "medium",
    });
  }
  if (stuckOpportunities > 0) {
    items.push({
      type: "stuck_opportunities",
      label: "הזדמנויות פתוחות מעל 48 שעות",
      count: stuckOpportunities,
      href: "/admin/opportunities",
      severity: "medium",
    });
  }
  if (noInventoryDealers > 0) {
    items.push({
      type: "no_inventory",
      label: "סוחרים מאומתים ללא מלאי",
      count: noInventoryDealers,
      href: "/admin/dealers",
      severity: "low",
    });
  }
  if (noDemandDealers > 0) {
    items.push({
      type: "no_demand",
      label: "סוחרים מאומתים ללא חיפוש פעיל",
      count: noDemandDealers,
      href: "/admin/dealers",
      severity: "low",
    });
  }
  if (pushFailures > 0) {
    items.push({
      type: "agent_failures",
      label: "כשלי AI/Agent ב-24 שעות",
      count: pushFailures,
      href: "/admin/system",
      severity: "low",
    });
  }
  if (unverifiedUsers > 0) {
    items.push({
      type: "unverified_users",
      label: "משתמשי סוחר עם מייל לא מאומת",
      count: unverifiedUsers,
      href: "/admin/users",
      severity: "medium",
    });
  }
  if (failedIntakes > 0) {
    items.push({
      type: "failed_intakes",
      label: "אצוות Intake שנכשלו",
      count: failedIntakes,
      href: "/admin/intakes",
      severity: "high",
    });
  }
  if (emptyEnabledCatalogs > 0) {
    items.push({
      type: "empty_catalogs",
      label: "קטלוגים פעילים בלי רכבים מפורסמים",
      count: emptyEnabledCatalogs,
      href: "/admin/catalogs",
      severity: "medium",
    });
  }
  if (suspendedWithCatalog > 0) {
    items.push({
      type: "suspended_catalog",
      label: "סוחר מושעה עם קטלוג פעיל",
      count: suspendedWithCatalog,
      href: "/admin/catalogs",
      severity: "high",
    });
  }
  if (incompleteOnboarding > 0) {
    items.push({
      type: "incomplete_onboarding",
      label: "סוחרים מאומתים בלי onboarding שהושלם",
      count: incompleteOnboarding,
      href: "/admin/dealers",
      severity: "low",
    });
  }
  if (suspendedUsers > 0) {
    items.push({
      type: "suspended_users",
      label: "משתמשים מושעים",
      count: suspendedUsers,
      href: "/admin/users",
      severity: "medium",
    });
  }
  if (stuckIntakes > 0) {
    items.push({
      type: "stuck_intakes",
      label: "Intake תקוע בעיבוד מעל שעתיים",
      count: stuckIntakes,
      href: "/admin/intakes",
      severity: "high",
    });
  }
  if (brokenCatalogMedia > 0) {
    items.push({
      type: "broken_catalog_media",
      label: "פרסום קטלוג בלי מדיה מוכנה",
      count: brokenCatalogMedia,
      href: "/admin/catalogs",
      severity: "medium",
    });
  }

  return items;
}

export async function getAdminFunnelMetrics(
  days: 1 | 7 | 30 = 7
): Promise<AdminFunnelMetrics> {
  const since = periodStart(days);

  const [
    candidates,
    validatedMatches,
    buyerInterested,
    opportunities,
    sellerInterested,
    reveals,
    dealClosed,
  ] = await Promise.all([
    prisma.candidateMatch.count({ where: { createdAt: { gte: since } } }),
    prisma.candidateMatch.count({
      where: { status: "VALIDATED", updatedAt: { gte: since } },
    }),
    prisma.buyerInterest.count({
      where: { status: "INTERESTED", createdAt: { gte: since } },
    }),
    prisma.sellerOpportunity.count({ where: { createdAt: { gte: since } } }),
    prisma.sellerInterest.count({
      where: { status: "INTERESTED", createdAt: { gte: since } },
    }),
    prisma.reveal.count({ where: { revealedAt: { gte: since } } }),
    prisma.outcome.count({
      where: { status: "DEAL_CLOSED", reportedAt: { gte: since } },
    }),
  ]);

  const revealToDealPct =
    reveals > 0 ? Math.round((dealClosed / reveals) * 100) : null;

  return {
    period: days === 1 ? "today" : days === 7 ? "7d" : "30d",
    candidates,
    validatedMatches,
    buyerInterested,
    opportunities,
    sellerInterested,
    reveals,
    dealClosed,
    revealToDealPct,
  };
}

export async function getDealer360(dealerId: string) {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    include: {
      commercial: true,
      onboardingState: true,
      memberships: {
        include: { user: { select: { id: true, name: true, email: true, phone: true, emailVerifiedAt: true } } },
      },
      _count: {
        select: {
          vehicles: true,
          demands: true,
          buyerInterests: true,
          sellerInterests: true,
          revealsAsBuyer: true,
          revealsAsSeller: true,
        },
      },
    },
  });

  if (!dealer) return null;

  const [
    activeInventory,
    activeDemands,
    validatedMatches,
    reveals,
    outcomes,
    pushSubs,
    recentEvents,
  ] = await Promise.all([
    prisma.vehicle.count({ where: { dealerId, status: "ACTIVE" } }),
    prisma.demand.count({ where: { dealerId, status: "ACTIVE" } }),
    prisma.candidateMatch.count({
      where: {
        OR: [
          { demand: { dealerId } },
          { vehicle: { dealerId } },
        ],
        status: "VALIDATED",
      },
    }),
    prisma.reveal.count({
      where: {
        OR: [{ buyerDealerId: dealerId }, { sellerDealerId: dealerId }],
      },
    }),
    prisma.outcome.count({
      where: {
        OR: [{ buyerDealerId: dealerId }, { sellerDealerId: dealerId }],
      },
    }),
    prisma.pushSubscription.count({
      where: { user: { memberships: { some: { dealerId } } } },
    }),
    prisma.appEvent.findMany({
      where: { dealerId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    dealer,
    metrics: {
      activeInventory,
      activeDemands,
      validatedMatches,
      reveals,
      outcomes,
      pushSubscriptions: pushSubs,
    },
    recentEvents,
  };
}

import "server-only";
import type { DealerEntitlement, EntitlementStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TRIAL_DURATION_DAYS } from "@/config/product-policy";
import {
  isMonetizationEnabled,
  isTrialEnabled,
} from "@/services/product-policy";
import { logAppEvent } from "@/services/events/log-event";

const ENTITLED_STATUSES: EntitlementStatus[] = [
  "ACTIVE",
  "TRIAL",
  "FOUNDING_DEALER",
  "GRACE_PERIOD",
];

export class EntitlementError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_ENTITLED"
      | "TRIAL_DISABLED"
      | "TRIAL_INELIGIBLE"
      | "TRIAL_ALREADY_ACTIVE"
  ) {
    super(message);
    this.name = "EntitlementError";
  }
}

export async function getDealerEntitlement(
  dealerId: string
): Promise<DealerEntitlement> {
  const existing = await prisma.dealerEntitlement.findUnique({
    where: { dealerId },
  });
  if (existing) return existing;
  return prisma.dealerEntitlement.create({
    data: { dealerId, status: "FREE", trialEligible: true },
  });
}

function daysRemaining(endsAt: Date | null | undefined, now: Date): number | null {
  if (!endsAt) return null;
  const ms = endsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function compactEntitlementView(
  entitlement: DealerEntitlement,
  now = new Date()
) {
  return {
    accessStatus: entitlement.status,
    planSlug: entitlement.planSlug,
    foundingDealer: entitlement.foundingDealer,
    trialEligible: entitlement.trialEligible,
    trialEndsAt: entitlement.trialEndsAt?.toISOString() ?? null,
    trialDaysRemaining:
      entitlement.status === "TRIAL"
        ? daysRemaining(entitlement.trialEndsAt, now)
        : null,
    currentPeriodEnd: entitlement.currentPeriodEnd?.toISOString() ?? null,
    gracePeriodEndsAt: entitlement.gracePeriodEndsAt?.toISOString() ?? null,
  };
}

/**
 * Recalculate entitlement from founding / trial / subscription state.
 * Priority: FOUNDING > ACTIVE subscription > GRACE > TRIAL (if still open) > EXPIRED/FREE.
 */
export async function recalculateEntitlement(
  dealerId: string
): Promise<DealerEntitlement> {
  const now = new Date();
  const row = await getDealerEntitlement(dealerId);

  if (row.foundingDealer) {
    return prisma.dealerEntitlement.update({
      where: { dealerId },
      data: {
        status: "FOUNDING_DEALER",
        recalculatedAt: now,
      },
    });
  }

  if (row.status === "SUSPENDED") {
    return prisma.dealerEntitlement.update({
      where: { dealerId },
      data: { status: "SUSPENDED", recalculatedAt: now },
    });
  }

  const subscription = await prisma.dealerSubscription.findFirst({
    where: {
      dealerId,
      status: { in: ["ACTIVE", "IN_GRACE_PERIOD", "CANCELLED"] },
    },
    orderBy: { updatedAt: "desc" },
    include: { plan: true },
  });

  if (subscription) {
    const periodEnd = subscription.currentPeriodEnd;
    const graceEnd = subscription.gracePeriodEndsAt;

    if (
      subscription.status === "ACTIVE" &&
      (!periodEnd || periodEnd > now)
    ) {
      return prisma.dealerEntitlement.update({
        where: { dealerId },
        data: {
          status: "ACTIVE",
          planSlug: subscription.plan?.slug ?? row.planSlug,
          currentPeriodEnd: periodEnd,
          gracePeriodEndsAt: graceEnd,
          sourceSubscriptionId: subscription.id,
          recalculatedAt: now,
        },
      });
    }

    if (
      (subscription.status === "IN_GRACE_PERIOD" ||
        (periodEnd && periodEnd <= now && graceEnd && graceEnd > now)) &&
      graceEnd &&
      graceEnd > now
    ) {
      return prisma.dealerEntitlement.update({
        where: { dealerId },
        data: {
          status: "GRACE_PERIOD",
          planSlug: subscription.plan?.slug ?? row.planSlug,
          currentPeriodEnd: periodEnd,
          gracePeriodEndsAt: graceEnd,
          sourceSubscriptionId: subscription.id,
          recalculatedAt: now,
        },
      });
    }

    if (
      subscription.status === "EXPIRED" ||
      subscription.status === "REFUNDED" ||
      subscription.status === "REVOKED" ||
      (periodEnd && periodEnd <= now && (!graceEnd || graceEnd <= now))
    ) {
      // fall through to trial / free after expired subscription
    } else if (subscription.status === "CANCELLED" && periodEnd && periodEnd > now) {
      return prisma.dealerEntitlement.update({
        where: { dealerId },
        data: {
          status: "ACTIVE",
          planSlug: subscription.plan?.slug ?? row.planSlug,
          currentPeriodEnd: periodEnd,
          gracePeriodEndsAt: graceEnd,
          sourceSubscriptionId: subscription.id,
          recalculatedAt: now,
        },
      });
    }
  }

  if (
    row.trialStartedAt &&
    row.trialEndsAt &&
    row.trialEndsAt > now &&
    !row.trialConsumedAt
  ) {
    return prisma.dealerEntitlement.update({
      where: { dealerId },
      data: {
        status: "TRIAL",
        recalculatedAt: now,
      },
    });
  }

  if (row.trialEndsAt && row.trialEndsAt <= now) {
    return prisma.dealerEntitlement.update({
      where: { dealerId },
      data: {
        status: "EXPIRED",
        trialConsumedAt: row.trialConsumedAt ?? row.trialEndsAt,
        trialEligible: false,
        recalculatedAt: now,
        sourceSubscriptionId: null,
      },
    });
  }

  const hadPaid =
    (await prisma.dealerSubscription.count({ where: { dealerId } })) > 0;

  return prisma.dealerEntitlement.update({
    where: { dealerId },
    data: {
      status: hadPaid ? "EXPIRED" : "FREE",
      recalculatedAt: now,
      sourceSubscriptionId: null,
    },
  });
}

export async function assertEntitled(
  dealerId: string,
  _capability?: string
): Promise<DealerEntitlement> {
  if (!(await isMonetizationEnabled())) {
    return getDealerEntitlement(dealerId);
  }
  const entitlement = await recalculateEntitlement(dealerId);
  if (!ENTITLED_STATUSES.includes(entitlement.status)) {
    throw new EntitlementError("Dealer is not entitled", "NOT_ENTITLED");
  }
  return entitlement;
}

export function isEntitledStatus(status: EntitlementStatus): boolean {
  return ENTITLED_STATUSES.includes(status);
}

export async function startTrial(
  dealerId: string,
  opts?: { force?: boolean }
): Promise<DealerEntitlement> {
  if (!(await isTrialEnabled()) && !opts?.force) {
    throw new EntitlementError("Trial is disabled", "TRIAL_DISABLED");
  }

  const row = await getDealerEntitlement(dealerId);
  if (!row.trialEligible && !opts?.force) {
    throw new EntitlementError("Trial not eligible", "TRIAL_INELIGIBLE");
  }
  if (row.status === "TRIAL" && row.trialEndsAt && row.trialEndsAt > new Date()) {
    throw new EntitlementError("Trial already active", "TRIAL_ALREADY_ACTIVE");
  }

  const now = new Date();
  // Trial clock is independent of accountCreatedAt / dealer.createdAt
  const trialEndsAt = new Date(
    now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  const updated = await prisma.dealerEntitlement.update({
    where: { dealerId },
    data: {
      status: "TRIAL",
      trialStartedAt: now,
      trialEndsAt,
      trialEligible: false,
      recalculatedAt: now,
    },
  });

  await logAppEvent({
    eventType: "TRIAL_STARTED",
    entityType: "Dealer",
    entityId: dealerId,
    dealerId,
    metadata: {
      trialEndsAt: trialEndsAt.toISOString(),
      days: TRIAL_DURATION_DAYS,
    },
  });

  return updated;
}

export async function markFoundingDealer(
  dealerId: string
): Promise<DealerEntitlement> {
  await getDealerEntitlement(dealerId);
  const updated = await prisma.dealerEntitlement.update({
    where: { dealerId },
    data: {
      foundingDealer: true,
      status: "FOUNDING_DEALER",
      recalculatedAt: new Date(),
    },
  });
  await logAppEvent({
    eventType: "FOUNDING_DEALER_MARKED",
    entityType: "Dealer",
    entityId: dealerId,
    dealerId,
  });
  return updated;
}

/** Ensure entitlement row exists when a dealer is accessed (backfill helper). */
export async function ensureEntitlementOnDealerAccess(
  dealerId: string
): Promise<DealerEntitlement> {
  return getDealerEntitlement(dealerId);
}

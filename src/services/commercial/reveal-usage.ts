import { prisma } from "@/lib/prisma";
import {
  COMMERCIAL_PLANS,
  FREE_LIFETIME_REVEALS,
  type DealerUsageSummary,
  type PlanSlug,
} from "@/config/commercial";
import { addMonths, startOfMonth } from "date-fns";

export type RevealUsageSourceType =
  | "FREE_LIFETIME"
  | "MONTHLY_PLAN"
  | "GRACE";

export async function ensureDealerCommercial(dealerId: string) {
  const existing = await prisma.dealerCommercial.findUnique({
    where: { dealerId },
  });
  if (existing) return existing;

  return prisma.dealerCommercial.create({
    data: {
      dealerId,
      planSlug: "onboarding",
      freeRevealAllowance: FREE_LIFETIME_REVEALS,
      freeRevealUsed: 0,
      monthlyRevealAllowance: 0,
      monthlyRevealUsed: 0,
      billingPeriodStart: startOfMonth(new Date()),
    },
  });
}

export async function getDealerUsageSummary(
  dealerId: string
): Promise<DealerUsageSummary> {
  const commercial = await ensureDealerCommercial(dealerId);
  const plan =
    COMMERCIAL_PLANS[commercial.planSlug as PlanSlug] ??
    COMMERCIAL_PLANS.onboarding;

  const freeRemaining = Math.max(
    0,
    commercial.freeRevealAllowance - commercial.freeRevealUsed
  );
  const monthlyRemaining = Math.max(
    0,
    commercial.monthlyRevealAllowance - commercial.monthlyRevealUsed
  );
  const totalRemaining = freeRemaining + monthlyRemaining;

  return {
    planSlug: commercial.planSlug,
    planName: plan.name,
    planStatus: commercial.planStatus,
    freeAllowance: commercial.freeRevealAllowance,
    freeUsed: commercial.freeRevealUsed,
    freeRemaining,
    monthlyAllowance: commercial.monthlyRevealAllowance,
    monthlyUsed: commercial.monthlyRevealUsed,
    monthlyRemaining,
    totalRemaining,
    billingPeriodStart: commercial.billingPeriodStart,
    canReveal: totalRemaining > 0,
    actionRequired: commercial.planStatus === "ACTION_REQUIRED",
  };
}

export async function canDealerReveal(dealerId: string): Promise<boolean> {
  const summary = await getDealerUsageSummary(dealerId);
  return summary.canReveal;
}

/**
 * Record Reveal usage — idempotent per (revealId, dealerId).
 * Billing event = Reveal created. Outcome does NOT affect billing.
 * P-61 Grace: when allowance exhausted, records GRACE usage and flags ACTION_REQUIRED.
 */
export async function recordRevealUsageForDealer(
  revealId: string,
  dealerId: string
): Promise<{ created: boolean; source: RevealUsageSourceType | null }> {
  const existing = await prisma.revealUsage.findUnique({
    where: { revealId_dealerId: { revealId, dealerId } },
  });
  if (existing) {
    return { created: false, source: existing.source };
  }

  const commercial = await ensureDealerCommercial(dealerId);

  let source: RevealUsageSourceType;
  const updateData: {
    freeRevealUsed?: { increment: number };
    monthlyRevealUsed?: { increment: number };
    planStatus?: "ACTION_REQUIRED";
  } = {};

  if (commercial.freeRevealUsed < commercial.freeRevealAllowance) {
    source = "FREE_LIFETIME";
    updateData.freeRevealUsed = { increment: 1 };
  } else if (
    commercial.monthlyRevealUsed < commercial.monthlyRevealAllowance
  ) {
    source = "MONTHLY_PLAN";
    updateData.monthlyRevealUsed = { increment: 1 };
  } else {
    // P-61 Grace Reveal — mutual interest already ripened; do not block Reveal
    source = "GRACE";
    updateData.planStatus = "ACTION_REQUIRED";
  }

  await prisma.dealerCommercial.update({
    where: { dealerId },
    data: updateData,
  });

  await prisma.revealUsage.create({
    data: { revealId, dealerId, source },
  });

  return { created: true, source };
}

/** Record usage for both sides of a Reveal — idempotent */
export async function recordRevealUsageBothSides(
  revealId: string,
  buyerDealerId: string,
  sellerDealerId: string
) {
  const buyer = await recordRevealUsageForDealer(revealId, buyerDealerId);
  const seller = await recordRevealUsageForDealer(revealId, sellerDealerId);
  return { buyer, seller };
}

export async function assignPlan(dealerId: string, planSlug: PlanSlug) {
  const plan = COMMERCIAL_PLANS[planSlug];
  await ensureDealerCommercial(dealerId);
  return prisma.dealerCommercial.update({
    where: { dealerId },
    data: {
      planSlug,
      monthlyRevealAllowance: plan.monthlyRevealAllowance,
      monthlyRevealUsed: 0,
      billingPeriodStart: startOfMonth(new Date()),
      billingPeriodEnd: addMonths(startOfMonth(new Date()), 1),
      planStatus: "ACTIVE",
    },
  });
}

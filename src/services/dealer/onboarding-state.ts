import "server-only";
import { prisma } from "@/lib/prisma";

export interface DealerSetupStatus {
  hasInventory: boolean;
  inventoryCount: number;
  hasActiveDemand: boolean;
  activeDemandCount: number;
  profileComplete: boolean;
  pushEnabled: boolean;
  onboardingComplete: boolean;
  shouldShowOnboarding: boolean;
  currentStep: string | null;
}

function isProfileComplete(dealer: {
  city: string | null;
  region: string | null;
  phone: string;
  businessName: string;
}) {
  return Boolean(dealer.city && dealer.region && dealer.phone && dealer.businessName);
}

export async function syncOnboardingFromActivity(
  dealerId: string,
  preloadedCounts?: { vehicleCount: number; demandCount: number }
) {
  const [dealer, vehicleCount, demandCount, state] = await Promise.all([
    prisma.dealer.findUnique({ where: { id: dealerId } }),
    preloadedCounts
      ? Promise.resolve(preloadedCounts.vehicleCount)
      : prisma.vehicle.count({ where: { dealerId, status: "ACTIVE" } }),
    preloadedCounts
      ? Promise.resolve(preloadedCounts.demandCount)
      : prisma.demand.count({ where: { dealerId, status: "ACTIVE" } }),
    prisma.dealerOnboardingState.findUnique({ where: { dealerId } }),
  ]);

  if (!dealer) return null;

  const now = new Date();
  const hasInventory = vehicleCount > 0;
  const hasDemand = demandCount > 0;
  const profileComplete = isProfileComplete(dealer);

  if (state?.completedAt || state?.dismissedAt) {
    return state;
  }

  const existingActiveDealer = hasInventory || hasDemand;
  if (existingActiveDealer && !state) {
    return prisma.dealerOnboardingState.create({
      data: {
        dealerId,
        introCompletedAt: now,
        profileCompletedAt: profileComplete ? now : undefined,
        inventorySeenAt: hasInventory ? now : undefined,
        demandSeenAt: hasDemand ? now : undefined,
        completedAt: now,
      },
    });
  }

  if (!state) {
    return prisma.dealerOnboardingState.create({
      data: { dealerId, currentStep: "intro" },
    });
  }

  const updates: Record<string, Date | string | null> = {};
  if (profileComplete && !state.profileCompletedAt) {
    updates.profileCompletedAt = now;
  }
  if (hasInventory && !state.inventorySeenAt) {
    updates.inventorySeenAt = now;
  }
  if (hasDemand && !state.demandSeenAt) {
    updates.demandSeenAt = now;
  }

  if (Object.keys(updates).length === 0) return state;

  return prisma.dealerOnboardingState.update({
    where: { dealerId },
    data: updates,
  });
}

export async function getDealerSetupStatus(
  dealerId: string,
  preloadedCounts?: { vehicleCount: number; demandCount: number }
): Promise<DealerSetupStatus> {
  const counts: { vehicleCount: number; demandCount: number } =
    preloadedCounts ??
    (await Promise.all([
      prisma.vehicle.count({ where: { dealerId, status: "ACTIVE" } }),
      prisma.demand.count({ where: { dealerId, status: "ACTIVE" } }),
    ]).then(([vehicleCount, demandCount]) => ({ vehicleCount, demandCount })));

  const [state, dealer, pushCount] = await Promise.all([
    syncOnboardingFromActivity(dealerId, counts),
    prisma.dealer.findUnique({ where: { id: dealerId } }),
    prisma.pushSubscription.count({
      where: { user: { memberships: { some: { dealerId } } } },
    }),
  ]);

  const { vehicleCount, demandCount } = counts;

  const profileComplete = dealer ? isProfileComplete(dealer) : false;
  const persistedOnboardingComplete = Boolean(
    state?.completedAt || state?.dismissedAt
  );
  const existingActiveDealer =
    vehicleCount > 0 || demandCount > 0 || persistedOnboardingComplete;

  return {
    hasInventory: vehicleCount > 0,
    inventoryCount: vehicleCount,
    hasActiveDemand: demandCount > 0,
    activeDemandCount: demandCount,
    profileComplete,
    pushEnabled: pushCount > 0,
    onboardingComplete: existingActiveDealer,
    // A dealer who already has live inventory OR an active demand is not a cold-start user.
    // Missing one side may still be suggested on Home, but must never force /onboarding.
    shouldShowOnboarding: !existingActiveDealer,
    currentStep: state?.currentStep ?? "intro",
  };
}

export async function markOnboardingStep(
  dealerId: string,
  step: "intro" | "profile" | "inventory" | "demand" | "push" | "complete" | "dismiss"
) {
  const now = new Date();
  await syncOnboardingFromActivity(dealerId);

  const fieldMap: Record<string, Record<string, unknown>> = {
    intro: { introCompletedAt: now, currentStep: "profile" },
    profile: { profileCompletedAt: now, currentStep: "inventory" },
    inventory: { inventorySeenAt: now, currentStep: "demand" },
    demand: { demandSeenAt: now, currentStep: "push" },
    push: { pushPromptedAt: now, currentStep: "complete" },
    complete: { completedAt: now, currentStep: null },
    dismiss: { dismissedAt: now, currentStep: null },
  };

  return prisma.dealerOnboardingState.upsert({
    where: { dealerId },
    create: { dealerId, ...fieldMap[step] },
    update: fieldMap[step],
  });
}

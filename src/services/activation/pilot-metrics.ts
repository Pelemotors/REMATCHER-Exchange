/**
 * Pilot Activation analytics — counts & timings. Never authorization.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { DEALER_COHORT, isTestAccountEmail } from "@/config/accounts";
import {
  ACTIVATION_MILESTONES,
  type ActivationMilestone,
} from "@/services/activation/milestones";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

async function pilotDealerIds(): Promise<string[]> {
  const dealers = await prisma.dealer.findMany({
    where: {
      OR: [
        { cohort: DEALER_COHORT.PILOT },
        { cohort: null, verificationStatus: "VERIFIED" },
      ],
    },
    select: {
      id: true,
      memberships: { select: { user: { select: { email: true } } }, take: 5 },
    },
  });
  return dealers
    .filter(
      (d) => !d.memberships.some((m) => isTestAccountEmail(m.user.email))
    )
    .map((d) => d.id);
}

export async function getPilotActivationMetrics() {
  const dealerIds = await pilotDealerIds();
  const idSet = new Set(dealerIds);

  const [
    signedUp,
    verified,
    withInventory,
    withDemand,
    withPush,
    priceCoverage,
  ] = await Promise.all([
    prisma.dealer.count({
      where: { id: { in: dealerIds } },
    }),
    prisma.dealer.count({
      where: { id: { in: dealerIds }, verificationStatus: "VERIFIED" },
    }),
    prisma.dealer.count({
      where: {
        id: { in: dealerIds },
        vehicles: { some: { status: "ACTIVE" } },
      },
    }),
    prisma.dealer.count({
      where: {
        id: { in: dealerIds },
        demands: { some: { status: { in: ["ACTIVE", "EXPIRED", "CANCELLED"] } } },
      },
    }),
    prisma.pushSubscription.groupBy({
      by: ["userId"],
      where: {
        invalidatedAt: null,
        user: { memberships: { some: { dealerId: { in: dealerIds } } } },
      },
    }).then((rows) => rows.length),
    prisma.vehicle.groupBy({
      by: ["dealerId"],
      where: { status: "ACTIVE", dealerId: { in: dealerIds } },
      _count: { _all: true },
    }),
  ]);

  const vehiclesWithPrice = await prisma.vehicle.count({
    where: {
      status: "ACTIVE",
      dealerId: { in: dealerIds },
      b2bPrice: { not: null },
    },
  });
  const vehiclesActive = await prisma.vehicle.count({
    where: { status: "ACTIVE", dealerId: { in: dealerIds } },
  });

  const milestoneCounts: Record<string, number> = {};
  for (const m of ACTIVATION_MILESTONES) {
    milestoneCounts[m] = 0;
  }

  const activationEvents = await prisma.appEvent.findMany({
    where: {
      source: "activation",
      dealerId: { in: dealerIds },
    },
    select: { dealerId: true, metadataJson: true, createdAt: true, eventType: true },
  });

  const byDealer = new Map<string, Partial<Record<ActivationMilestone, Date>>>();
  for (const ev of activationEvents) {
    if (!ev.dealerId || !idSet.has(ev.dealerId)) continue;
    const meta = ev.metadataJson as { milestone?: string } | null;
    const name = (meta?.milestone ??
      ev.eventType.replace(/^activation_/, "").toUpperCase()) as ActivationMilestone;
    if (!ACTIVATION_MILESTONES.includes(name)) continue;
    const map = byDealer.get(ev.dealerId) ?? {};
    if (!map[name]) map[name] = ev.createdAt;
    byDealer.set(ev.dealerId, map);
    milestoneCounts[name] = (milestoneCounts[name] ?? 0) + 1;
  }

  // Unique dealers per milestone (recompute from byDealer for accuracy)
  for (const m of ACTIVATION_MILESTONES) {
    milestoneCounts[m] = [...byDealer.values()].filter((x) => x[m]).length;
  }

  const [invDealers, demDealers] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: "ACTIVE", dealerId: { in: dealerIds } },
      select: { dealerId: true },
      distinct: ["dealerId"],
    }),
    prisma.demand.findMany({
      where: {
        dealerId: { in: dealerIds },
        status: { in: ["ACTIVE", "EXPIRED", "CANCELLED"] },
      },
      select: { dealerId: true },
      distinct: ["dealerId"],
    }),
  ]);
  const invSet = new Set(invDealers.map((d) => d.dealerId));
  const demSet = new Set(demDealers.map((d) => d.dealerId));
  let supplyParticipants = 0;
  let demandParticipants = 0;
  let both = 0;
  for (const id of dealerIds) {
    const hasInv = invSet.has(id);
    const hasDem = demSet.has(id);
    if (hasInv && hasDem) both += 1;
    else if (hasInv) supplyParticipants += 1;
    else if (hasDem) demandParticipants += 1;
  }

  const timingHours: Record<string, number[]> = {
    signupToVerified: [],
    verifiedToFirstInput: [],
    firstInputToFirstMatch: [],
    firstMatchToInterest: [],
    interestToMutual: [],
    mutualToReveal: [],
    revealToDeal: [],
  };

  for (const [, map] of byDealer) {
    const pushHours = (
      a: ActivationMilestone,
      b: ActivationMilestone,
      bucket: string
    ) => {
      const t0 = map[a]?.getTime();
      const t1 = map[b]?.getTime();
      if (t0 && t1 && t1 >= t0) {
        timingHours[bucket]!.push((t1 - t0) / (1000 * 60 * 60));
      }
    };
    pushHours("DEALER_SIGNED_UP", "DEALER_VERIFIED", "signupToVerified");
    const firstInput =
      map.FIRST_INVENTORY_CREATED && map.FIRST_DEMAND_CREATED
        ? map.FIRST_INVENTORY_CREATED < map.FIRST_DEMAND_CREATED
          ? map.FIRST_INVENTORY_CREATED
          : map.FIRST_DEMAND_CREATED
        : map.FIRST_INVENTORY_CREATED ?? map.FIRST_DEMAND_CREATED;
    if (map.DEALER_VERIFIED && firstInput) {
      timingHours.verifiedToFirstInput!.push(
        (firstInput.getTime() - map.DEALER_VERIFIED.getTime()) / (1000 * 60 * 60)
      );
    }
    if (firstInput && map.FIRST_MATCH_PRESENTED) {
      timingHours.firstInputToFirstMatch!.push(
        (map.FIRST_MATCH_PRESENTED.getTime() - firstInput.getTime()) /
          (1000 * 60 * 60)
      );
    }
    pushHours("FIRST_MATCH_PRESENTED", "FIRST_BUYER_INTEREST", "firstMatchToInterest");
    pushHours("FIRST_BUYER_INTEREST", "FIRST_MUTUAL_INTEREST", "interestToMutual");
    // seller path interest→mutual also ok via FIRST_SELLER_OPPORTUNITY
    pushHours("FIRST_MUTUAL_INTEREST", "FIRST_REVEAL", "mutualToReveal");
    pushHours("FIRST_REVEAL", "FIRST_REPORTED_DEAL", "revealToDeal");
  }

  const demandsActive = await prisma.demand.count({
    where: { status: "ACTIVE", dealerId: { in: dealerIds } },
  });
  const demandsWithMatch = await prisma.demand.count({
    where: {
      status: "ACTIVE",
      dealerId: { in: dealerIds },
      candidateMatches: { some: {} },
    },
  });

  const potentialBlockers = await prisma.candidateMatch.groupBy({
    by: ["resolutionState"],
    where: {
      demand: { dealerId: { in: dealerIds } },
    },
    _count: { _all: true },
  });

  return {
    cohortSize: signedUp,
    verified,
    withInventory,
    withDemand,
    supplyParticipants,
    demandParticipants,
    bothParticipants: both,
    dealersWithPush: withPush,
    inventoryPriceCoverage: {
      activeVehicles: vehiclesActive,
      withPrivatePrice: vehiclesWithPrice,
      missingPrivatePrice: Math.max(0, vehiclesActive - vehiclesWithPrice),
      pctWithPrice:
        vehiclesActive > 0
          ? Math.round((vehiclesWithPrice / vehiclesActive) * 1000) / 10
          : null,
    },
    milestones: milestoneCounts,
    medianHours: Object.fromEntries(
      Object.entries(timingHours).map(([k, v]) => [k, median(v)])
    ),
    matchCoverage: {
      activeDemands: demandsActive,
      demandsWithAtLeastOneMatch: demandsWithMatch,
      pctDemandsWithMatch:
        demandsActive > 0
          ? Math.round((demandsWithMatch / demandsActive) * 1000) / 10
          : null,
      resolutionDistribution: potentialBlockers.map((r) => ({
        state: r.resolutionState,
        count: r._count._all,
      })),
    },
    note: "Analytics only — never used for authorization or READY/NOT_READY.",
    dealersInPriceGroupBy: priceCoverage.length,
  };
}

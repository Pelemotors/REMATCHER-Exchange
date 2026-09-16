import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import type { DealerOpportunityType } from "@prisma/client";

/**
 * Proactive opportunity upsert with dedupe.
 * Dismissed opportunities stay suppressed until materialChangeToken changes.
 */
export async function upsertDealerOpportunity(params: {
  dealerId: string;
  type: DealerOpportunityType;
  dedupeKey: string;
  title: string;
  priority?: number;
  reason?: Record<string, unknown>;
  vehicleId?: string | null;
  demandId?: string | null;
  customerId?: string | null;
  score?: number | null;
  /** When set and differs from stored reason.materialChangeToken → reactivate dismissed */
  materialChangeToken?: string;
}) {
  const existing = await prisma.dealerOpportunity.findUnique({
    where: {
      dealerId_dedupeKey: {
        dealerId: params.dealerId,
        dedupeKey: params.dedupeKey,
      },
    },
  });

  const reasonJson = {
    ...(params.reason ?? {}),
    ...(params.materialChangeToken
      ? { materialChangeToken: params.materialChangeToken }
      : {}),
  };

  if (existing) {
    if (existing.status === "DISMISSED" || existing.status === "SUPPRESSED") {
      const prev = (existing.reasonJson ?? {}) as Record<string, unknown>;
      const prevToken = prev.materialChangeToken;
      if (
        !params.materialChangeToken ||
        prevToken === params.materialChangeToken
      ) {
        return { opportunity: existing, created: false, reactivated: false };
      }
      // Material change → reopen
      const updated = await prisma.dealerOpportunity.update({
        where: { id: existing.id },
        data: {
          status: "OPEN",
          dismissedAt: null,
          title: params.title,
          priority: params.priority ?? existing.priority,
          reasonJson: toPrismaJson(reasonJson),
          score: params.score ?? existing.score,
          vehicleId: params.vehicleId ?? existing.vehicleId,
          demandId: params.demandId ?? existing.demandId,
          customerId: params.customerId ?? existing.customerId,
        },
      });
      return { opportunity: updated, created: false, reactivated: true };
    }
    const updated = await prisma.dealerOpportunity.update({
      where: { id: existing.id },
      data: {
        title: params.title,
        priority: params.priority ?? existing.priority,
        reasonJson: toPrismaJson(reasonJson),
        score: params.score ?? existing.score,
      },
    });
    return { opportunity: updated, created: false, reactivated: false };
  }

  const created = await prisma.dealerOpportunity.create({
    data: {
      dealerId: params.dealerId,
      type: params.type,
      dedupeKey: params.dedupeKey,
      title: params.title,
      priority: params.priority ?? 50,
      reasonJson: toPrismaJson(reasonJson),
      vehicleId: params.vehicleId ?? null,
      demandId: params.demandId ?? null,
      customerId: params.customerId ?? null,
      score: params.score ?? null,
    },
  });
  return { opportunity: created, created: true, reactivated: false };
}

export async function dismissDealerOpportunity(dealerId: string, id: string) {
  const row = await prisma.dealerOpportunity.findFirst({
    where: { id, dealerId },
  });
  if (!row) return null;
  return prisma.dealerOpportunity.update({
    where: { id },
    data: { status: "DISMISSED", dismissedAt: new Date() },
  });
}

export async function listOpenDealerOpportunities(dealerId: string, take = 30) {
  return prisma.dealerOpportunity.findMany({
    where: { dealerId, status: "OPEN" },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take,
  });
}

/**
 * After a new CandidateMatch is created for demand owner — surface opportunity.
 * Never includes seller identity in reasonJson.
 */
export async function maybeOpportunityFromNetworkMatch(params: {
  buyerDealerId: string;
  demandId: string;
  candidateMatchId: string;
  scoreBand: string;
  score: number;
}) {
  if (params.scoreBand === "NO_MATCH" || params.scoreBand === "HIDDEN") return;
  await upsertDealerOpportunity({
    dealerId: params.buyerDealerId,
    type: "NETWORK_SUPPLY_FOR_MY_DEMAND",
    dedupeKey: `net-supply:${params.demandId}:${params.candidateMatchId}`,
    title: "נמצא היצע ברשת שמתאים לחיפוש שלך",
    priority: params.scoreBand === "STRONG" ? 90 : 70,
    score: params.score,
    demandId: params.demandId,
    reason: {
      candidateMatchId: params.candidateMatchId,
      scoreBand: params.scoreBand,
    },
    materialChangeToken: `${params.candidateMatchId}:${params.scoreBand}:${Math.round(params.score)}`,
  });
}

/** Seller side: demand match against my published supply */
export async function maybeOpportunityFromDemandForMyVehicle(params: {
  sellerDealerId: string;
  vehicleId: string;
  demandId: string;
  candidateMatchId: string;
  scoreBand: string;
  score: number;
}) {
  if (params.scoreBand === "NO_MATCH" || params.scoreBand === "HIDDEN") return;
  await upsertDealerOpportunity({
    dealerId: params.sellerDealerId,
    type: "NETWORK_DEMAND_FOR_MY_VEHICLE",
    dedupeKey: `net-demand:${params.vehicleId}:${params.demandId}`,
    title: "יש חיפוש ברשת שמתאים לרכב שלך",
    priority: params.scoreBand === "STRONG" ? 88 : 68,
    score: params.score,
    vehicleId: params.vehicleId,
    demandId: params.demandId,
    reason: {
      candidateMatchId: params.candidateMatchId,
      scoreBand: params.scoreBand,
    },
    materialChangeToken: `${params.candidateMatchId}:${params.scoreBand}:${Math.round(params.score)}`,
  });
}

/** Private offered/trade vehicle matched to my customers — never publishes */
export async function maybeOpportunityFromPrivateCandidate(params: {
  dealerId: string;
  vehicleId: string;
  demandId: string;
  customerId?: string | null;
  score: number;
}) {
  await upsertDealerOpportunity({
    dealerId: params.dealerId,
    type: "PRIVATE_VEHICLE_FOR_MY_CUSTOMER",
    dedupeKey: `private-cand:${params.vehicleId}:${params.demandId}`,
    title: "רכב פרטי אצלך מתאים ללקוח שלך",
    priority: 85,
    score: params.score,
    vehicleId: params.vehicleId,
    demandId: params.demandId,
    customerId: params.customerId ?? null,
    reason: { private: true },
    materialChangeToken: `pv:${params.vehicleId}:${params.demandId}:${Math.round(params.score)}`,
  });
}

export async function maybeOpportunityInterestWaiting(params: {
  dealerId: string;
  interestId: string;
  title: string;
  vehicleId?: string | null;
  demandId?: string | null;
}) {
  await upsertDealerOpportunity({
    dealerId: params.dealerId,
    type: "INTEREST_WAITING",
    dedupeKey: `interest-wait:${params.interestId}`,
    title: params.title,
    priority: 92,
    vehicleId: params.vehicleId ?? null,
    demandId: params.demandId ?? null,
    reason: { interestId: params.interestId },
    materialChangeToken: `iw:${params.interestId}`,
  });
}

export async function maybeOpportunityMutual(params: {
  dealerId: string;
  mutualId: string;
  title: string;
  vehicleId?: string | null;
  demandId?: string | null;
}) {
  await upsertDealerOpportunity({
    dealerId: params.dealerId,
    type: "MUTUAL_INTEREST",
    dedupeKey: `mutual:${params.mutualId}`,
    title: params.title,
    priority: 98,
    vehicleId: params.vehicleId ?? null,
    demandId: params.demandId ?? null,
    reason: { mutualId: params.mutualId },
    materialChangeToken: `mi:${params.mutualId}`,
  });
}

/**
 * Sweep open signals into DealerOpportunity (deduped).
 * Safe for API / cron — never invents identities.
 */
export async function refreshDealerOpportunitySources(dealerId: string) {
  const [buyerMatches, sellerMatches, buyerInterests, sellerOpps, mutuals, privateVehicles] =
    await Promise.all([
      prisma.candidateMatch.findMany({
        where: {
          demand: { dealerId, status: "ACTIVE" },
          status: { in: ["CANDIDATE", "VALIDATED", "PENDING_VALIDATION"] },
        },
        orderBy: { updatedAt: "desc" },
        take: 40,
        select: {
          id: true,
          demandId: true,
          vehicleId: true,
          score: true,
          scoreBand: true,
        },
      }),
      prisma.candidateMatch.findMany({
        where: {
          vehicle: { dealerId, status: "ACTIVE" },
          status: { in: ["CANDIDATE", "VALIDATED", "PENDING_VALIDATION"] },
        },
        orderBy: { updatedAt: "desc" },
        take: 40,
        select: {
          id: true,
          demandId: true,
          vehicleId: true,
          score: true,
          scoreBand: true,
        },
      }),
      prisma.buyerInterest.findMany({
        where: { dealerId, status: "INTERESTED" },
        take: 20,
        select: {
          id: true,
          demandId: true,
          candidateMatch: { select: { vehicleId: true } },
        },
      }),
      prisma.sellerOpportunity.findMany({
        where: {
          status: "OPEN",
          vehicle: { dealerId },
        },
        take: 20,
        select: {
          id: true,
          vehicleId: true,
          buyerInterest: { select: { demandId: true, id: true } },
        },
      }),
      prisma.mutualInterest.findMany({
        where: {
          OR: [
            { sellerInterest: { dealerId } },
            { sellerInterest: { opportunity: { vehicle: { dealerId } } } },
          ],
        },
        take: 20,
        select: {
          id: true,
          sellerInterest: {
            select: {
              opportunity: {
                select: {
                  vehicleId: true,
                  buyerInterest: { select: { demandId: true } },
                },
              },
            },
          },
        },
      }),
      prisma.vehicle.findMany({
        where: {
          dealerId,
          status: "ACTIVE",
          dealerRelationship: {
            in: ["OFFERED_TO_ME", "TRADE_IN_CANDIDATE", "EXTERNAL"],
          },
          visibility: "PRIVATE",
        },
        take: 25,
        select: { id: true },
      }),
    ]);

  for (const m of buyerMatches) {
    if (!m.scoreBand || m.score == null) continue;
    await maybeOpportunityFromNetworkMatch({
      buyerDealerId: dealerId,
      demandId: m.demandId,
      candidateMatchId: m.id,
      scoreBand: m.scoreBand,
      score: m.score,
    });
  }

  for (const m of sellerMatches) {
    if (!m.scoreBand || m.score == null) continue;
    await maybeOpportunityFromDemandForMyVehicle({
      sellerDealerId: dealerId,
      vehicleId: m.vehicleId,
      demandId: m.demandId,
      candidateMatchId: m.id,
      scoreBand: m.scoreBand,
      score: m.score,
    });
  }

  for (const i of buyerInterests) {
    await maybeOpportunityInterestWaiting({
      dealerId,
      interestId: i.id,
      title: "עניין ממתין לתגובה",
      demandId: i.demandId,
      vehicleId: i.candidateMatch.vehicleId,
    });
  }

  for (const o of sellerOpps) {
    await maybeOpportunityInterestWaiting({
      dealerId,
      interestId: `seller-opp:${o.id}`,
      title: "עניין על הרכב שלך ממתין",
      demandId: o.buyerInterest.demandId,
      vehicleId: o.vehicleId,
    });
  }

  for (const m of mutuals) {
    await maybeOpportunityMutual({
      dealerId,
      mutualId: m.id,
      title: "יש עניין הדדי — אפשר לחשוף",
      demandId: m.sellerInterest.opportunity.buyerInterest.demandId,
      vehicleId: m.sellerInterest.opportunity.vehicleId,
    });
  }

  for (const v of privateVehicles.slice(0, 8)) {
    const { matchPrivateVehicleToMyDemands } = await import(
      "@/services/matching/private-matching"
    );
    const result = await matchPrivateVehicleToMyDemands({
      dealerId,
      vehicleId: v.id,
    });
    if (!result.ok) continue;
    for (const hit of result.matches.slice(0, 3)) {
      await maybeOpportunityFromPrivateCandidate({
        dealerId,
        vehicleId: v.id,
        demandId: hit.demandId,
        customerId: hit.customerId ?? null,
        score: hit.score ?? 0,
      });
    }
  }

  return {
    ok: true as const,
    buyerMatches: buyerMatches.length,
    sellerMatches: sellerMatches.length,
    privateVehicles: privateVehicles.length,
    mutuals: mutuals.length,
  };
}

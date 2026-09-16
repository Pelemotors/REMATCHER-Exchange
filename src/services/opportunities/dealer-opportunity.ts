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

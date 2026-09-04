/**
 * Exchange Case + outcome axes (relevance vs transaction).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  ExchangeEvidenceType,
  OutcomeReasonCategory,
  RelevanceOutcome,
  TransactionOutcome,
  Prisma,
} from "@prisma/client";
import { toPrismaJson } from "@/lib/prisma-json";

export async function upsertMatchExchangeCase(params: {
  dealerId?: string | null;
  demandId?: string | null;
  vehicleId?: string | null;
  candidateMatchId: string;
  searchIntentVersionId?: string | null;
  demandSnapshot?: unknown;
  vehicleSnapshot?: unknown;
  matchEvaluationSnapshot?: unknown;
  searchIntentSnapshot?: unknown;
  rationale?: string | null;
}) {
  const existing = await prisma.exchangeCase.findFirst({
    where: {
      candidateMatchId: params.candidateMatchId,
      caseType: "MATCH",
      closedAt: null,
    },
  });
  const data = {
    caseType: "MATCH",
    dealerId: params.dealerId ?? null,
    demandId: params.demandId ?? null,
    vehicleId: params.vehicleId ?? null,
    candidateMatchId: params.candidateMatchId,
    searchIntentVersionId: params.searchIntentVersionId ?? null,
    demandSnapshot: params.demandSnapshot
      ? (toPrismaJson(params.demandSnapshot) as Prisma.InputJsonValue)
      : undefined,
    vehicleSnapshot: params.vehicleSnapshot
      ? (toPrismaJson(stripVehiclePii(params.vehicleSnapshot)) as Prisma.InputJsonValue)
      : undefined,
    matchEvaluationSnapshot: params.matchEvaluationSnapshot
      ? (toPrismaJson(params.matchEvaluationSnapshot) as Prisma.InputJsonValue)
      : undefined,
    searchIntentSnapshot: params.searchIntentSnapshot
      ? (toPrismaJson(params.searchIntentSnapshot) as Prisma.InputJsonValue)
      : undefined,
    rationale: params.rationale ?? null,
  };

  if (existing) {
    return prisma.exchangeCase.update({ where: { id: existing.id }, data });
  }
  return prisma.exchangeCase.create({ data });
}

function stripVehiclePii(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const s = { ...(snapshot as Record<string, unknown>) };
  delete s.dealerId;
  delete s.dealer;
  delete s.phone;
  delete s.contactName;
  delete s.businessName;
  return s;
}

export async function closeExchangeCaseOutcome(params: {
  caseId?: string;
  candidateMatchId?: string;
  relevanceOutcome: RelevanceOutcome;
  transactionOutcome: TransactionOutcome;
  outcomeReasonCategory?: OutcomeReasonCategory;
  evidenceType?: ExchangeEvidenceType;
  rationale?: string;
}) {
  const row =
    (params.caseId
      ? await prisma.exchangeCase.findUnique({ where: { id: params.caseId } })
      : null) ??
    (params.candidateMatchId
      ? await prisma.exchangeCase.findFirst({
          where: { candidateMatchId: params.candidateMatchId, caseType: "MATCH" },
          orderBy: { createdAt: "desc" },
        })
      : null);
  if (!row) return null;

  return prisma.exchangeCase.update({
    where: { id: row.id },
    data: {
      relevanceOutcome: params.relevanceOutcome,
      transactionOutcome: params.transactionOutcome,
      outcomeReasonCategory: params.outcomeReasonCategory ?? "UNKNOWN",
      evidenceType: params.evidenceType ?? row.evidenceType,
      rationale: params.rationale ?? row.rationale,
      closedAt: new Date(),
    },
  });
}

/** Structured retrieval for Exchange Intelligence — no dealer identity. */
export async function retrieveRelevantCases(params: {
  make?: string | null;
  model?: string | null;
  limit?: number;
}) {
  const rows = await prisma.exchangeCase.findMany({
    where: {
      caseType: { in: ["MATCH", "EXTERNAL_INVENTORY"] },
      closedAt: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  const make = (params.make ?? "").toLowerCase();
  const model = (params.model ?? "").toLowerCase();
  const now = Date.now();
  return rows
    .map((row) => {
      const snap = (row.vehicleSnapshot ?? {}) as Record<string, unknown>;
      let score = 0;
      const ageDays =
        (now - row.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0.2, 1 - ageDays / 180);
      if (make && String(snap.make ?? "").toLowerCase() === make) score += 0.3;
      if (
        model &&
        String(snap.model ?? "")
          .toLowerCase()
          .includes(model)
      )
        score += 0.4;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit ?? 5)
    .map(({ row }) => ({
      id: row.id,
      caseType: row.caseType,
      relevanceOutcome: row.relevanceOutcome,
      transactionOutcome: row.transactionOutcome,
      outcomeReasonCategory: row.outcomeReasonCategory,
      vehicle: stripVehiclePii(row.vehicleSnapshot),
      rationale: row.rationale,
    }));
}


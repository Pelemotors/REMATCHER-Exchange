/**
 * Exchange Learning retrieval + simple distillation (no causation claims).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { toPrismaJson } from "@/lib/prisma-json";

export async function retrieveRelevantLearnings(params: {
  make?: string | null;
  model?: string | null;
  limit?: number;
}) {
  const now = new Date();
  const rows = await prisma.exchangeLearning.findMany({
    where: {
      status: { in: ["ACTIVE", "WEAKENED"] },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    orderBy: [{ confidence: "desc" }, { lastEvaluatedAt: "desc" }],
    take: 40,
  });

  const make = (params.make ?? "").toLowerCase();
  const model = (params.model ?? "").toLowerCase();
  const scored = rows
    .map((row) => {
      const ctx = (row.segmentContext ?? {}) as Record<string, unknown>;
      let score = row.confidence;
      // Time decay: older lastEvaluatedAt loses relevance
      if (row.lastEvaluatedAt) {
        const ageDays =
          (now.getTime() - row.lastEvaluatedAt.getTime()) / (1000 * 60 * 60 * 24);
        score *= Math.max(0.3, 1 - ageDays / 365);
      }
      const segMake = String(ctx.make ?? "").toLowerCase();
      const segModel = String(ctx.model ?? "").toLowerCase();
      if (make && segMake && segMake === make) score += 0.15;
      if (model && segModel && (segModel.includes(model) || model.includes(segModel)))
        score += 0.2;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit ?? 5);

  return scored.map((s) => s.row);
}

export async function distillLearningFromCases(params: {
  topic: string;
  learningType: string;
  summary: string;
  segmentContext?: Record<string, unknown>;
  supportingCaseIds: string[];
  confidence?: number;
  dealerId?: string | null;
}) {
  if (params.supportingCaseIds.length < 2) {
    return {
      ok: false as const,
      reason: "Need at least 2 supporting cases — refuse single-anecdote learning",
    };
  }

  if (params.dealerId) {
    const { mayUseExchangeActivityForLearning } = await import(
      "@/services/privacy/policy"
    );
    const allowed = await mayUseExchangeActivityForLearning(params.dealerId);
    if (!allowed) {
      return {
        ok: false as const,
        reason: "exchange_activity_learning_consent_off",
      };
    }
  }

  const eligible = await prisma.exchangeCase.count({
    where: {
      id: { in: params.supportingCaseIds },
      learningEligible: true,
    },
  });
  if (eligible < 2) {
    return {
      ok: false as const,
      reason: "Need at least 2 learning-eligible supporting cases",
    };
  }

  const existing = await prisma.exchangeLearning.findFirst({
    where: { topic: params.topic, learningType: params.learningType, status: "ACTIVE" },
  });

  if (existing) {
    const updated = await prisma.exchangeLearning.update({
      where: { id: existing.id },
      data: {
        summary: params.summary,
        supportCount: params.supportingCaseIds.length,
        supportingCaseIds: toPrismaJson(params.supportingCaseIds) as Prisma.InputJsonValue,
        segmentContext: params.segmentContext
          ? (toPrismaJson(params.segmentContext) as Prisma.InputJsonValue)
          : undefined,
        confidence: Math.min(
          0.75,
          params.confidence ?? Math.min(0.55, 0.25 + params.supportingCaseIds.length * 0.08)
        ),
        lastEvaluatedAt: new Date(),
      },
    });
    return { ok: true as const, learning: updated };
  }

  const created = await prisma.exchangeLearning.create({
    data: {
      topic: params.topic,
      learningType: params.learningType,
      summary: params.summary,
      segmentContext: params.segmentContext
        ? (toPrismaJson(params.segmentContext) as Prisma.InputJsonValue)
        : undefined,
      supportingCaseIds: toPrismaJson(params.supportingCaseIds) as Prisma.InputJsonValue,
      supportCount: params.supportingCaseIds.length,
      confidence: Math.min(
        0.55,
        params.confidence ?? 0.25 + params.supportingCaseIds.length * 0.08
      ),
      lastEvaluatedAt: new Date(),
      status: "ACTIVE",
      dealerId: params.dealerId ?? null,
    },
  });
  return { ok: true as const, learning: created };
}

export function privacySafeLearningProjection(learning: {
  id: string;
  topic: string;
  learningType: string;
  summary: string;
  confidence: number;
  segmentContext: unknown;
  status: string;
}) {
  return {
    id: learning.id,
    topic: learning.topic,
    learningType: learning.learningType,
    summary: learning.summary,
    confidence: learning.confidence,
    status: learning.status,
    segment: learning.segmentContext,
  };
}

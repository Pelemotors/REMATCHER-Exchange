import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";

export type CanonicalAliasDimension =
  | "make"
  | "model"
  | "fuelType"
  | "engineDisplacementCc"
  | "ownershipHand"
  | "ownershipType"
  | "feature";

type AliasInsight = {
  kind: "canonical_alias";
  dimension: CanonicalAliasDimension;
  rawValue: string;
  canonicalValue: string;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  source: "exchange_ai";
};

function normalizedRawKey(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function canonicalKey(dimension: CanonicalAliasDimension, rawValue: string): string {
  return `canonical_alias:${dimension}:${normalizedRawKey(rawValue)}`.slice(0, 240);
}

function insightOf(value: unknown): AliasInsight | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.kind !== "canonical_alias" || typeof v.dimension !== "string" || typeof v.rawValue !== "string" || typeof v.canonicalValue !== "string") return null;
  const approvalStatus = v.approvalStatus;
  if (approvalStatus !== "PENDING" && approvalStatus !== "APPROVED" && approvalStatus !== "REJECTED") return null;
  return {
    kind: "canonical_alias",
    dimension: v.dimension as CanonicalAliasDimension,
    rawValue: v.rawValue,
    canonicalValue: v.canonicalValue,
    approvalStatus,
    source: "exchange_ai",
  };
}

async function dealerIdForUser(userId?: string | null): Promise<string | null> {
  if (!userId) return null;
  const membership = await prisma.dealerMembership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { dealerId: true },
  });
  return membership?.dealerId ?? null;
}

/** Stores AI-observed mappings as PENDING evidence only. Never auto-approves. */
export async function recordCanonicalAliasCandidate(params: {
  dealerId: string;
  dimension: CanonicalAliasDimension;
  rawValue: string | number | null | undefined;
  canonicalValue: string | number | null | undefined;
  confidence?: number | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
}) {
  if (params.rawValue == null || params.canonicalValue == null) return null;
  const rawValue = String(params.rawValue).trim();
  const canonicalValue = String(params.canonicalValue).trim();
  if (!rawValue || !canonicalValue) return null;
  if (normalizedRawKey(rawValue) === normalizedRawKey(canonicalValue)) return null;

  const key = canonicalKey(params.dimension, rawValue);
  const existing = await prisma.exchangeLearning.findUnique({
    where: { dealerId_canonicalKey: { dealerId: params.dealerId, canonicalKey: key } },
  });
  const existingInsight = insightOf(existing?.structuredInsight);
  const approvalStatus = existingInsight?.approvalStatus ?? "PENDING";
  const confidence = Math.max(0, Math.min(1, params.confidence ?? 0.7));

  return prisma.exchangeLearning.upsert({
    where: { dealerId_canonicalKey: { dealerId: params.dealerId, canonicalKey: key } },
    create: {
      dealerId: params.dealerId,
      learningType: "CANONICAL_ALIAS_CANDIDATE",
      topic: "canonical_alias",
      content: `${rawValue} → ${canonicalValue}`,
      summary: `AI normalized ${params.dimension}`,
      structuredInsight: toPrismaJson({
        kind: "canonical_alias",
        dimension: params.dimension,
        rawValue,
        canonicalValue,
        approvalStatus,
        source: "exchange_ai",
      } satisfies AliasInsight),
      confidence,
      sourceEventType: "AI_NORMALIZATION",
      sourceEntityType: params.sourceEntityType ?? null,
      sourceEntityId: params.sourceEntityId ?? null,
      canonicalKey: key,
      supportCount: 1,
      lastConfirmedAt: new Date(),
    },
    update: {
      content: `${rawValue} → ${canonicalValue}`,
      structuredInsight: toPrismaJson({
        kind: "canonical_alias",
        dimension: params.dimension,
        rawValue,
        canonicalValue,
        approvalStatus,
        source: "exchange_ai",
      } satisfies AliasInsight),
      confidence: Math.max(existing?.confidence ?? 0, confidence),
      supportCount: { increment: 1 },
      lastConfirmedAt: new Date(),
      sourceEntityType: params.sourceEntityType ?? existing?.sourceEntityType ?? null,
      sourceEntityId: params.sourceEntityId ?? existing?.sourceEntityId ?? null,
    },
  });
}

/** Non-blocking helper for AI boundaries that only know the authenticated user. */
export async function recordCanonicalAliasForUser(params: {
  userId?: string | null;
  dimension: CanonicalAliasDimension;
  rawValue: string | number | null | undefined;
  canonicalValue: string | number | null | undefined;
  confidence?: number | null;
}) {
  const dealerId = await dealerIdForUser(params.userId);
  if (!dealerId) return null;
  return recordCanonicalAliasCandidate({ ...params, dealerId });
}

/** Approved aliases are context for AI only; they never bypass AI semantic interpretation. */
export async function getApprovedCanonicalAliasContext(params: {
  dealerId: string;
  dimension?: CanonicalAliasDimension;
  limit?: number;
}): Promise<string[]> {
  const rows = await prisma.exchangeLearning.findMany({
    where: { dealerId: params.dealerId, topic: "canonical_alias", status: "ACTIVE" },
    orderBy: [{ supportCount: "desc" }, { confidence: "desc" }],
    take: Math.min(Math.max(params.limit ?? 30, 1), 100),
  });
  return rows.flatMap((row) => {
    const insight = insightOf(row.structuredInsight);
    if (!insight || insight.approvalStatus !== "APPROVED") return [];
    if (params.dimension && insight.dimension !== params.dimension) return [];
    return [`${insight.dimension}: ${insight.rawValue} -> ${insight.canonicalValue}`];
  });
}

export async function getApprovedCanonicalAliasContextForUser(params: {
  userId?: string | null;
  dimension?: CanonicalAliasDimension;
  limit?: number;
}): Promise<string[]> {
  const dealerId = await dealerIdForUser(params.userId);
  if (!dealerId) return [];
  return getApprovedCanonicalAliasContext({ dealerId, dimension: params.dimension, limit: params.limit });
}

/** Explicit approval hook. Candidates cannot become active semantic knowledge without this step. */
export async function approveCanonicalAliasLearning(params: { dealerId: string; learningId: string }) {
  const row = await prisma.exchangeLearning.findFirst({ where: { id: params.learningId, dealerId: params.dealerId, topic: "canonical_alias" } });
  if (!row) return { ok: false as const, error: "not_found" as const };
  const insight = insightOf(row.structuredInsight);
  if (!insight) return { ok: false as const, error: "invalid_learning" as const };
  const updated = await prisma.exchangeLearning.update({
    where: { id: row.id },
    data: {
      learningType: "CANONICAL_ALIAS_APPROVED",
      structuredInsight: toPrismaJson({ ...insight, approvalStatus: "APPROVED" } satisfies AliasInsight),
      lastConfirmedAt: new Date(),
    },
  });
  return { ok: true as const, learning: updated };
}

/**
 * Exchange Event emission — idempotent, privacy-aware append log.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  ExchangeEvidenceType,
  ExchangePrivacyClass,
  Prisma,
} from "@prisma/client";
import { toPrismaJson } from "@/lib/prisma-json";
import {
  sanitizeExchangePayload,
  scrubProhibitedText,
} from "@/services/privacy/sanitizer";

export type EmitExchangeEventInput = {
  eventType: string;
  occurredAt?: Date;
  evidenceType?: ExchangeEvidenceType;
  confidence?: number;
  evidenceNote?: string | null;
  dealerId?: string | null;
  vehicleId?: string | null;
  demandId?: string | null;
  candidateMatchId?: string | null;
  eventData?: Record<string, unknown> | null;
  reason?: string | null;
  privacyClass?: ExchangePrivacyClass;
  idempotencyKey?: string | null;
  /** Skip optional-learning consent (operational system events). Default true for SYSTEM. */
  operational?: boolean;
};

export async function emitExchangeEvent(
  input: EmitExchangeEventInput,
  db: {
    exchangeEvent: {
      findUnique: typeof prisma.exchangeEvent.findUnique;
      create: typeof prisma.exchangeEvent.create;
    };
  } = prisma
) {
  if (input.idempotencyKey) {
    const existing = await db.exchangeEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
  }

  const note = input.evidenceNote
    ? scrubProhibitedText(input.evidenceNote)
    : null;
  const eventData = input.eventData
    ? sanitizeExchangePayload(input.eventData)
    : null;

  try {
    return await db.exchangeEvent.create({
      data: {
        eventType: input.eventType,
        occurredAt: input.occurredAt ?? new Date(),
        evidenceType: input.evidenceType ?? "SYSTEM_OBSERVED",
        confidence: input.confidence ?? 1,
        evidenceNote: note,
        dealerId: input.dealerId ?? null,
        vehicleId: input.vehicleId ?? null,
        demandId: input.demandId ?? null,
        candidateMatchId: input.candidateMatchId ?? null,
        eventData: eventData
          ? (toPrismaJson(eventData) as Prisma.InputJsonValue)
          : undefined,
        reason: input.reason ?? null,
        privacyClass: input.privacyClass ?? "DEALER_SCOPED",
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  } catch (err: unknown) {
    if (
      input.idempotencyKey &&
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return db.exchangeEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
    }
    throw err;
  }
}

export async function reportDealerBusinessEvent(params: {
  dealerId: string;
  eventType: string;
  vehicleId?: string | null;
  demandId?: string | null;
  candidateMatchId?: string | null;
  eventData?: Record<string, unknown>;
  evidenceNote?: string;
  reason?: string;
}) {
  const { mayDeriveAgentExchangeEvent } = await import(
    "@/services/privacy/policy"
  );
  const allowed = await mayDeriveAgentExchangeEvent(
    params.dealerId,
    params.eventType
  );
  if (!allowed) {
    return {
      blocked: true as const,
      reason: "optional_learning_consent_off",
      eventType: params.eventType,
    };
  }

  // Never infer VEHICLE_SOLD from removal — caller must choose eventType explicitly.
  const event = await emitExchangeEvent({
    eventType: params.eventType,
    dealerId: params.dealerId,
    vehicleId: params.vehicleId,
    demandId: params.demandId,
    candidateMatchId: params.candidateMatchId,
    evidenceType: "DEALER_REPORTED",
    confidence: 0.7,
    evidenceNote: params.evidenceNote ?? null,
    reason: params.reason ?? null,
    eventData: params.eventData ?? null,
    privacyClass: "DEALER_SCOPED",
    idempotencyKey: `dealer-report:${params.dealerId}:${params.eventType}:${params.vehicleId ?? ""}:${params.demandId ?? ""}:${params.candidateMatchId ?? ""}`,
  });
  return { blocked: false as const, event };
}

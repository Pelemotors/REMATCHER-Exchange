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
};

export async function emitExchangeEvent(input: EmitExchangeEventInput) {
  if (input.idempotencyKey) {
    const existing = await prisma.exchangeEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
  }

  try {
    return await prisma.exchangeEvent.create({
      data: {
        eventType: input.eventType,
        occurredAt: input.occurredAt ?? new Date(),
        evidenceType: input.evidenceType ?? "SYSTEM_OBSERVED",
        confidence: input.confidence ?? 1,
        evidenceNote: input.evidenceNote ?? null,
        dealerId: input.dealerId ?? null,
        vehicleId: input.vehicleId ?? null,
        demandId: input.demandId ?? null,
        candidateMatchId: input.candidateMatchId ?? null,
        eventData: input.eventData
          ? (toPrismaJson(sanitizeEventData(input.eventData)) as Prisma.InputJsonValue)
          : undefined,
        reason: input.reason ?? null,
        privacyClass: input.privacyClass ?? "DEALER_SCOPED",
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  } catch (err: unknown) {
    // Unique idempotency race
    if (
      input.idempotencyKey &&
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return prisma.exchangeEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
    }
    throw err;
  }
}

/** Strip secrets / PII-looking keys from event payloads */
function sanitizeEventData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const blocked = new Set([
    "password",
    "token",
    "phone",
    "email",
    "contactName",
    "businessName",
    "address",
    "conversation",
    "transcript",
    "dealerMemory",
    "rawConversation",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (blocked.has(k)) continue;
    out[k] = v;
  }
  return out;
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
  // Never infer VEHICLE_SOLD from removal — caller must choose eventType explicitly.
  return emitExchangeEvent({
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
    idempotencyKey: `dealer-report:${params.dealerId}:${params.eventType}:${params.vehicleId ?? ""}:${params.candidateMatchId ?? ""}:${params.evidenceNote?.slice(0, 40) ?? Date.now()}`,
  });
}

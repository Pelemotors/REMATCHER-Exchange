import "server-only";
import { prisma } from "@/lib/prisma";
import { commitOneCandidate } from "@/services/intake/commit";
import { emitExchangeEvent } from "@/services/exchange/events";
import {
  INTENT_TO_RELATIONSHIP,
  intentFromButton,
  parseIntakeIntentText,
  type IntakeIntentKind,
} from "@/services/intake/intent";

export function orderIntakeCandidates<T extends { id: string; createdAt?: Date }>(
  candidates: Array<
    T & {
      media?: Array<{ sortOrder?: number; media?: { originalOrder?: number } }>;
    }
  >
): T[] {
  return [...candidates].sort((a, b) => {
    const ao =
      a.media?.[0]?.media?.originalOrder ?? a.media?.[0]?.sortOrder ?? 0;
    const bo =
      b.media?.[0]?.media?.originalOrder ?? b.media?.[0]?.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    const at = a.createdAt ? a.createdAt.getTime() : 0;
    const bt = b.createdAt ? b.createdAt.getTime() : 0;
    return at - bt;
  });
}

export async function applyCandidateIntent(input: {
  dealerId: string;
  candidateId: string;
  intent: IntakeIntentKind;
}) {
  const candidate = await prisma.vehicleCandidate.findFirst({
    where: { id: input.candidateId, dealerId: input.dealerId },
  });
  if (!candidate) return { ok: false as const, error: "not_found" as const };
  if (candidate.status === "REJECTED") {
    return { ok: false as const, error: "rejected" as const };
  }

  await prisma.vehicleCandidate.update({
    where: { id: candidate.id },
    data: { dealerIntent: input.intent },
  });

  await emitExchangeEvent({
    eventType: "intake.candidate.intent",
    dealerId: input.dealerId,
    eventData: {
      candidateId: candidate.id,
      batchId: candidate.batchId,
      intent: input.intent,
      relationship: INTENT_TO_RELATIONSHIP[input.intent],
    },
    operational: true,
  }).catch(() => undefined);

  if (candidate.status === "COMMITTED" && candidate.committedVehicleId) {
    await prisma.vehicle.update({
      where: { id: candidate.committedVehicleId },
      data: { dealerRelationship: INTENT_TO_RELATIONSHIP[input.intent] },
    });
    return {
      ok: true as const,
      vehicleId: candidate.committedVehicleId,
      intent: input.intent,
      idempotent: true as const,
    };
  }

  const committed = await commitOneCandidate(input.dealerId, candidate.id, {
    dealerRelationship: INTENT_TO_RELATIONSHIP[input.intent],
  });
  if (!committed.ok) {
    return { ok: false as const, error: committed.error };
  }
  return {
    ok: true as const,
    vehicleId: committed.vehicleId,
    intent: input.intent,
    idempotent: "idempotent" in committed ? committed.idempotent : false,
  };
}

export async function applyIntakeIntents(input: {
  dealerId: string;
  batchId: string;
  candidateId?: string;
  intent?: string;
  message?: string;
}) {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: input.batchId, dealerId: input.dealerId },
    include: {
      candidates: {
        include: {
          media: {
            include: { media: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
  if (!batch) return { ok: false as const, error: "not_found" as const };

  const ordered = orderIntakeCandidates(batch.candidates).filter(
    (c) => c.status !== "REJECTED"
  );
  const pending = ordered.filter((c) => !c.dealerIntent || c.status !== "COMMITTED");

  const results: Array<{
    candidateId: string;
    intent: IntakeIntentKind;
    ok: boolean;
    vehicleId?: string;
    error?: string;
  }> = [];

  async function applyOne(candidateId: string, intent: IntakeIntentKind) {
    const r = await applyCandidateIntent({
      dealerId: input.dealerId,
      candidateId,
      intent,
    });
    results.push({
      candidateId,
      intent,
      ok: r.ok,
      vehicleId: r.ok ? r.vehicleId ?? undefined : undefined,
      error: r.ok ? undefined : r.error,
    });
  }

  if (input.candidateId && input.intent) {
    const kind = intentFromButton(input.intent);
    if (!kind) return { ok: false as const, error: "invalid_intent" as const };
    await applyOne(input.candidateId, kind);
    return { ok: true as const, results };
  }

  const parsed = parseIntakeIntentText(input.message ?? input.intent ?? "");
  if (parsed.all) {
    for (const c of pending.length ? pending : ordered) {
      await applyOne(c.id, parsed.all);
    }
    return { ok: true as const, results };
  }

  const assigned = new Set<string>();
  for (const row of parsed.byIndex) {
    const c = ordered[row.index];
    if (!c) continue;
    await applyOne(c.id, row.intent);
    assigned.add(c.id);
  }

  if (parsed.rest) {
    for (const c of ordered) {
      if (assigned.has(c.id)) continue;
      if (c.status === "COMMITTED" && c.dealerIntent) continue;
      await applyOne(c.id, parsed.rest);
    }
  }

  if (results.length === 0 && parsed.focused) {
    const target =
      (input.candidateId
        ? ordered.find((c) => c.id === input.candidateId)
        : null) ??
      pending[0] ??
      ordered[0];
    if (target) await applyOne(target.id, parsed.focused);
  }

  if (results.length === 0) {
    return { ok: false as const, error: "unparsed_intent" as const };
  }
  return { ok: true as const, results };
}

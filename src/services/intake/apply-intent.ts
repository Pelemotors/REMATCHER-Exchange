import "server-only";
import { prisma } from "@/lib/prisma";
import { commitOneCandidate } from "@/services/intake/commit";
import { emitExchangeEvent } from "@/services/exchange/events";
import {
  INTENT_TO_RELATIONSHIP,
  intentFromButton,
  isDiscardIntent,
  parseIntakeIntentText,
  type IntakeIntentKind,
} from "@/services/intake/intent";
import { resolveIntakeCandidate } from "@/services/intake/review";
import { setVehicleRelationship } from "@/services/vehicles/relationship-visibility";
import { isReviewRelationship } from "@/services/vehicles/vehicle-capabilities";

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

export type IntakeIntentApplyOutcome =
  | "applied"
  | "already_applied"
  | "skipped"
  | "needs_attention"
  | "failed";

export type IntakeIntentResultItem = {
  candidateId: string;
  intent: IntakeIntentKind;
  outcome: IntakeIntentApplyOutcome;
  ok: boolean;
  vehicleId?: string;
  error?: string;
};

function mapApplyErrorToOutcome(
  error: string | undefined
): IntakeIntentApplyOutcome {
  if (error === "rejected") return "skipped";
  if (error === "needs_confirmation") return "needs_attention";
  return "failed";
}

export function summarizeIntentResults(results: IntakeIntentResultItem[]) {
  const appliedCount = results.filter((r) => r.outcome === "applied").length;
  const alreadyAppliedCount = results.filter(
    (r) => r.outcome === "already_applied"
  ).length;
  const needsAttentionCount = results.filter(
    (r) => r.outcome === "needs_attention"
  ).length;
  const failedCount = results.filter((r) => r.outcome === "failed").length;
  const skippedCount = results.filter((r) => r.outcome === "skipped").length;
  const requestedCount = results.length;

  const ok =
    appliedCount > 0 ||
    (requestedCount > 0 &&
      failedCount === 0 &&
      appliedCount +
        alreadyAppliedCount +
        skippedCount +
        needsAttentionCount ===
        requestedCount);

  return {
    ok,
    requestedCount,
    appliedCount,
    alreadyAppliedCount,
    needsAttentionCount,
    failedCount,
    results,
  };
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

  if (
    candidate.dealerIntent === input.intent &&
    candidate.status === "COMMITTED" &&
    candidate.committedVehicleId
  ) {
    return {
      ok: true as const,
      vehicleId: candidate.committedVehicleId,
      intent: input.intent,
      idempotent: true as const,
    };
  }

  // EXTERNAL is investigation-only: record intent, do not create inventory/workspace vehicle.
  if (input.intent === "EXTERNAL") {
    if (candidate.dealerIntent === "EXTERNAL") {
      return {
        ok: true as const,
        vehicleId: null,
        intent: input.intent,
        deferredCommit: true as const,
        idempotent: true as const,
      };
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
    return {
      ok: true as const,
      vehicleId: null,
      intent: input.intent,
      deferredCommit: true as const,
    };
  }

  if (candidate.status === "COMMITTED" && candidate.committedVehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: candidate.committedVehicleId,
        dealerId: input.dealerId,
      },
      select: { id: true, dealerRelationship: true },
    });
    if (!vehicle) return { ok: false as const, error: "not_found" as const };

    const nextRelationship = INTENT_TO_RELATIONSHIP[input.intent];
    if (vehicle.dealerRelationship === nextRelationship) {
      await prisma.vehicleCandidate.update({
        where: { id: candidate.id },
        data: { dealerIntent: input.intent },
      });
      return {
        ok: true as const,
        vehicleId: vehicle.id,
        intent: input.intent,
        idempotent: true as const,
      };
    }

    if (
      nextRelationship === "OWNED" &&
      isReviewRelationship(vehicle.dealerRelationship)
    ) {
      return {
        ok: false as const,
        error: "use_convert_owned" as const,
      };
    }

    const updated = await setVehicleRelationship({
      dealerId: input.dealerId,
      vehicleId: vehicle.id,
      relationship: nextRelationship,
    });
    if (!updated.ok) {
      return { ok: false as const, error: updated.error };
    }
    await prisma.vehicleCandidate.update({
      where: { id: candidate.id },
      data: { dealerIntent: input.intent },
    });
    return {
      ok: true as const,
      vehicleId: vehicle.id,
      intent: input.intent,
    };
  }

  const committed = await commitOneCandidate(input.dealerId, candidate.id, {
    dealerRelationship: INTENT_TO_RELATIONSHIP[input.intent],
  });
  if (!committed.ok) {
    return { ok: false as const, error: committed.error };
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

  const { intakePrincipalForDealer, recordIntentApplied } = await import(
    "@/services/conversation/intake-bridge"
  );
  const principal = await intakePrincipalForDealer(input.dealerId);
  if (principal) {
    await recordIntentApplied({
      principal,
      batchId: candidate.batchId,
      candidateId: candidate.id,
      intent: input.intent,
      vehicleId: committed.vehicleId,
    }).catch(() => undefined);
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

  const results: IntakeIntentResultItem[] = [];

  function pushResult(
    candidateId: string,
    intent: IntakeIntentKind,
    r:
      | { ok: true; vehicleId?: string | null; idempotent?: boolean }
      | { ok: false; error?: string }
  ) {
    if (r.ok) {
      const outcome = r.idempotent ? "already_applied" : "applied";
      results.push({
        candidateId,
        intent,
        outcome,
        ok: true,
        vehicleId: r.vehicleId ?? undefined,
      });
      return;
    }
    const outcome = mapApplyErrorToOutcome(r.error);
    results.push({
      candidateId,
      intent,
      outcome,
      ok: false,
      error: r.error,
    });
  }

  async function applyOne(candidateId: string, intent: IntakeIntentKind) {
    try {
      const r = await applyCandidateIntent({
        dealerId: input.dealerId,
        candidateId,
        intent,
      });
      pushResult(candidateId, intent, r);
    } catch (err) {
      results.push({
        candidateId,
        intent,
        outcome: "failed",
        ok: false,
        error: err instanceof Error ? err.message : "unexpected",
      });
    }
  }

  async function discardOne(candidateId: string) {
    try {
      const r = await resolveIntakeCandidate({
        dealerId: input.dealerId,
        candidateId,
        reject: true,
      });
      if (r.ok) {
        results.push({
          candidateId,
          intent: "EXTERNAL",
          outcome: "skipped",
          ok: true,
        });
      } else {
        results.push({
          candidateId,
          intent: "EXTERNAL",
          outcome: "failed",
          ok: false,
          error: "reject_failed",
        });
      }
    } catch (err) {
      results.push({
        candidateId,
        intent: "EXTERNAL",
        outcome: "failed",
        ok: false,
        error: err instanceof Error ? err.message : "unexpected",
      });
    }
  }

  if (input.candidateId && isDiscardIntent(input.intent)) {
    await discardOne(input.candidateId);
    return summarizeIntentResults(results);
  }

  if (input.candidateId && input.intent) {
    const kind = intentFromButton(input.intent);
    if (!kind) return { ok: false as const, error: "invalid_intent" as const };
    await applyOne(input.candidateId, kind);
    return summarizeIntentResults(results);
  }

  const parsed = parseIntakeIntentText(input.message ?? input.intent ?? "");
  if (parsed.discard) {
    const target =
      (input.candidateId
        ? ordered.find((c) => c.id === input.candidateId)
        : null) ?? pending[0];
    if (target) await discardOne(target.id);
    return results.length
      ? summarizeIntentResults(results)
      : { ok: false as const, error: "unparsed_intent" as const };
  }

  if (parsed.allExceptLast) {
    const list = pending.length ? pending : ordered;
    for (let i = 0; i < list.length - 1; i++) {
      await applyOne(list[i]!.id, parsed.allExceptLast);
    }
    return summarizeIntentResults(results);
  }

  if (parsed.all) {
    for (const c of pending.length ? pending : ordered) {
      await applyOne(c.id, parsed.all);
    }
    return summarizeIntentResults(results);
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

  if (parsed.focused) {
    const msg = `${input.message ?? ""} ${input.intent ?? ""}`;
    for (const c of ordered) {
      if (assigned.has(c.id)) continue;
      const gov = (c as { govIdentityJson?: { make?: string | null; model?: string | null } | null })
        .govIdentityJson;
      const tokens = [gov?.make, gov?.model].filter(
        (t): t is string => typeof t === "string" && t.trim().length >= 2
      );
      if (
        tokens.some((t) =>
          new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(msg)
        )
      ) {
        await applyOne(c.id, parsed.focused);
        assigned.add(c.id);
      }
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
  return summarizeIntentResults(results);
}

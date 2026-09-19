import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { logEvent } from "@/services/events/log-event";
import { applyCandidateIntent } from "@/services/intake/apply-intent";
import {
  INTENT_TO_RELATIONSHIP,
  type IntakeIntentKind,
} from "@/services/intake/intent";
import {
  upsertSearchTargetFromCandidate,
  upsertSearchTargetFromVehicle,
} from "@/services/demand/search-target-intent";
import { retargetOpenDecision } from "@/services/decisions/vehicle-decision";
import { setVehicleRelationship } from "@/services/vehicles/relationship-visibility";
import type { DealerVehicleRelationship } from "@prisma/client";

export type DealerIntentKind = IntakeIntentKind | "SEARCH_TARGET";

const WORKSPACE_RELATIONSHIPS: DealerVehicleRelationship[] = [
  "OFFERED_TO_ME",
  "TRADE_IN_CANDIDATE",
  "EXTERNAL",
];

function relationshipForIntent(
  intent: DealerIntentKind
): DealerVehicleRelationship | null {
  if (intent === "SEARCH_TARGET") return null;
  return INTENT_TO_RELATIONSHIP[intent as IntakeIntentKind];
}

/**
 * Canonical dealer intent apply — intake candidates and committed vehicles.
 * Never promotes OFFERED/TRADE/EXTERNAL → OWNED without explicit OWNED intent.
 */
export async function setDealerIntent(input: {
  dealerId: string;
  candidateId?: string;
  vehicleId?: string;
  intent: DealerIntentKind;
}) {
  if (input.candidateId) {
    return setDealerIntentOnCandidate(input.dealerId, input.candidateId, input.intent);
  }
  if (input.vehicleId) {
    return setDealerIntentOnVehicle(input.dealerId, input.vehicleId, input.intent);
  }
  return { ok: false as const, error: "target_required" as const };
}

async function setDealerIntentOnCandidate(
  dealerId: string,
  candidateId: string,
  intent: DealerIntentKind
) {
  const candidate = await prisma.vehicleCandidate.findFirst({
    where: { id: candidateId, dealerId },
  });
  if (!candidate) return { ok: false as const, error: "not_found" as const };

  if (candidate.dealerIntent === intent) {
    if (intent === "SEARCH_TARGET") {
      const again = await upsertSearchTargetFromCandidate({
        dealerId,
        candidateId,
      });
      if (!again.ok) return again;
      await logEvent({
        eventType: "intent.apply",
        dealerId,
        entityType: "VehicleCandidate",
        entityId: candidateId,
        metadata: {
          intent,
          idempotent: true,
          demandId: again.demandId,
        },
      }).catch(() => undefined);
      return {
        ok: true as const,
        intent,
        demandId: again.demandId,
        idempotent: true as const,
      };
    }
    if (candidate.status === "COMMITTED" && candidate.committedVehicleId) {
      return {
        ok: true as const,
        intent,
        vehicleId: candidate.committedVehicleId,
        idempotent: true as const,
      };
    }
  }

  if (intent === "SEARCH_TARGET") {
    const demand = await upsertSearchTargetFromCandidate({
      dealerId,
      candidateId,
    });
    if (!demand.ok) return demand;
    await prisma.vehicleCandidate.update({
      where: { id: candidateId },
      data: {
        dealerIntent: "SEARCH_TARGET",
        status: "REJECTED",
        reviewStatus: "RESOLVED",
        commercialJson: toPrismaJson({
          ...((candidate.commercialJson ?? {}) as Record<string, unknown>),
          searchTargetDemandId: demand.demandId,
        }),
      },
    });
    await logEvent({
      eventType: "intent.apply",
      dealerId,
      entityType: "VehicleCandidate",
      entityId: candidateId,
      metadata: {
        intent,
        demandId: demand.demandId,
        createdDemand: !demand.idempotent,
      },
    }).catch(() => undefined);
    return {
      ok: true as const,
      intent,
      demandId: demand.demandId,
      idempotent: demand.idempotent,
    };
  }

  const r = await applyCandidateIntent({
    dealerId,
    candidateId,
    intent: intent as IntakeIntentKind,
  });
  if (r.ok) {
    await logEvent({
      eventType: "intent.apply",
      dealerId,
      entityType: "VehicleCandidate",
      entityId: candidateId,
      metadata: {
        intent,
        vehicleId: r.vehicleId ?? null,
        idempotent: "idempotent" in r ? r.idempotent : false,
      },
    }).catch(() => undefined);
  }
  return r;
}

async function setDealerIntentOnVehicle(
  dealerId: string,
  vehicleId: string,
  intent: DealerIntentKind
) {
  const v = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId },
  });
  if (!v) return { ok: false as const, error: "not_found" as const };

  if (intent === "SEARCH_TARGET") {
    const demand = await upsertSearchTargetFromVehicle({ dealerId, vehicleId });
    if (!demand.ok) return demand;
    await logEvent({
      eventType: "intent.apply",
      dealerId,
      entityType: "Vehicle",
      entityId: vehicleId,
      metadata: {
        intent,
        demandId: demand.demandId,
        idempotent: demand.idempotent ?? false,
      },
    }).catch(() => undefined);
    return {
      ok: true as const,
      intent,
      demandId: demand.demandId,
      idempotent: demand.idempotent,
    };
  }

  const relationship = relationshipForIntent(intent);
  if (!relationship) {
    return { ok: false as const, error: "invalid_intent" as const };
  }

  if (v.dealerRelationship === relationship) {
    await logEvent({
      eventType: "intent.apply",
      dealerId,
      entityType: "Vehicle",
      entityId: vehicleId,
      metadata: { intent, idempotent: true },
    }).catch(() => undefined);
    return {
      ok: true as const,
      intent,
      vehicleId,
      idempotent: true as const,
    };
  }

  if (
    relationship === "OWNED" &&
    WORKSPACE_RELATIONSHIPS.includes(v.dealerRelationship)
  ) {
    return { ok: false as const, error: "use_accept_decision" as const };
  }

  const currentReview =
    v.dealerRelationship === "OFFERED_TO_ME" ||
    v.dealerRelationship === "TRADE_IN_CANDIDATE";
  const nextReview =
    relationship === "OFFERED_TO_ME" || relationship === "TRADE_IN_CANDIDATE";
  if (currentReview && nextReview && v.dealerRelationship !== relationship) {
    const retargeted = await retargetOpenDecision({
      dealerId,
      vehicleId,
      type: relationship === "TRADE_IN_CANDIDATE" ? "TRADE" : "PURCHASE",
    });
    if (!retargeted.ok) return retargeted;
    await logEvent({
      eventType: "intent.apply",
      dealerId,
      entityType: "Vehicle",
      entityId: vehicleId,
      metadata: { intent, retargeted: true },
    }).catch(() => undefined);
    return { ok: true as const, intent, vehicleId };
  }

  if (
    WORKSPACE_RELATIONSHIPS.includes(relationship) &&
    (v.dealerRelationship === "OWNED" || v.dealerRelationship === "INVENTORY")
  ) {
    return { ok: false as const, error: "cannot_downgrade_inventory" as const };
  }

  const updated = await setVehicleRelationship({
    dealerId,
    vehicleId,
    relationship,
  });
  if (!updated.ok) return updated;

  await logEvent({
    eventType: "intent.apply",
    dealerId,
    entityType: "Vehicle",
    entityId: vehicleId,
    metadata: { intent, relationship },
  }).catch(() => undefined);

  return { ok: true as const, intent, vehicleId };
}

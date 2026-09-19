import "server-only";
import type {
  VehicleDecisionStatus,
  VehicleDecisionType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitExchangeEvent } from "@/services/exchange/events";
import { convertToOwnedInventory } from "@/services/vehicles/relationship-visibility";
import {
  isOwnedInventoryRelationship,
  isReviewRelationship,
} from "@/services/vehicles/vehicle-capabilities";

export type VehicleDecisionView = {
  id: string;
  dealerId: string;
  vehicleId: string;
  sourceCandidateId: string | null;
  type: VehicleDecisionType;
  status: VehicleDecisionStatus;
  incomingAskPrice: number | null;
  incomingAgreedPrice: number | null;
  outgoingVehicleId: string | null;
  outgoingAgreedPrice: number | null;
  openedAt: string;
  updatedAt: string;
  decidedAt: string | null;
  outgoingVehicle: {
    id: string;
    make: string | null;
    model: string | null;
    year: number | null;
  } | null;
};

export function decisionTypeForRelationship(
  relationship: string | null | undefined
): VehicleDecisionType | null {
  if (relationship === "OFFERED_TO_ME") return "PURCHASE";
  if (relationship === "TRADE_IN_CANDIDATE") return "TRADE";
  return null;
}

export function relationshipForDecisionType(
  type: VehicleDecisionType
): "OFFERED_TO_ME" | "TRADE_IN_CANDIDATE" {
  return type === "TRADE" ? "TRADE_IN_CANDIDATE" : "OFFERED_TO_ME";
}

export function toVehicleDecisionView(row: {
  id: string;
  dealerId: string;
  vehicleId: string;
  sourceCandidateId: string | null;
  type: VehicleDecisionType;
  status: VehicleDecisionStatus;
  incomingAskPrice: number | null;
  incomingAgreedPrice: number | null;
  outgoingVehicleId: string | null;
  outgoingAgreedPrice: number | null;
  openedAt: Date;
  updatedAt: Date;
  decidedAt: Date | null;
  outgoingVehicle?: {
    id: string;
    make: string | null;
    model: string | null;
    year: number | null;
  } | null;
}): VehicleDecisionView {
  return {
    id: row.id,
    dealerId: row.dealerId,
    vehicleId: row.vehicleId,
    sourceCandidateId: row.sourceCandidateId,
    type: row.type,
    status: row.status,
    incomingAskPrice: row.incomingAskPrice,
    incomingAgreedPrice: row.incomingAgreedPrice,
    outgoingVehicleId: row.outgoingVehicleId,
    outgoingAgreedPrice: row.outgoingAgreedPrice,
    openedAt: row.openedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    outgoingVehicle: row.outgoingVehicle
      ? {
          id: row.outgoingVehicle.id,
          make: row.outgoingVehicle.make,
          model: row.outgoingVehicle.model,
          year: row.outgoingVehicle.year,
        }
      : null,
  };
}

const outgoingInclude = {
  outgoingVehicle: {
    select: { id: true, make: true, model: true, year: true },
  },
} as const;

export async function getDecisionForVehicle(input: {
  dealerId: string;
  vehicleId: string;
}) {
  const row = await prisma.vehicleDecision.findUnique({
    where: {
      dealerId_vehicleId: {
        dealerId: input.dealerId,
        vehicleId: input.vehicleId,
      },
    },
    include: outgoingInclude,
  });
  return row ? toVehicleDecisionView(row) : null;
}

export async function getOpenDecisionForVehicle(input: {
  dealerId: string;
  vehicleId: string;
}) {
  const row = await getDecisionForVehicle(input);
  return row?.status === "OPEN" ? row : null;
}

/** Authority price for intelligence / display. Never b2b/retail. */
export function decisionAuthorityPrice(row: {
  incomingAgreedPrice?: number | null;
  incomingAskPrice?: number | null;
}): number | null {
  if (row.incomingAgreedPrice != null && row.incomingAgreedPrice > 0) {
    return row.incomingAgreedPrice;
  }
  if (row.incomingAskPrice != null && row.incomingAskPrice > 0) {
    return row.incomingAskPrice;
  }
  return null;
}

export async function loadDecisionAuthorityPrice(input: {
  dealerId: string;
  vehicleId: string;
}): Promise<number | null> {
  const row = await prisma.vehicleDecision.findUnique({
    where: {
      dealerId_vehicleId: {
        dealerId: input.dealerId,
        vehicleId: input.vehicleId,
      },
    },
    select: { incomingAgreedPrice: true, incomingAskPrice: true },
  });
  return row ? decisionAuthorityPrice(row) : null;
}

export async function openOrGetDecision(input: {
  dealerId: string;
  vehicleId: string;
  type: VehicleDecisionType;
  sourceCandidateId?: string | null;
  incomingAskPrice?: number | null;
}): Promise<{
  ok: true;
  decision: VehicleDecisionView;
  created: boolean;
  idempotent: boolean;
}> {
  const existing = await prisma.vehicleDecision.findUnique({
    where: {
      dealerId_vehicleId: {
        dealerId: input.dealerId,
        vehicleId: input.vehicleId,
      },
    },
    include: outgoingInclude,
  });
  if (existing) {
    return {
      ok: true,
      decision: toVehicleDecisionView(existing),
      created: false,
      idempotent: true,
    };
  }

  const seed =
    input.incomingAskPrice != null && input.incomingAskPrice > 0
      ? Math.round(input.incomingAskPrice)
      : null;

  const created = await prisma.vehicleDecision.create({
    data: {
      dealerId: input.dealerId,
      vehicleId: input.vehicleId,
      sourceCandidateId: input.sourceCandidateId ?? null,
      type: input.type,
      status: "OPEN",
      incomingAskPrice: seed,
    },
    include: outgoingInclude,
  });

  await emitExchangeEvent({
    eventType: "decision.opened",
    dealerId: input.dealerId,
    vehicleId: input.vehicleId,
    eventData: {
      decisionId: created.id,
      type: created.type,
      sourceCandidateId: created.sourceCandidateId,
    },
    operational: true,
    idempotencyKey: `decision.opened:${created.id}`,
  }).catch(() => undefined);

  return {
    ok: true,
    decision: toVehicleDecisionView(created),
    created: true,
    idempotent: false,
  };
}

export async function updateOpenDecision(input: {
  dealerId: string;
  vehicleId: string;
  incomingAskPrice?: number | null;
  incomingAgreedPrice?: number | null;
  outgoingVehicleId?: string | null;
  outgoingAgreedPrice?: number | null;
}) {
  const current = await prisma.vehicleDecision.findUnique({
    where: {
      dealerId_vehicleId: {
        dealerId: input.dealerId,
        vehicleId: input.vehicleId,
      },
    },
  });
  if (!current) return { ok: false as const, error: "not_found" as const };
  if (current.status !== "OPEN") {
    return { ok: false as const, error: "decision_terminal" as const };
  }

  const data: {
    incomingAskPrice?: number | null;
    incomingAgreedPrice?: number | null;
    outgoingVehicleId?: string | null;
    outgoingAgreedPrice?: number | null;
  } = {};

  if ("incomingAskPrice" in input) {
    data.incomingAskPrice = normalizePrice(input.incomingAskPrice);
  }
  if ("incomingAgreedPrice" in input) {
    data.incomingAgreedPrice = normalizePrice(input.incomingAgreedPrice);
  }
  if ("outgoingAgreedPrice" in input) {
    data.outgoingAgreedPrice = normalizePrice(input.outgoingAgreedPrice);
  }
  if ("outgoingVehicleId" in input) {
    if (input.outgoingVehicleId) {
      const linked = await assertOutgoingVehicleEligible({
        dealerId: input.dealerId,
        incomingVehicleId: input.vehicleId,
        outgoingVehicleId: input.outgoingVehicleId,
      });
      if (!linked.ok) return linked;
    }
    data.outgoingVehicleId = input.outgoingVehicleId ?? null;
  }

  const updated = await prisma.vehicleDecision.update({
    where: { id: current.id },
    data,
    include: outgoingInclude,
  });

  await emitExchangeEvent({
    eventType: "decision.updated",
    dealerId: input.dealerId,
    vehicleId: input.vehicleId,
    eventData: {
      decisionId: updated.id,
      incomingAskPrice: updated.incomingAskPrice,
      incomingAgreedPrice: updated.incomingAgreedPrice,
      outgoingVehicleId: updated.outgoingVehicleId,
    },
    operational: true,
  }).catch(() => undefined);

  return { ok: true as const, decision: toVehicleDecisionView(updated) };
}

export async function retargetOpenDecision(input: {
  dealerId: string;
  vehicleId: string;
  type: VehicleDecisionType;
}) {
  const current = await prisma.vehicleDecision.findUnique({
    where: {
      dealerId_vehicleId: {
        dealerId: input.dealerId,
        vehicleId: input.vehicleId,
      },
    },
    include: outgoingInclude,
  });
  if (!current) return { ok: false as const, error: "not_found" as const };
  if (current.status !== "OPEN") {
    return { ok: false as const, error: "decision_terminal" as const };
  }
  if (current.type === input.type) {
    return {
      ok: true as const,
      decision: toVehicleDecisionView(current),
      idempotent: true as const,
    };
  }

  const nextRel = relationshipForDecisionType(input.type);
  const updated = await prisma.vehicleDecision.update({
    where: { id: current.id },
    data: {
      type: input.type,
      outgoingVehicleId: input.type === "PURCHASE" ? null : current.outgoingVehicleId,
    },
    include: outgoingInclude,
  });
  await prisma.vehicle.update({
    where: { id: input.vehicleId },
    data: { dealerRelationship: nextRel, visibility: "PRIVATE" },
  });

  await emitExchangeEvent({
    eventType: "decision.updated",
    dealerId: input.dealerId,
    vehicleId: input.vehicleId,
    eventData: {
      decisionId: updated.id,
      type: updated.type,
      retargeted: true,
    },
    operational: true,
  }).catch(() => undefined);

  return {
    ok: true as const,
    decision: toVehicleDecisionView(updated),
    idempotent: false as const,
  };
}

export async function acceptDecision(input: {
  dealerId: string;
  vehicleId: string;
  incomingAgreedPrice?: number | null;
  outgoingVehicleId?: string | null;
  outgoingAgreedPrice?: number | null;
}) {
  const current = await prisma.vehicleDecision.findUnique({
    where: {
      dealerId_vehicleId: {
        dealerId: input.dealerId,
        vehicleId: input.vehicleId,
      },
    },
    include: outgoingInclude,
  });
  if (!current) return { ok: false as const, error: "not_found" as const };
  if (current.status === "ACCEPTED") {
    return {
      ok: true as const,
      decision: toVehicleDecisionView(current),
      idempotent: true as const,
    };
  }
  if (current.status === "DECLINED") {
    return { ok: false as const, error: "decision_declined" as const };
  }

  if (input.outgoingVehicleId) {
    const linked = await assertOutgoingVehicleEligible({
      dealerId: input.dealerId,
      incomingVehicleId: input.vehicleId,
      outgoingVehicleId: input.outgoingVehicleId,
    });
    if (!linked.ok) return linked;
  }

  const agreed = normalizePrice(
    input.incomingAgreedPrice ?? current.incomingAgreedPrice
  );
  const outgoingId = input.outgoingVehicleId ?? current.outgoingVehicleId;
  const outgoingPrice = normalizePrice(
    input.outgoingAgreedPrice ?? current.outgoingAgreedPrice
  );

  if (agreed == null) {
    return { ok: false as const, error: "agreed_price_required" as const };
  }
  if (current.type === "TRADE") {
    if (!outgoingId) {
      return { ok: false as const, error: "outgoing_vehicle_required" as const };
    }
    const linked = await assertOutgoingVehicleEligible({
      dealerId: input.dealerId,
      incomingVehicleId: input.vehicleId,
      outgoingVehicleId: outgoingId,
    });
    if (!linked.ok) return linked;
  }

  const converted = await convertToOwnedInventory({
    dealerId: input.dealerId,
    vehicleId: input.vehicleId,
  });
  if (!converted.ok) return converted;

  const updated = await prisma.vehicleDecision.update({
    where: { id: current.id },
    data: {
      status: "ACCEPTED",
      decidedAt: new Date(),
      incomingAgreedPrice: agreed,
      outgoingVehicleId: current.type === "TRADE" ? outgoingId : current.outgoingVehicleId,
      outgoingAgreedPrice: current.type === "TRADE" ? outgoingPrice : current.outgoingAgreedPrice,
    },
    include: outgoingInclude,
  });

  await emitExchangeEvent({
    eventType: "decision.accepted",
    dealerId: input.dealerId,
    vehicleId: input.vehicleId,
    eventData: {
      decisionId: updated.id,
      type: updated.type,
      incomingAgreedPrice: updated.incomingAgreedPrice,
      outgoingVehicleId: updated.outgoingVehicleId,
      outgoingAutoSold: false,
    },
    operational: true,
    idempotencyKey: `decision.accepted:${updated.id}`,
  }).catch(() => undefined);

  return {
    ok: true as const,
    decision: toVehicleDecisionView(updated),
    vehicle: converted.vehicle,
    idempotent: false as const,
  };
}

export async function declineDecision(input: {
  dealerId: string;
  vehicleId: string;
}) {
  const current = await prisma.vehicleDecision.findUnique({
    where: {
      dealerId_vehicleId: {
        dealerId: input.dealerId,
        vehicleId: input.vehicleId,
      },
    },
    include: outgoingInclude,
  });
  if (!current) return { ok: false as const, error: "not_found" as const };
  if (current.status === "DECLINED") {
    return {
      ok: true as const,
      decision: toVehicleDecisionView(current),
      idempotent: true as const,
    };
  }
  if (current.status === "ACCEPTED") {
    return { ok: false as const, error: "decision_accepted" as const };
  }

  const updated = await prisma.vehicleDecision.update({
    where: { id: current.id },
    data: { status: "DECLINED", decidedAt: new Date() },
    include: outgoingInclude,
  });

  await emitExchangeEvent({
    eventType: "decision.declined",
    dealerId: input.dealerId,
    vehicleId: input.vehicleId,
    eventData: { decisionId: updated.id, type: updated.type },
    operational: true,
    idempotencyKey: `decision.declined:${updated.id}`,
  }).catch(() => undefined);

  return {
    ok: true as const,
    decision: toVehicleDecisionView(updated),
    idempotent: false as const,
  };
}

export async function persistDecisionPrice(input: {
  dealerId: string;
  vehicleId: string;
  price: number;
  field?: "incomingAskPrice" | "incomingAgreedPrice";
}): Promise<number | null> {
  const price = normalizePrice(input.price);
  if (price == null) return null;
  const current = await prisma.vehicleDecision.findUnique({
    where: {
      dealerId_vehicleId: {
        dealerId: input.dealerId,
        vehicleId: input.vehicleId,
      },
    },
    select: { id: true, status: true, type: true },
  });
  if (!current || current.status !== "OPEN") return null;
  const field =
    input.field ??
    (current.type === "TRADE" ? "incomingAgreedPrice" : "incomingAskPrice");
  await prisma.vehicleDecision.update({
    where: { id: current.id },
    data: { [field]: price },
  });
  await emitExchangeEvent({
    eventType: "decision.updated",
    dealerId: input.dealerId,
    vehicleId: input.vehicleId,
    eventData: { decisionId: current.id, [field]: price },
    operational: true,
  }).catch(() => undefined);
  return price;
}

export async function backfillOpenVehicleDecisions(): Promise<{
  created: number;
  skipped: number;
}> {
  const vehicles = await prisma.vehicle.findMany({
    where: {
      status: "ACTIVE",
      dealerRelationship: { in: ["OFFERED_TO_ME", "TRADE_IN_CANDIDATE"] },
    },
    select: {
      id: true,
      dealerId: true,
      dealerRelationship: true,
    },
  });

  let created = 0;
  let skipped = 0;
  for (const vehicle of vehicles) {
    const type = decisionTypeForRelationship(vehicle.dealerRelationship);
    if (!type) {
      skipped += 1;
      continue;
    }
    const candidate = await prisma.vehicleCandidate.findFirst({
      where: { committedVehicleId: vehicle.id, dealerId: vehicle.dealerId },
      select: { id: true, commercialJson: true },
    });
    const seed = reviewAskFromCommercial(candidate?.commercialJson);
    const result = await openOrGetDecision({
      dealerId: vehicle.dealerId,
      vehicleId: vehicle.id,
      type,
      sourceCandidateId: candidate?.id ?? null,
      incomingAskPrice: seed,
    });
    if (result.created) created += 1;
    else skipped += 1;
  }
  return { created, skipped };
}

export async function assertOutgoingVehicleEligible(input: {
  dealerId: string;
  incomingVehicleId: string;
  outgoingVehicleId: string;
}) {
  if (input.outgoingVehicleId === input.incomingVehicleId) {
    return { ok: false as const, error: "outgoing_same_as_incoming" as const };
  }
  const outgoing = await prisma.vehicle.findFirst({
    where: { id: input.outgoingVehicleId, dealerId: input.dealerId },
    select: { id: true, dealerRelationship: true, status: true },
  });
  if (!outgoing) {
    return { ok: false as const, error: "outgoing_not_found" as const };
  }
  if (outgoing.status !== "ACTIVE") {
    return { ok: false as const, error: "outgoing_not_active" as const };
  }
  if (!isOwnedInventoryRelationship(outgoing.dealerRelationship)) {
    return { ok: false as const, error: "outgoing_not_owned" as const };
  }
  if (isReviewRelationship(outgoing.dealerRelationship)) {
    return { ok: false as const, error: "outgoing_not_owned" as const };
  }
  return { ok: true as const, vehicle: outgoing };
}

function normalizePrice(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function reviewAskFromCommercial(commercial: unknown): number | null {
  if (!commercial || typeof commercial !== "object") return null;
  const row = commercial as Record<string, unknown>;
  for (const key of ["offeredPrice", "askingPrice"] as const) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
  }
  return null;
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/services/notifications";
import { emitExchangeEvent } from "@/services/exchange/events";
import type {
  InventoryDbClient,
  InventoryMutationSource,
} from "@/services/inventory/create-vehicle";

export type VehicleUpdateFields = {
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  year?: number | null;
  mileage?: number | null;
  color?: string | null;
  ownershipHand?: number | null;
  ownershipType?: string | null;
  retailPrice?: number | null;
  b2bPrice?: number | null;
  region?: string | null;
  /** Merge into fieldProvenance JSON (fuel/drivetrain/transmission/seats) */
  fieldProvenance?: Record<string, string>;
  /** ARCHIVED only — SOLD must use markVehicleSoldForDealer; ACTIVE reactivation uses reactivateVehicleForDealer */
  status?: "ARCHIVED";
  rawInput?: string | null;
  lastAvailabilityConfirmedAt?: Date | null;
};

/**
 * Canonical vehicle fact update — ownership scoped.
 * Does NOT set SOLD or reactivate SOLD→ACTIVE (use dedicated commands).
 * Edited now ≠ availability confirmed (freshness only bumps when explicitly confirmed).
 */
export async function updateVehicleForDealer(input: {
  dealerId: string;
  vehicleId: string;
  fields: VehicleUpdateFields;
  source?: InventoryMutationSource | string;
  skipEventLog?: boolean;
  skipRematch?: boolean;
  db?: InventoryDbClient;
}) {
  const db = input.db ?? prisma;

  const vehicle = await db.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: input.dealerId },
  });

  if (!vehicle) {
    return { ok: false as const, error: "not_found" as const };
  }

  if (vehicle.status === "SOLD" || vehicle.status === "ARCHIVED") {
    const onlyMeta =
      Object.keys(input.fields).length > 0 &&
      Object.keys(input.fields).every((k) => ["rawInput"].includes(k));
    if (!onlyMeta && input.fields.status !== "ARCHIVED") {
      return {
        ok: false as const,
        error: "terminal_status" as const,
        message: "רכב שנמכר דורש הפעלה מחדש מפורשת לפני עדכון.",
      };
    }
  }

  const data: Record<string, unknown> = { lastInventoryUpdate: new Date() };
  const f = input.fields;
  if ("make" in f) data.make = f.make;
  if ("model" in f) data.model = f.model;
  if ("trim" in f) data.trim = f.trim;
  if ("year" in f) data.year = f.year;
  if ("mileage" in f) data.mileage = f.mileage;
  if ("color" in f) data.color = f.color;
  if ("ownershipHand" in f) data.ownershipHand = f.ownershipHand;
  if ("ownershipType" in f) data.ownershipType = f.ownershipType;
  if ("retailPrice" in f) data.retailPrice = f.retailPrice;
  if ("b2bPrice" in f) data.b2bPrice = f.b2bPrice;
  if ("region" in f) data.region = f.region;
  if ("rawInput" in f) data.rawInput = f.rawInput;

  if (f.fieldProvenance && Object.keys(f.fieldProvenance).length > 0) {
    const { toPrismaJson } = await import("@/lib/prisma-json");
    const prev =
      vehicle.fieldProvenance &&
      typeof vehicle.fieldProvenance === "object" &&
      !Array.isArray(vehicle.fieldProvenance)
        ? (vehicle.fieldProvenance as Record<string, unknown>)
        : {};
    data.fieldProvenance = toPrismaJson({ ...prev, ...f.fieldProvenance });
  }

  if ("lastAvailabilityConfirmedAt" in f && f.lastAvailabilityConfirmedAt) {
    data.lastAvailabilityConfirmedAt = f.lastAvailabilityConfirmedAt;
    data.freshnessState = "FRESH";
  }

  if (f.status === "ARCHIVED") {
    data.status = "ARCHIVED";
    data.archivedAt = new Date();
  }

  const b2bNewlySet =
    "b2bPrice" in f && f.b2bPrice != null && vehicle.b2bPrice == null;

  const updated = await db.vehicle.update({ where: { id: vehicle.id }, data });

  if (b2bNewlySet) {
    const { recordActivationMilestone } = await import(
      "@/services/activation/milestones"
    );
    void recordActivationMilestone({
      dealerId: input.dealerId,
      milestone: "FIRST_PRIVATE_PRICE_SET",
      entityType: "Vehicle",
      entityId: updated.id,
    }).catch(() => undefined);
  }

  const matchRelevantFields = [
    "make",
    "model",
    "year",
    "mileage",
    "b2bPrice",
    "retailPrice",
    "color",
    "trim",
    "ownershipHand",
    "region",
    "fieldProvenance",
    "lastAvailabilityConfirmedAt",
  ];
  const matchingRelevant = Object.keys(f).some((k) => matchRelevantFields.includes(k));

  if (!input.skipEventLog) {
    await logAppEvent({
      eventType: "vehicle_updated",
      entityType: "Vehicle",
      entityId: updated.id,
      dealerId: input.dealerId,
      metadata: { source: input.source ?? "domain", fields: Object.keys(f) },
    });

    if (f.status === "ARCHIVED" && vehicle.status !== "ARCHIVED") {
      await emitExchangeEvent({
        eventType: "INVENTORY_REMOVED",
        dealerId: input.dealerId,
        vehicleId: updated.id,
        evidenceType: "SYSTEM_OBSERVED",
        privacyClass: "DEALER_SCOPED",
        eventData: { source: input.source ?? "domain", note: "archived_not_sold" },
        idempotencyKey: `inventory-removed:${updated.id}:${updated.archivedAt?.toISOString() ?? "x"}`,
      });
      const { cancelOpenRequestsForVehicle } = await import(
        "@/services/matching/information-request"
      );
      await cancelOpenRequestsForVehicle(updated.id);
    } else if (matchingRelevant) {
      await emitExchangeEvent({
        eventType: "INVENTORY_UPDATED",
        dealerId: input.dealerId,
        vehicleId: updated.id,
        evidenceType: "SYSTEM_OBSERVED",
        privacyClass: "DEALER_SCOPED",
        eventData: { fields: Object.keys(f) },
        idempotencyKey: `inventory-updated:${updated.id}:${updated.updatedAt.toISOString()}`,
      });
      const updatedFields = Object.keys(f).flatMap((k) => {
        if (k === "b2bPrice" || k === "retailPrice") return ["price"];
        if (k === "ownershipHand") return ["hand"];
        if (k === "fieldProvenance" && f.fieldProvenance) {
          return Object.keys(f.fieldProvenance);
        }
        return [k];
      });
      const { fulfillRequestsAfterVehicleUpdate } = await import(
        "@/services/matching/information-request"
      );
      await fulfillRequestsAfterVehicleUpdate({
        vehicleId: updated.id,
        sellerDealerId: input.dealerId,
        updatedFields,
      });
    }
  }

  if (
    matchingRelevant &&
    updated.status === "ACTIVE" &&
    (input.skipEventLog || input.skipRematch === false) &&
    !input.skipRematch
  ) {
    const { rematchAfterInventoryMutation } = await import(
      "@/services/matching/inventory-rematch"
    );
    await rematchAfterInventoryMutation({
      vehicleId: updated.id,
      sellerDealerId: input.dealerId,
    });
  }

  return { ok: true as const, vehicle: updated };
}

/** Explicit reactivation — never via generic update side-effect. */
export async function reactivateVehicleForDealer(input: {
  dealerId: string;
  vehicleId: string;
  source?: InventoryMutationSource | string;
  skipRematch?: boolean;
}) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: input.dealerId },
  });
  if (!vehicle) return { ok: false as const, error: "not_found" as const };
  if (vehicle.status === "ACTIVE") {
    return { ok: true as const, vehicle, alreadyActive: true as const };
  }
  if (vehicle.status !== "SOLD" && vehicle.status !== "ARCHIVED") {
    return { ok: false as const, error: "invalid_status" as const };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.vehicle.update({
      where: { id: vehicle.id },
      data: {
        status: "ACTIVE",
        archivedAt: null,
        lastInventoryUpdate: new Date(),
        freshnessState: "UNKNOWN",
      },
    });
    await emitExchangeEvent(
      {
        eventType: "INVENTORY_REACTIVATED",
        dealerId: input.dealerId,
        vehicleId: row.id,
        evidenceType: "SYSTEM_OBSERVED",
        privacyClass: "DEALER_SCOPED",
        eventData: { source: input.source ?? "domain", from: vehicle.status },
        idempotencyKey: `inventory-reactivated:${row.id}:${vehicle.status}`,
      },
      tx
    );
    return row;
  });

  await logAppEvent({
    eventType: "vehicle_reactivated",
    entityType: "Vehicle",
    entityId: updated.id,
    dealerId: input.dealerId,
    metadata: { source: input.source ?? "domain", from: vehicle.status },
  });

  if (!input.skipRematch) {
    const { rematchAfterInventoryMutation } = await import(
      "@/services/matching/inventory-rematch"
    );
    await rematchAfterInventoryMutation({
      vehicleId: updated.id,
      sellerDealerId: input.dealerId,
    });
  }

  return { ok: true as const, vehicle: updated, alreadyActive: false as const };
}

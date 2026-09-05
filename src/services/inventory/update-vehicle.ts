import "server-only";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/services/notifications";
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
  status?: "ACTIVE" | "SOLD" | "ARCHIVED";
  rawInput?: string | null;
  lastAvailabilityConfirmedAt?: Date | null;
};

/**
 * Canonical vehicle update for Dealer — ownership scoped.
 * Used by API, Agent, and Import. Never invent values; only apply provided keys.
 */
export async function updateVehicleForDealer(input: {
  dealerId: string;
  vehicleId: string;
  fields: VehicleUpdateFields;
  source?: InventoryMutationSource | string;
  /** Batch import: avoid N× vehicle_updated AppEvents (summary logged at import level) */
  skipEventLog?: boolean;
  db?: InventoryDbClient;
}) {
  const db = input.db ?? prisma;

  const vehicle = await db.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: input.dealerId },
  });

  if (!vehicle) {
    return { ok: false as const, error: "not_found" as const };
  }

  const data: Record<string, unknown> = {
    lastInventoryUpdate: new Date(),
    freshnessState: "FRESH",
  };

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
  if ("lastAvailabilityConfirmedAt" in f) {
    data.lastAvailabilityConfirmedAt = f.lastAvailabilityConfirmedAt;
  }

  if (f.status === "SOLD") {
    data.status = "SOLD";
    data.archivedAt = new Date();
  } else if (f.status === "ARCHIVED") {
    data.status = "ARCHIVED";
    data.archivedAt = new Date();
  } else if (f.status === "ACTIVE") {
    data.status = "ACTIVE";
    data.archivedAt = null;
  }

  const b2bNewlySet =
    "b2bPrice" in f && f.b2bPrice != null && vehicle.b2bPrice == null;

  const updated = await db.vehicle.update({
    where: { id: vehicle.id },
    data,
  });

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

  if (!input.skipEventLog) {
    await logAppEvent({
      eventType: "vehicle_updated",
      entityType: "Vehicle",
      entityId: updated.id,
      dealerId: input.dealerId,
      metadata: {
        source: input.source ?? "domain",
        fields: Object.keys(f),
      },
    });
  }

  try {
    const { emitExchangeEvent } = await import("@/services/exchange/events");
    if (f.status === "SOLD" && vehicle.status !== "SOLD") {
      await emitExchangeEvent({
        eventType: "VEHICLE_SOLD",
        dealerId: input.dealerId,
        vehicleId: updated.id,
        evidenceType: "SYSTEM_OBSERVED",
        privacyClass: "DEALER_SCOPED",
        eventData: { source: input.source ?? "domain" },
        idempotencyKey: `vehicle-sold:${updated.id}`,
      });
      const { cancelOpenRequestsForVehicle } = await import(
        "@/services/matching/information-request"
      );
      await cancelOpenRequestsForVehicle(updated.id);
    } else if (f.status === "ARCHIVED" && vehicle.status !== "ARCHIVED") {
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
    } else if (f.status === "ACTIVE" && vehicle.status !== "ACTIVE") {
      await emitExchangeEvent({
        eventType: "INVENTORY_REACTIVATED",
        dealerId: input.dealerId,
        vehicleId: updated.id,
        evidenceType: "SYSTEM_OBSERVED",
        privacyClass: "DEALER_SCOPED",
        idempotencyKey: `inventory-reactivated:${updated.id}:${Date.now()}`,
      });
    } else if (
      Object.keys(f).some((k) =>
        ["make", "model", "year", "mileage", "b2bPrice", "retailPrice", "color"].includes(k)
      )
    ) {
      await emitExchangeEvent({
        eventType: "INVENTORY_UPDATED",
        dealerId: input.dealerId,
        vehicleId: updated.id,
        evidenceType: "SYSTEM_OBSERVED",
        privacyClass: "DEALER_SCOPED",
        eventData: { fields: Object.keys(f) },
        idempotencyKey: `inventory-updated:${updated.id}:${updated.updatedAt.toISOString()}`,
      });
      const updatedFields = Object.keys(f).map((k) =>
        k === "b2bPrice" || k === "retailPrice" ? "price" : k
      );
      const { fulfillRequestsAfterVehicleUpdate } = await import(
        "@/services/matching/information-request"
      );
      await fulfillRequestsAfterVehicleUpdate({
        vehicleId: updated.id,
        sellerDealerId: input.dealerId,
        updatedFields,
      });
    }
  } catch {
    // non-blocking
  }

  return { ok: true as const, vehicle: updated };
}

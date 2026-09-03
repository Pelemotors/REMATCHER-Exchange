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
  retailPrice?: number | null;
  b2bPrice?: number | null;
  region?: string | null;
  status?: "ACTIVE" | "SOLD";
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
  } else if (f.status === "ACTIVE") {
    data.status = "ACTIVE";
    data.archivedAt = null;
  }

  const updated = await db.vehicle.update({
    where: { id: vehicle.id },
    data,
  });

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

  return { ok: true as const, vehicle: updated };
}

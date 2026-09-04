import "server-only";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/services/notifications";
import type {
  InventoryDbClient,
  InventoryMutationSource,
} from "@/services/inventory/create-vehicle";

/**
 * Canonical mark-sold for Dealer inventory.
 * Used by API PATCH, Agent, Import, and UI — do not raw-update status elsewhere for sold flow.
 */
export async function markVehicleSoldForDealer(input: {
  dealerId: string;
  vehicleId: string;
  source?: InventoryMutationSource | string;
  skipEventLog?: boolean;
  db?: InventoryDbClient;
}) {
  const db = input.db ?? prisma;

  const vehicle = await db.vehicle.findFirst({
    where: {
      id: input.vehicleId,
      dealerId: input.dealerId,
      status: { not: "ARCHIVED" },
    },
  });

  if (!vehicle) {
    return { ok: false as const, error: "not_found" as const };
  }

  if (vehicle.status === "SOLD") {
    return { ok: true as const, vehicle, alreadySold: true as const };
  }

  const updated = await db.vehicle.update({
    where: { id: vehicle.id },
    data: { status: "SOLD", archivedAt: new Date() },
  });

  if (!input.skipEventLog) {
    await logAppEvent({
      eventType: "vehicle_marked_sold",
      entityType: "Vehicle",
      entityId: updated.id,
      dealerId: input.dealerId,
      metadata: { source: input.source ?? "domain" },
    });
    try {
      const { emitExchangeEvent } = await import("@/services/exchange/events");
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
    } catch {
      // non-blocking
    }
  }

  return { ok: true as const, vehicle: updated, alreadySold: false as const };
}

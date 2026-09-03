import "server-only";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/services/notifications";

/**
 * Canonical mark-sold for Dealer inventory.
 * Used by API PATCH, Agent, and UI — do not raw-update status elsewhere for sold flow.
 */
export async function markVehicleSoldForDealer(input: {
  dealerId: string;
  vehicleId: string;
  source?: string;
}) {
  const vehicle = await prisma.vehicle.findFirst({
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

  const updated = await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { status: "SOLD", archivedAt: new Date() },
  });

  await logAppEvent({
    eventType: "vehicle_marked_sold",
    entityType: "Vehicle",
    entityId: updated.id,
    dealerId: input.dealerId,
    metadata: { source: input.source ?? "domain" },
  });

  return { ok: true as const, vehicle: updated, alreadySold: false as const };
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { updateVehicleForDealer } from "@/services/inventory/update-vehicle";
import { applyVehicleArchiveLifecycle } from "@/services/inventory/archive-lifecycle";
import { vehicleCapabilities } from "@/services/vehicles/vehicle-capabilities";

/**
 * Remove a vehicle from active inventory without marking it SOLD.
 * Upload mistakes / no-longer-held stock → ARCHIVED.
 */
export async function removeVehicleFromInventoryForDealer(input: {
  dealerId: string;
  vehicleId: string;
  source?: string;
}) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: input.dealerId },
    select: { dealerRelationship: true, status: true },
  });
  if (!vehicle) {
    return { ok: false as const, error: "not_found" as const };
  }
  const caps = vehicleCapabilities({
    dealerRelationship: vehicle.dealerRelationship,
    status: vehicle.status,
  });
  if (!caps.canArchive && vehicle.status !== "ARCHIVED") {
    return {
      ok: false as const,
      error: "ownership_required" as const,
      message: "רק רכב במלאי שלך ניתן להעביר לארכיון.",
    };
  }

  const result = await updateVehicleForDealer({
    dealerId: input.dealerId,
    vehicleId: input.vehicleId,
    fields: { status: "ARCHIVED" },
    source: input.source ?? "inventory_api",
  });
  if (!result.ok) return result;
  const { reconcileCatalogPublicationForVehicle } = await import(
    "@/services/catalog/reconcile"
  );
  await reconcileCatalogPublicationForVehicle(input.vehicleId);
  await applyVehicleArchiveLifecycle({
    vehicleId: input.vehicleId,
    dealerId: input.dealerId,
    source: input.source ?? "archived",
  });
  return result;
}

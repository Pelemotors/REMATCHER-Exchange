import "server-only";
import { updateVehicleForDealer } from "@/services/inventory/update-vehicle";
import { applyVehicleArchiveLifecycle } from "@/services/inventory/archive-lifecycle";

/**
 * Remove a vehicle from active inventory without marking it SOLD.
 * Upload mistakes / no-longer-held stock → ARCHIVED.
 */
export async function removeVehicleFromInventoryForDealer(input: {
  dealerId: string;
  vehicleId: string;
  source?: string;
}) {
  const result = await updateVehicleForDealer({
    dealerId: input.dealerId,
    vehicleId: input.vehicleId,
    fields: { status: "ARCHIVED" },
    source: input.source ?? "inventory_api",
  });
  if (!result.ok) return result;
  await applyVehicleArchiveLifecycle({
    vehicleId: input.vehicleId,
    dealerId: input.dealerId,
    source: input.source ?? "archived",
  });
  return result;
}

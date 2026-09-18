import "server-only";
import { prisma } from "@/lib/prisma";
import { removeVehicleFromInventoryForDealer } from "@/services/inventory/remove-from-inventory";
import { markVehicleSoldForDealer } from "@/services/inventory/mark-sold";
import {
  fetchAllMatchingVehicleIds,
  type InventoryFilter,
} from "@/services/inventory/dealer-inventory-filter";

export type BulkInventoryAction = "archive" | "sold";

export type BulkInventoryInput = {
  dealerId: string;
  action: BulkInventoryAction;
  vehicleIds?: string[];
  filter?: InventoryFilter;
  q?: string;
  selectAllMatching?: boolean;
  source?: string;
};

export type BulkInventoryResult =
  | {
      ok: false;
      error: "bulk_ops_limit_exceeded";
      totalMatchingCount: number;
    }
  | {
      ok: true;
      action: BulkInventoryAction;
      totalMatchingCount: number;
      requestedCount: number;
      processedCount: number;
      affectedCount: number;
      alreadyInTargetStateCount: number;
      failureCount: number;
      failures: Array<{ vehicleId: string; error: string }>;
    };

async function resolveVehicleIds(
  input: BulkInventoryInput
): Promise<
  | { ok: true; ids: string[]; totalMatchingCount: number }
  | { ok: false; error: "bulk_ops_limit_exceeded"; totalMatchingCount: number }
> {
  if (input.selectAllMatching || (!input.vehicleIds?.length && input.filter)) {
    try {
      const { ids, totalMatchingCount } = await fetchAllMatchingVehicleIds({
        dealerId: input.dealerId,
        filter: input.filter ?? (input.action === "sold" ? "active" : "active"),
        q: input.q,
      });
      return { ok: true, ids, totalMatchingCount };
    } catch (e) {
      if (e instanceof Error && e.message === "bulk_ops_limit_exceeded") {
        const { countDealerInventoryMatching } = await import(
          "@/services/inventory/dealer-inventory-filter"
        );
        const totalMatchingCount = await countDealerInventoryMatching({
          dealerId: input.dealerId,
          filter: input.filter ?? "active",
          q: input.q,
        });
        return { ok: false, error: "bulk_ops_limit_exceeded", totalMatchingCount };
      }
      throw e;
    }
  }
  const ids = [...new Set(input.vehicleIds ?? [])];
  return { ok: true, ids, totalMatchingCount: ids.length };
}

export async function runBulkInventoryMutation(
  input: BulkInventoryInput
): Promise<BulkInventoryResult> {
  const resolved = await resolveVehicleIds(input);
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      totalMatchingCount: resolved.totalMatchingCount,
    };
  }

  const ids = resolved.ids;
  const failures: Array<{ vehicleId: string; error: string }> = [];
  let affectedCount = 0;
  let alreadyInTargetStateCount = 0;
  let processedCount = 0;

  for (const vehicleId of ids) {
    processedCount += 1;
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, dealerId: input.dealerId },
      select: { id: true, status: true },
    });
    if (!vehicle) {
      failures.push({ vehicleId, error: "not_found" });
      continue;
    }

    if (input.action === "archive") {
      if (vehicle.status === "ARCHIVED") {
        alreadyInTargetStateCount += 1;
        continue;
      }
      if (vehicle.status === "SOLD") {
        failures.push({ vehicleId, error: "sold_not_archivable" });
        continue;
      }
      const res = await removeVehicleFromInventoryForDealer({
        dealerId: input.dealerId,
        vehicleId,
        source: input.source ?? "bulk_inventory_api",
      });
      if (!res.ok) {
        failures.push({ vehicleId, error: res.error ?? "update_failed" });
        continue;
      }
      affectedCount += 1;
      continue;
    }

    if (vehicle.status === "SOLD") {
      alreadyInTargetStateCount += 1;
      continue;
    }
    if (vehicle.status === "ARCHIVED") {
      failures.push({ vehicleId, error: "archived_not_sold_via_bulk" });
      continue;
    }
    const res = await markVehicleSoldForDealer({
      dealerId: input.dealerId,
      vehicleId,
      source: input.source ?? "bulk_inventory_api",
    });
    if (!res.ok) {
      failures.push({ vehicleId, error: res.error ?? "sold_failed" });
      continue;
    }
    if (res.alreadySold) alreadyInTargetStateCount += 1;
    else affectedCount += 1;
  }

  return {
    ok: true,
    action: input.action,
    totalMatchingCount: resolved.totalMatchingCount,
    requestedCount: ids.length,
    processedCount,
    affectedCount,
    alreadyInTargetStateCount,
    failureCount: failures.length,
    failures,
  };
}

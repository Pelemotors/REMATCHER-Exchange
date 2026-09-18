import "server-only";
import { prisma } from "@/lib/prisma";
import { removeVehicleFromInventoryForDealer } from "@/services/inventory/remove-from-inventory";
import { markVehicleSoldForDealer } from "@/services/inventory/mark-sold";

export type BulkInventoryAction = "archive" | "sold";

export type BulkInventoryInput = {
  dealerId: string;
  action: BulkInventoryAction;
  vehicleIds?: string[];
  filter?: { status?: "ACTIVE" | "SOLD"; q?: string };
  selectAllMatching?: boolean;
  source?: string;
};

export type BulkInventoryResult = {
  ok: true;
  action: BulkInventoryAction;
  requestedCount: number;
  affectedCount: number;
  alreadyInTargetStateCount: number;
  failures: Array<{ vehicleId: string; error: string }>;
};

async function resolveVehicleIds(input: BulkInventoryInput): Promise<string[]> {
  if (input.selectAllMatching || (!input.vehicleIds?.length && input.filter)) {
    const where: Record<string, unknown> = {
      dealerId: input.dealerId,
      status: { not: "ARCHIVED" },
    };
    if (input.filter?.status) where.status = input.filter.status;
    else if (input.action === "archive") where.status = "ACTIVE";
    else if (input.action === "sold") where.status = "ACTIVE";

    if (input.filter?.q?.trim()) {
      const term = input.filter.q.trim();
      where.AND = [
        {
          OR: [
            { make: { contains: term, mode: "insensitive" } },
            { model: { contains: term, mode: "insensitive" } },
            { color: { contains: term, mode: "insensitive" } },
          ],
        },
      ];
    }
    const rows = await prisma.vehicle.findMany({
      where: where as never,
      select: { id: true },
      take: 500,
    });
    return rows.map((r) => r.id);
  }
  return [...new Set(input.vehicleIds ?? [])];
}

export async function runBulkInventoryMutation(
  input: BulkInventoryInput
): Promise<BulkInventoryResult> {
  const ids = await resolveVehicleIds(input);
  const failures: BulkInventoryResult["failures"] = [];
  let affectedCount = 0;
  let alreadyInTargetStateCount = 0;

  for (const vehicleId of ids) {
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
    requestedCount: ids.length,
    affectedCount,
    alreadyInTargetStateCount,
    failures,
  };
}

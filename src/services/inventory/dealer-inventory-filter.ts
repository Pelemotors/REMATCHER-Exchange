import { prisma } from "@/lib/prisma";

export type InventoryFilter =
  | "all"
  | "active"
  | "sold"
  | "attention"
  | "interest"
  | "missing_price";

export type InventoryFilterAux = {
  attentionIds: Set<string>;
  interestVehicleIds: string[];
};

const PAGE_SIZE = 200;

export function bulkOpsLimit(): number {
  const raw = process.env.INVENTORY_BULK_MAX_OPS;
  if (raw && /^\d+$/.test(raw)) return Math.max(1, Number(raw));
  return 5000;
}

export async function loadInventoryFilterAux(
  dealerId: string
): Promise<InventoryFilterAux> {
  const [attentionBase, pendingValidations, openOpps] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        dealerId,
        status: "ACTIVE",
        OR: [
          { freshnessState: { in: ["STALE", "VALIDATION_REQUIRED", "UNKNOWN"] } },
          { b2bPrice: null, retailPrice: null },
        ],
      },
      select: { id: true },
    }),
    prisma.validationEvent.groupBy({
      by: ["vehicleId"],
      where: { dealerId, status: "PENDING" },
      _count: { _all: true },
    }),
    prisma.sellerOpportunity.groupBy({
      by: ["vehicleId"],
      where: { vehicle: { dealerId }, status: "OPEN" },
      _count: { _all: true },
    }),
  ]);

  const attentionIds = new Set([
    ...attentionBase.map((v) => v.id),
    ...pendingValidations.map((v) => v.vehicleId),
  ]);

  return {
    attentionIds,
    interestVehicleIds: openOpps.map((o) => o.vehicleId),
  };
}

export function buildDealerInventoryWhere(input: {
  dealerId: string;
  filter?: InventoryFilter;
  q?: string;
  aux?: InventoryFilterAux;
}): Record<string, unknown> {
  const filter = input.filter ?? "active";
  const where: Record<string, unknown> = {
    dealerId: input.dealerId,
    status: { not: "ARCHIVED" },
  };

  if (filter === "active") where.status = "ACTIVE";
  else if (filter === "sold") where.status = "SOLD";
  else if (filter === "all") where.status = { in: ["ACTIVE", "SOLD"] };
  else if (filter === "missing_price") {
    where.status = "ACTIVE";
    where.b2bPrice = null;
    where.retailPrice = null;
  } else if (filter === "attention") {
    const ids = input.aux?.attentionIds ?? new Set<string>();
    where.id = { in: [...ids] };
  } else if (filter === "interest") {
    where.id = { in: input.aux?.interestVehicleIds ?? [] };
  }

  if (input.q?.trim()) {
    const term = input.q.trim();
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

  return where;
}

export async function countDealerInventoryMatching(input: {
  dealerId: string;
  filter?: InventoryFilter;
  q?: string;
  aux?: InventoryFilterAux;
}): Promise<number> {
  const aux = input.aux ?? (await loadInventoryFilterAux(input.dealerId));
  const where = buildDealerInventoryWhere({ ...input, aux });
  return prisma.vehicle.count({ where: where as never });
}

export async function fetchAllMatchingVehicleIds(input: {
  dealerId: string;
  filter?: InventoryFilter;
  q?: string;
  aux?: InventoryFilterAux;
}): Promise<{ ids: string[]; totalMatchingCount: number }> {
  const aux = input.aux ?? (await loadInventoryFilterAux(input.dealerId));
  const where = buildDealerInventoryWhere({ ...input, aux });
  const totalMatchingCount = await prisma.vehicle.count({ where: where as never });
  const limit = bulkOpsLimit();
  if (totalMatchingCount > limit) {
    throw new Error("bulk_ops_limit_exceeded");
  }

  const ids: string[] = [];
  let skip = 0;
  while (skip < totalMatchingCount) {
    const batch = await prisma.vehicle.findMany({
      where: where as never,
      select: { id: true },
      orderBy: { id: "asc" },
      skip,
      take: PAGE_SIZE,
    });
    if (!batch.length) break;
    ids.push(...batch.map((r) => r.id));
    skip += batch.length;
  }

  return { ids, totalMatchingCount };
}

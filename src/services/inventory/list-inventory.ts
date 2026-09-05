import { prisma } from "@/lib/prisma";

export type InventoryFilter =
  | "all"
  | "active"
  | "sold"
  | "attention"
  | "interest"
  | "missing_price";

export interface InventoryListInput {
  dealerId: string;
  page?: number;
  pageSize?: number;
  filter?: InventoryFilter;
  q?: string;
}

export async function getInventoryList({
  dealerId,
  page = 1,
  pageSize = 50,
  filter = "active",
  q,
}: InventoryListInput) {
  const [activeCount, soldCount, allCount, missingPriceCount, attentionBase, openOpps, pendingValidations] =
    await Promise.all([
      prisma.vehicle.count({ where: { dealerId, status: "ACTIVE" } }),
      prisma.vehicle.count({ where: { dealerId, status: "SOLD" } }),
      prisma.vehicle.count({ where: { dealerId, status: { in: ["ACTIVE", "SOLD"] } } }),
      prisma.vehicle.count({
        where: { dealerId, status: "ACTIVE", b2bPrice: null, retailPrice: null },
      }),
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
      prisma.sellerOpportunity.groupBy({
        by: ["vehicleId"],
        where: { vehicle: { dealerId }, status: "OPEN" },
        _count: { _all: true },
      }),
      prisma.validationEvent.groupBy({
        by: ["vehicleId"],
        where: { dealerId, status: "PENDING" },
        _count: { _all: true },
      }),
    ]);

  const oppByVehicle = new Map(openOpps.map((o) => [o.vehicleId, o._count._all]));
  const valByVehicle = new Map(pendingValidations.map((v) => [v.vehicleId, v._count._all]));
  const attentionIds = new Set([
    ...attentionBase.map((v) => v.id),
    ...pendingValidations.map((v) => v.vehicleId),
  ]);

  const where: Record<string, unknown> = {
    dealerId,
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
    where.id = { in: [...attentionIds] };
  } else if (filter === "interest") {
    where.id = { in: openOpps.map((o) => o.vehicleId) };
  }

  if (q?.trim()) {
    const term = q.trim();
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

  const [totalMatching, vehicles] = await Promise.all([
    prisma.vehicle.count({ where: where as never }),
    prisma.vehicle.findMany({
      where: where as never,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        mileage: true,
        b2bPrice: true,
        retailPrice: true,
        trim: true,
        color: true,
        status: true,
        freshnessState: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const enriched = vehicles.map((v) => ({
    ...v,
    updatedAt: v.updatedAt.toISOString(),
    createdAt: v.createdAt.toISOString(),
    openInterestCount: oppByVehicle.get(v.id) ?? 0,
    pendingValidationCount: valByVehicle.get(v.id) ?? 0,
  }));

  return {
    vehicles: enriched,
    snapshot: {
      total: activeCount,
      sold: soldCount,
      all: allCount,
      needsAttention: attentionIds.size,
      withInterest: openOpps.length,
      pendingValidation: pendingValidations.reduce((n, v) => n + v._count._all, 0),
      missingPrivatePrice: missingPriceCount,
    },
    pagination: {
      page,
      pageSize,
      totalCount: totalMatching,
      returnedCount: enriched.length,
      hasMore: page * pageSize < totalMatching,
    },
  };
}

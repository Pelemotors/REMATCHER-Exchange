import { prisma } from "@/lib/prisma";
import {
  buildDealerInventoryWhere,
  loadInventoryFilterAux,
  type InventoryFilter,
} from "@/services/inventory/dealer-inventory-filter";

export type { InventoryFilter } from "@/services/inventory/dealer-inventory-filter";
export {
  buildDealerInventoryWhere,
  loadInventoryFilterAux,
} from "@/services/inventory/dealer-inventory-filter";

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
  const [statusCounts, missingPriceCount, aux, pendingValidations, openOpps] =
    await Promise.all([
      prisma.vehicle.groupBy({
        by: ["status"],
        where: { dealerId, status: { in: ["ACTIVE", "SOLD"] } },
        _count: { _all: true },
      }),
      prisma.vehicle.count({
        where: { dealerId, status: "ACTIVE", b2bPrice: null, retailPrice: null },
      }),
      loadInventoryFilterAux(dealerId),
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

  const countByStatus = new Map(statusCounts.map((row) => [row.status, row._count._all]));
  const activeCount = countByStatus.get("ACTIVE") ?? 0;
  const soldCount = countByStatus.get("SOLD") ?? 0;
  const allCount = activeCount + soldCount;

  const oppByVehicle = new Map(openOpps.map((o) => [o.vehicleId, o._count._all]));
  const valByVehicle = new Map(pendingValidations.map((v) => [v.vehicleId, v._count._all]));

  const where = buildDealerInventoryWhere({ dealerId, filter, q, aux });

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
        mediaReady: true,
        dealerRelationship: true,
        visibility: true,
        catalogOverride: true,
        updatedAt: true,
        createdAt: true,
        media: {
          where: { isPrimary: true },
          take: 1,
          select: { storageKey: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
  ]);

  const { publicThumbUrlForDisplayKey } = await import("@/lib/media/storage");

  const enriched = vehicles.map((v) => {
    const primaryKey = v.media[0]?.storageKey ?? null;
    const { media: _media, ...rest } = v;
    return {
      ...rest,
      updatedAt: v.updatedAt.toISOString(),
      createdAt: v.createdAt.toISOString(),
      openInterestCount: oppByVehicle.get(v.id) ?? 0,
      pendingValidationCount: valByVehicle.get(v.id) ?? 0,
      thumbUrl: primaryKey ? publicThumbUrlForDisplayKey(primaryKey) : null,
    };
  });

  return {
    vehicles: enriched,
    snapshot: {
      total: activeCount,
      sold: soldCount,
      all: allCount,
      needsAttention: aux.attentionIds.size,
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

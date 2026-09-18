import "server-only";
import { prisma } from "@/lib/prisma";
import {
  loadDealerMarketSide,
  marketSideFromDealerRow,
  marketsCompatible,
} from "@/services/dealer/market-scope";

/**
 * Canonical inventory-side discovery trigger.
 * Every inventory mutation that can change match eligibility must call this.
 *
 * Discovery is intentionally based on ACTIVE demands, not existing CandidateMatch
 * rows. That guarantees a newly eligible vehicle can create a brand-new match.
 */
export async function rematchAfterInventoryMutation(params: {
  vehicleId: string;
  sellerDealerId: string;
}) {
  return rematchInventoryBatch({
    vehicleIds: [params.vehicleId],
    sellerDealerId: params.sellerDealerId,
  });
}

/**
 * Batch variant used by imports. We rematch each active demand once after the
 * whole inventory batch instead of once per touched vehicle.
 */
export async function rematchInventoryBatch(params: {
  vehicleIds: string[];
  sellerDealerId: string;
}) {
  const uniqueVehicleIds = [...new Set(params.vehicleIds)].filter(Boolean);
  if (uniqueVehicleIds.length === 0) return [] as string[];

  const activeTouchedVehicles = await prisma.vehicle.count({
    where: {
      id: { in: uniqueVehicleIds },
      dealerId: params.sellerDealerId,
      status: "ACTIVE",
    },
  });
  if (activeTouchedVehicles === 0) return [] as string[];

  const sellerSide = await loadDealerMarketSide(params.sellerDealerId);

  const demands = await prisma.demand.findMany({
    where: {
      status: "ACTIVE",
      dealerId: { not: params.sellerDealerId },
    },
    select: {
      id: true,
      dealer: {
        select: { marketMode: true, canAccessSyntheticMarket: true },
      },
    },
  });
  const compatibleDemands = demands.filter((d) =>
    marketsCompatible(sellerSide, marketSideFromDealerRow(d.dealer))
  );
  if (compatibleDemands.length === 0) return [] as string[];

  const { runMatchingForDemand } = await import(
    "@/services/domain/matching-flow"
  );

  const rematched: string[] = [];
  for (const demand of compatibleDemands) {
    await runMatchingForDemand(demand.id);
    rematched.push(demand.id);
  }

  return rematched;
}

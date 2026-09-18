import "server-only";
import { prisma } from "@/lib/prisma";
import { runExchangeIntelligenceEngine } from "@/services/exchange-intelligence/engine";
import { listMarketWatches } from "@/services/market-watch/watches";

export type MarketPulseQuery = {
  make?: string | null;
  model?: string | null;
  yearMin?: number | null;
  yearMax?: number | null;
};

/**
 * Dealer-scoped market pulse: own inventory/demand counts + optional network overview.
 */
export async function getMarketPulse(
  dealerId: string,
  query: MarketPulseQuery = {}
) {
  const [activeInventory, activeDemands, watches] = await Promise.all([
    prisma.vehicle.count({
      where: { dealerId, status: "ACTIVE" },
    }),
    prisma.demand.count({
      where: { dealerId, status: "ACTIVE" },
    }),
    listMarketWatches(dealerId),
  ]);

  let make = query.make?.trim() || null;
  let model = query.model?.trim() || null;
  let yearMin = query.yearMin ?? null;
  let yearMax = query.yearMax ?? null;

  if (!make || !model) {
    const first = watches[0];
    if (first) {
      make = first.queryMake;
      model = first.queryModel;
      yearMin = first.yearMin;
      yearMax = first.yearMax;
    }
  }

  let network: Awaited<ReturnType<typeof runExchangeIntelligenceEngine>> | null =
    null;
  if (make && model) {
    const intel = await runExchangeIntelligenceEngine({
      dealerId,
      action: "MARKET_OVERVIEW",
      subject: { make, model, yearMin, yearMax },
      includeCustomerPhone: false,
    });
    if (intel.ok) network = intel;
  }

  return {
    generatedAt: new Date().toISOString(),
    own: {
      activeInventory,
      activeDemands,
      activeWatches: watches.length,
    },
    focus:
      make && model
        ? { make, model, yearMin, yearMax }
        : null,
    networkOverview:
      network?.ok && "overview" in network ? network.overview ?? null : null,
    insufficientNetworkData: network?.ok
      ? Boolean(network.insufficientData)
      : !make || !model,
    privacyNote:
      "Pulse combines dealer-scoped counts with anonymous network aggregates only.",
  };
}

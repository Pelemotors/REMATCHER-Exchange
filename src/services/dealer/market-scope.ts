import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MarketSide = {
  marketMode: "REAL" | "SYNTHETIC";
  canAccessSyntheticMarket: boolean;
};

function requesterAllowsCounterpart(
  requester: MarketSide,
  counterpart: MarketSide
): boolean {
  if (requester.marketMode === "SYNTHETIC") {
    if (counterpart.marketMode === "SYNTHETIC") return true;
    // Synthetic market pairs with beta REAL only — never ordinary REAL.
    return (
      counterpart.marketMode === "REAL" && counterpart.canAccessSyntheticMarket
    );
  }
  if (requester.canAccessSyntheticMarket) {
    return true;
  }
  return counterpart.marketMode === "REAL";
}

/** Both sides must be compatible (bidirectional). */
export function marketsCompatible(
  requester: MarketSide,
  counterpart: MarketSide
): boolean {
  return (
    requesterAllowsCounterpart(requester, counterpart) &&
    requesterAllowsCounterpart(counterpart, requester)
  );
}

export async function loadDealerMarketSide(
  dealerId: string
): Promise<MarketSide> {
  const row = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { marketMode: true, canAccessSyntheticMarket: true },
  });
  if (!row) {
    return { marketMode: "REAL", canAccessSyntheticMarket: false };
  }
  return {
    marketMode: row.marketMode,
    canAccessSyntheticMarket: row.canAccessSyntheticMarket,
  };
}

export async function dealerAllowsSyntheticMarket(
  dealerId: string
): Promise<boolean> {
  const side = await loadDealerMarketSide(dealerId);
  return side.canAccessSyntheticMarket;
}

/** Prisma filter on related `dealer` for network counterparts visible to requester. */
export function counterpartMarketWhere(
  requester: MarketSide
): Prisma.DealerWhereInput {
  if (requester.marketMode === "SYNTHETIC") {
    return { marketMode: "SYNTHETIC" };
  }
  if (!requester.canAccessSyntheticMarket) {
    return { marketMode: { not: "SYNTHETIC" } };
  }
  return {};
}

function normalizeRequester(
  requester: MarketSide | boolean
): MarketSide {
  if (typeof requester === "boolean") {
    return {
      marketMode: "REAL",
      canAccessSyntheticMarket: requester,
    };
  }
  return requester;
}

/** Network-visible demands from other dealers (bilateral market scope). */
export function networkDemandWhere(
  excludeDealerId: string,
  requester: MarketSide | boolean
) {
  const side = normalizeRequester(requester);
  const dealerFilter = counterpartMarketWhere(side);
  return {
    status: "ACTIVE" as const,
    networkVisibility: "ANONYMOUS_NETWORK" as const,
    dealerId: { not: excludeDealerId },
    ...(Object.keys(dealerFilter).length
      ? { dealer: dealerFilter }
      : {}),
  };
}

export function marketSideFromDealerRow(row: {
  marketMode: "REAL" | "SYNTHETIC";
  canAccessSyntheticMarket: boolean;
}): MarketSide {
  return {
    marketMode: row.marketMode,
    canAccessSyntheticMarket: row.canAccessSyntheticMarket,
  };
}

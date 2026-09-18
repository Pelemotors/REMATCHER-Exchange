import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MarketSide = {
  marketMode: "REAL" | "SYNTHETIC";
  canAccessSyntheticMarket: boolean;
};

/**
 * Canonical bilateral market policy (consumer × producer).
 *
 * - SYNTHETIC consumer → SYNTHETIC producer only (never REAL)
 * - REAL ordinary consumer → REAL producer only
 * - REAL beta consumer (canAccessSyntheticMarket) → REAL or SYNTHETIC producer
 *
 * Pair helpers for rematch use this oriented check (demand consumes supply).
 */
export function canConsumeMarketCounterpart(
  consumer: MarketSide,
  producer: MarketSide
): boolean {
  if (consumer.marketMode === "SYNTHETIC") {
    return producer.marketMode === "SYNTHETIC";
  }
  if (consumer.canAccessSyntheticMarket) {
    return true;
  }
  return producer.marketMode === "REAL";
}

/**
 * Oriented compatibility for demand↔supply:
 * demandDealer is always the consumer; vehicleDealer is the producer.
 */
export function marketsCompatible(
  demandSide: MarketSide,
  vehicleSide: MarketSide
): boolean {
  return canConsumeMarketCounterpart(demandSide, vehicleSide);
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

/**
 * Prisma filter on related `dealer` for network counterparts a requester may consume.
 * Requester is always the consumer.
 */
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
    ...(Object.keys(dealerFilter).length ? { dealer: dealerFilter } : {}),
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

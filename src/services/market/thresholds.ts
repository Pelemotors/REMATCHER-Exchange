/**
 * Canonical Market Activity / marketability thresholds.
 *
 * One source of truth — UI and services must import from here.
 * Default sample floors stay conservative because the live network is small:
 * a mathematical ratio on 1 demand / 0 supply must never become HIGH.
 */
function envInt(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (raw && /^\d+$/.test(raw)) return Math.max(min, Number(raw));
  return fallback;
}

export function minCohortObservations(): number {
  return envInt("NETWORK_INTEL_MIN_COHORT", 3);
}

export function minDistinctDealers(): number {
  return envInt("NETWORK_INTEL_MIN_DISTINCT_DEALERS", 3);
}

export function minDistributionObservations(): number {
  return 5;
}

export function minTotalActivityForMarketability(): number {
  return envInt("MARKET_ACTIVITY_MIN_TOTAL", 6);
}

export function minDemandForHighMarketability(): number {
  return envInt("MARKET_ACTIVITY_MIN_DEMAND_HIGH", 5);
}

export function minSupplyForHighMarketability(): number {
  return envInt("MARKET_ACTIVITY_MIN_SUPPLY_HIGH", 3);
}

export function minSupplyForLowMarketability(): number {
  return envInt("MARKET_ACTIVITY_MIN_SUPPLY_LOW", 5);
}

export function highDemandSupplyRatio(): number {
  return 1.5;
}

export function lowDemandSupplyRatio(): number {
  return 2 / 3;
}

export function matchLookbackDays(): number {
  return 30;
}

export const MARKET_ACTIVITY_COPY = {
  insufficient:
    "אין כרגע מספיק מידע כדי לקבוע",
  insufficientPriceRange:
    "אין מספיק רכבים דומים כדי לתת טווח אמין",
} as const;

export type DataCoverage = "SUFFICIENT" | "LIMITED" | "INSUFFICIENT";
export type MarketabilityBand = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type PricePositionBand =
  | "BELOW_RANGE"
  | "IN_RANGE"
  | "ABOVE_RANGE"
  | "UNKNOWN";

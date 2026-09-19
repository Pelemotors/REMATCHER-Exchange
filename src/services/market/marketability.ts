import {
  type DataCoverage,
  type MarketabilityBand,
  type PricePositionBand,
  highDemandSupplyRatio,
  lowDemandSupplyRatio,
  MARKET_ACTIVITY_COPY,
  minDemandForHighMarketability,
  minSupplyForHighMarketability,
  minSupplyForLowMarketability,
  minTotalActivityForMarketability,
} from "@/services/market/thresholds";

export type MarketabilityEvidence = {
  key:
    | "demand_vs_supply"
    | "recent_matches"
    | "own_customer_demand"
    | "supply_density"
    | "sample_too_small";
  fact: string;
  supported: boolean;
};

export type MarketabilityResult = {
  band: MarketabilityBand;
  coverage: DataCoverage;
  evidence: MarketabilityEvidence[];
  explanationFacts: string[];
  demandSupplyRatio: number | null;
};

export type MarketabilityInput = {
  supplyCount: number | null;
  demandCount: number | null;
  supplyCoverageOk: boolean;
  demandCoverageOk: boolean;
  matchCount30d?: number | null;
  customerMatchCount?: number;
};

export function resolveDataCoverage(input: {
  supplyCoverageOk: boolean;
  demandCoverageOk: boolean;
  supplyCount: number | null;
  demandCount: number | null;
}): DataCoverage {
  if (!input.supplyCoverageOk && !input.demandCoverageOk) return "INSUFFICIENT";
  if (!input.supplyCoverageOk || !input.demandCoverageOk) return "LIMITED";
  const supply = input.supplyCount ?? 0;
  const demand = input.demandCount ?? 0;
  if (supply + demand < minTotalActivityForMarketability()) return "LIMITED";
  return "SUFFICIENT";
}

/**
 * Deterministic סחירות. Not an LLM opinion.
 *
 * Formula (all counts must already pass privacy/sample floors to be non-null):
 *   if coverage !== SUFFICIENT → UNKNOWN
 *   ratio = demand / supply
 *   HIGH   if ratio >= 1.5 AND demand >= 5 AND supply >= 3
 *   LOW    if ratio <= 2/3 AND supply >= 5
 *   MEDIUM otherwise
 *
 * Tiny samples (1 demand / 0 supply, empty network, below floors) → UNKNOWN.
 * Own-customer demand is evidence only; it cannot promote UNKNOWN → HIGH.
 */
export function computeMarketability(
  input: MarketabilityInput
): MarketabilityResult {
  const coverage = resolveDataCoverage(input);
  const evidence: MarketabilityEvidence[] = [];
  const customerMatchCount = input.customerMatchCount ?? 0;

  if (coverage !== "SUFFICIENT") {
    evidence.push({
      key: "sample_too_small",
      fact: MARKET_ACTIVITY_COPY.insufficient,
      supported: true,
    });
    if (customerMatchCount > 0) {
      evidence.push({
        key: "own_customer_demand",
        fact: `${customerMatchCount} לקוחות שלך מחפשים משהו דומה`,
        supported: true,
      });
    }
    return {
      band: "UNKNOWN",
      coverage,
      evidence,
      explanationFacts: evidence.map((e) => e.fact),
      demandSupplyRatio: null,
    };
  }

  const supply = input.supplyCount ?? 0;
  const demand = input.demandCount ?? 0;
  const ratio = supply > 0 ? Math.round((demand / supply) * 100) / 100 : null;

  let band: MarketabilityBand = "MEDIUM";
  if (
    ratio != null &&
    ratio >= highDemandSupplyRatio() &&
    demand >= minDemandForHighMarketability() &&
    supply >= minSupplyForHighMarketability()
  ) {
    band = "HIGH";
  } else if (
    ratio != null &&
    ratio <= lowDemandSupplyRatio() &&
    supply >= minSupplyForLowMarketability()
  ) {
    band = "LOW";
  }

  if (ratio != null) {
    evidence.push({
      key: "demand_vs_supply",
      fact:
        ratio >= highDemandSupplyRatio()
          ? "הביקוש גבוה ביחס להיצע"
          : ratio <= lowDemandSupplyRatio()
            ? "ההיצע גבוה ביחס לביקוש"
            : "הביקוש וההיצע קרובים",
      supported: true,
    });
  }
  evidence.push({
    key: "supply_density",
    fact: `${supply} רכבים דומים בהיצע`,
    supported: true,
  });
  if (input.matchCount30d != null) {
    evidence.push({
      key: "recent_matches",
      fact: `${input.matchCount30d} התאמות ב־${30} יום`,
      supported: input.matchCount30d > 0,
    });
  }
  if (customerMatchCount > 0) {
    evidence.push({
      key: "own_customer_demand",
      fact: `${customerMatchCount} לקוחות שלך מחפשים משהו דומה`,
      supported: true,
    });
  }

  return {
    band,
    coverage,
    evidence,
    explanationFacts: evidence.filter((e) => e.supported).map((e) => e.fact),
    demandSupplyRatio: ratio,
  };
}

export function computePricePosition(input: {
  subjectPrice: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
}): {
  band: PricePositionBand;
  semantic: "network_asking_b2b";
  subjectPrice: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
} {
  const { subjectPrice, rangeLow, rangeHigh } = input;
  if (
    subjectPrice == null ||
    subjectPrice <= 0 ||
    rangeLow == null ||
    rangeHigh == null
  ) {
    return {
      band: "UNKNOWN",
      semantic: "network_asking_b2b",
      subjectPrice,
      rangeLow,
      rangeHigh,
    };
  }
  if (subjectPrice < rangeLow) {
    return {
      band: "BELOW_RANGE",
      semantic: "network_asking_b2b",
      subjectPrice,
      rangeLow,
      rangeHigh,
    };
  }
  if (subjectPrice > rangeHigh) {
    return {
      band: "ABOVE_RANGE",
      semantic: "network_asking_b2b",
      subjectPrice,
      rangeLow,
      rangeHigh,
    };
  }
  return {
    band: "IN_RANGE",
    semantic: "network_asking_b2b",
    subjectPrice,
    rangeLow,
    rangeHigh,
  };
}

export function marketabilityLabelHe(band: MarketabilityBand): string {
  if (band === "HIGH") return "גבוהה";
  if (band === "MEDIUM") return "בינונית";
  if (band === "LOW") return "נמוכה";
  return "לא ידועה";
}

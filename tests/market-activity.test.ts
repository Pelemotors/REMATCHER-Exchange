import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { counterpartMarketWhere } from "@/services/dealer/market-scope";
import {
  assemblePurchaseSnapshot,
  assembleTradeSnapshot,
} from "@/services/decisions/decision-snapshot";
import type { MarketActivitySnapshot } from "@/services/market/activity";
import {
  computeMarketability,
  computePricePosition,
} from "@/services/market/marketability";
import {
  MARKET_ACTIVITY_COPY,
  minCohortObservations,
  minDistinctDealers,
} from "@/services/market/thresholds";

function activity(
  over: {
    supplyCount?: number | null;
    demandCount?: number | null;
    supplyOk?: boolean;
    demandOk?: boolean;
    customers?: number;
    matches?: number | null;
  } = {}
): MarketActivitySnapshot {
  const supplyOk = over.supplyOk ?? over.supplyCount != null;
  const demandOk = over.demandOk ?? over.demandCount != null;
  const {
    supplyCount,
    demandCount,
    supplyOk: _supplyOk,
    demandOk: _demandOk,
    customers,
    matches,
  } = over;
  const marketability = computeMarketability({
    supplyCount: supplyCount ?? null,
    demandCount: demandCount ?? null,
    supplyCoverageOk: supplyOk,
    demandCoverageOk: demandOk,
    matchCount30d: matches ?? null,
    customerMatchCount: customers ?? 0,
  });
  return {
    subject: { make: "BMW", model: "X3", year: 2022 },
    generatedAt: "2026-09-19T00:00:00.000Z",
    dataCoverage: marketability.coverage,
    coverageCopy:
      marketability.coverage === "SUFFICIENT"
        ? null
        : MARKET_ACTIVITY_COPY.insufficient,
    supply: {
      count: supplyCount ?? null,
      insufficientData: !supplyOk,
    },
    demand: {
      count: demandCount ?? null,
      insufficientData: !demandOk,
    },
    matches: {
      count: matches ?? null,
      insufficientData: matches == null,
      lookbackDays: 30,
    },
    interest: { count: null, insufficientData: true, lookbackDays: 30 },
    reveals: { count: null, insufficientData: true, lookbackDays: 30 },
    pricePosition: computePricePosition({
      subjectPrice: 168000,
      rangeLow: 176000,
      rangeHigh: 188000,
    }),
    comparablePriceRange: {
      low: 176000,
      high: 188000,
      median: 182000,
      insufficientData: false,
      priceFamily: "SUPPLY_ASKING_PRICE_B2B",
      copy: null,
    },
    marketability,
    customerMatches: { count: customers ?? 0, scope: "dealer_local" },
    cohort: {
      make: "BMW",
      model: "X3",
      yearMin: 2021,
      yearMax: 2023,
      fuel: null,
      source: "exchange-intelligence/engine",
      dimensions: ["canonical_make", "canonical_model", "year_window", "fuel_family"],
    },
  };
}

const purchaseDecision = {
  id: "dec-1",
  dealerId: "d1",
  vehicleId: "v1",
  sourceCandidateId: null,
  type: "PURCHASE" as const,
  status: "OPEN" as const,
  incomingAskPrice: 168000,
  incomingAgreedPrice: null,
  outgoingVehicleId: null,
  outgoingAgreedPrice: null,
  openedAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
  decidedAt: null,
  outgoingVehicle: null,
};

describe("marketability thresholds", () => {
  it("empty network and tiny sample are UNKNOWN", () => {
    expect(
      computeMarketability({
        supplyCount: null,
        demandCount: null,
        supplyCoverageOk: false,
        demandCoverageOk: false,
      }).band
    ).toBe("UNKNOWN");
    expect(
      computeMarketability({
        supplyCount: 0,
        demandCount: 1,
        supplyCoverageOk: false,
        demandCoverageOk: false,
      }).band
    ).toBe("UNKNOWN");
    expect(
      computeMarketability({
        supplyCount: 2,
        demandCount: 3,
        supplyCoverageOk: true,
        demandCoverageOk: true,
      }).band
    ).toBe("UNKNOWN");
  });

  it("A high demand / lower supply → HIGH with evidence", () => {
    const result = computeMarketability({
      supplyCount: 11,
      demandCount: 28,
      supplyCoverageOk: true,
      demandCoverageOk: true,
      matchCount30d: 9,
      customerMatchCount: 2,
    });
    expect(result.band).toBe("HIGH");
    expect(result.coverage).toBe("SUFFICIENT");
    expect(result.explanationFacts.some((f) => f.includes("הביקוש גבוה"))).toBe(
      true
    );
  });

  it("B higher supply / low demand → LOW", () => {
    const result = computeMarketability({
      supplyCount: 20,
      demandCount: 8,
      supplyCoverageOk: true,
      demandCoverageOk: true,
    });
    expect(result.band).toBe("LOW");
  });

  it("C insufficient data stays UNKNOWN", () => {
    const result = computeMarketability({
      supplyCount: null,
      demandCount: 12,
      supplyCoverageOk: false,
      demandCoverageOk: true,
    });
    expect(result.band).toBe("UNKNOWN");
    expect(result.coverage).toBe("LIMITED");
    expect(result.explanationFacts).toContain(MARKET_ACTIVITY_COPY.insufficient);
  });

  it("own customers cannot promote a tiny sample to HIGH", () => {
    const result = computeMarketability({
      supplyCount: 1,
      demandCount: 1,
      supplyCoverageOk: false,
      demandCoverageOk: false,
      customerMatchCount: 6,
    });
    expect(result.band).toBe("UNKNOWN");
  });

  it("H balanced sample is MEDIUM", () => {
    const result = computeMarketability({
      supplyCount: 10,
      demandCount: 11,
      supplyCoverageOk: true,
      demandCoverageOk: true,
    });
    expect(result.band).toBe("MEDIUM");
  });
});

describe("price position + purchase snapshot", () => {
  it("compares Decision ask to asking-B2B range only", () => {
    const pos = computePricePosition({
      subjectPrice: 168000,
      rangeLow: 176000,
      rangeHigh: 188000,
    });
    expect(pos.band).toBe("BELOW_RANGE");
    expect(pos.semantic).toBe("network_asking_b2b");
  });

  it("purchase snapshot uses Decision price authority and no verdict", () => {
    const snap = assemblePurchaseSnapshot({
      decision: purchaseDecision,
      vehicle: { id: "v1", make: "BMW", model: "X3", year: 2022, trim: null },
      marketActivity: activity({
        supplyCount: 14,
        demandCount: 23,
        matches: 9,
        customers: 2,
      }),
    });
    expect(snap.incomingAskPrice).toBe(168000);
    expect(snap.matchingCustomers.count).toBe(2);
    expect(snap.comparablePriceRange.low).toBe(176000);
    expect(snap.comparablePriceRange.high).toBe(188000);
    expect(JSON.stringify(snap)).not.toMatch(/BUY|DON'T BUY|GOOD DEAL|BAD DEAL/);
    expect(snap.missingInformation).not.toContain("incomingAskPrice");
  });

  it("marks missing ask price", () => {
    const snap = assemblePurchaseSnapshot({
      decision: { ...purchaseDecision, incomingAskPrice: null },
      vehicle: { id: "v1", make: "BMW", model: "X3", year: 2022, trim: null },
      marketActivity: activity({
        supplyCount: null,
        demandCount: null,
        supplyOk: false,
        demandOk: false,
      }),
    });
    expect(snap.missingInformation).toEqual(
      expect.arrayContaining(["incomingAskPrice", "market_sample"])
    );
  });
});

describe("trade snapshot", () => {
  const tradeDecision = {
    ...purchaseDecision,
    type: "TRADE" as const,
    incomingAskPrice: null,
    incomingAgreedPrice: 120000,
    outgoingVehicleId: "v-out",
    outgoingAgreedPrice: 190000,
  };

  it("F outgoing marketability > incoming and cash difference only when both known", () => {
    const incoming = activity({
      supplyCount: 18,
      demandCount: 8,
      customers: 2,
    });
    const outgoing = activity({
      supplyCount: 11,
      demandCount: 28,
    });
    expect(outgoing.marketability.band).toBe("HIGH");
    expect(incoming.marketability.band).toBe("LOW");
    const snap = assembleTradeSnapshot({
      decision: tradeDecision,
      incomingVehicle: {
        id: "v1",
        make: "BMW",
        model: "X1",
        year: 2018,
        trim: null,
      },
      outgoingVehicle: {
        id: "v-out",
        make: "BMW",
        model: "X3",
        year: 2022,
        trim: null,
      },
      incomingActivity: incoming,
      outgoingActivity: outgoing,
      outgoingDaysInInventory: 21,
      outgoingAskingB2B: 185000,
      outgoingAskingRetail: 210000,
    });
    expect(snap.incoming.marketActivity?.marketability.band).toBe("LOW");
    expect(snap.outgoing.marketability?.band).toBe("HIGH");
    expect(snap.financial.customerCashDifference).toBe(70000);
    expect(snap.financial.cashDifferenceSemantic).toBe(
      "outgoing_agreed_minus_incoming_agreed"
    );
    expect(snap.comparison.facts.some((f) => f.key === "outgoing_more_demanded")).toBe(
      true
    );
    expect(snap.comparison.facts.some((f) => f.key === "incoming_has_matching_customers")).toBe(
      true
    );
    expect(JSON.stringify(snap)).not.toMatch(/כדאי לקחת|לא כדאי|SOLD/);
  });

  it("G incoming marketability > outgoing", () => {
    const snap = assembleTradeSnapshot({
      decision: { ...tradeDecision, outgoingAgreedPrice: null },
      incomingVehicle: {
        id: "v1",
        make: "BMW",
        model: "X3",
        year: 2022,
        trim: null,
      },
      outgoingVehicle: {
        id: "v-out",
        make: "Kia",
        model: "Picanto",
        year: 2016,
        trim: null,
      },
      incomingActivity: activity({ supplyCount: 11, demandCount: 28 }),
      outgoingActivity: activity({ supplyCount: 18, demandCount: 8 }),
      outgoingDaysInInventory: null,
      outgoingAskingB2B: null,
      outgoingAskingRetail: null,
    });
    expect(snap.incoming.marketability?.band).toBe("HIGH");
    expect(snap.outgoing.marketability?.band).toBe("LOW");
    expect(snap.financial.customerCashDifference).toBeNull();
    expect(snap.financial.outgoingAgreedPriceMissing).toBe(true);
    expect(snap.missingInformation).toContain("outgoingAgreedPrice");
  });

  it("does not invent outgoingAgreedPrice from retail", () => {
    const snap = assembleTradeSnapshot({
      decision: { ...tradeDecision, outgoingAgreedPrice: null },
      incomingVehicle: {
        id: "v1",
        make: "BMW",
        model: "X3",
        year: 2022,
        trim: null,
      },
      outgoingVehicle: {
        id: "v-out",
        make: "BMW",
        model: "X3",
        year: 2022,
        trim: null,
      },
      incomingActivity: activity({
        supplyCount: 10,
        demandCount: 10,
      }),
      outgoingActivity: activity({
        supplyCount: 10,
        demandCount: 10,
      }),
      outgoingDaysInInventory: 4,
      outgoingAskingB2B: 100,
      outgoingAskingRetail: 999999,
    });
    expect(snap.financial.outgoingAgreedPrice).toBeNull();
    expect(snap.financial.customerCashDifference).toBeNull();
    expect(snap.outgoing.currentAskingRetail).toBe(999999);
  });
});

describe("privacy + synthetic isolation + contracts", () => {
  it("REAL dealer counterpart filter excludes SYNTHETIC", () => {
    expect(
      counterpartMarketWhere({
        marketMode: "REAL",
        canAccessSyntheticMarket: false,
      })
    ).toEqual({ marketMode: { not: "SYNTHETIC" } });
    expect(
      counterpartMarketWhere({
        marketMode: "REAL",
        canAccessSyntheticMarket: true,
      })
    ).toEqual({});
    expect(
      counterpartMarketWhere({
        marketMode: "SYNTHETIC",
        canAccessSyntheticMarket: true,
      })
    ).toEqual({ marketMode: "SYNTHETIC" });
  });

  it("match/interest/reveal stay factual and never mean deals", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/market/activity.ts"),
      "utf8"
    );
    expect(src).toContain("candidateMatch.findMany");
    expect(src).toContain("createdAt: { gte: since }");
    expect(src).toContain('status: "INTERESTED"');
    expect(src).toContain("revealedAt: { gte: since }");
    expect(src).toContain("buyerInterest.findMany");
    expect(src).toContain("reveal.findMany");
    expect(src).not.toContain("DEAL_CLOSED");
    expect(src).not.toContain("outcome");
  });

  it("central thresholds are the only numeric floors", () => {
    expect(minCohortObservations()).toBeGreaterThanOrEqual(3);
    expect(minDistinctDealers()).toBeGreaterThanOrEqual(3);
    const activitySrc = readFileSync(
      join(process.cwd(), "src/services/market/activity.ts"),
      "utf8"
    );
    const snapSrc = readFileSync(
      join(process.cwd(), "src/services/decisions/decision-snapshot.ts"),
      "utf8"
    );
    expect(activitySrc).toContain("@/services/market/thresholds");
    expect(snapSrc).not.toMatch(/BUY|DON'T BUY/);
    expect(snapSrc).not.toContain("convertToOwnedInventory");
    expect(snapSrc).not.toContain('status: "SOLD"');
    expect(activitySrc).not.toMatch(/dealVolume|medianDeal|conversionRate|transaction volume/i);
    expect(activitySrc).not.toContain("נפח עסקאות");
  });

  it("no backend test uses an absolute Mobile repository path", () => {
    const dir = join(process.cwd(), "tests");
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".ts") && !name.endsWith(".js")) continue;
      const src = readFileSync(join(dir, name), "utf8");
      const banned = ["srv", "gal", "REMATCHER-Exchange-Mobile"].join("/");
      expect(src.includes(`/${banned}`)).toBe(false);
    }
  });
});

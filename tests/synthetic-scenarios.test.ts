import { describe, expect, it } from "vitest";
import {
  assemblePurchaseSnapshot,
  assembleTradeSnapshot,
} from "@/services/decisions/decision-snapshot";
import { counterpartMarketWhere } from "@/services/dealer/market-scope";
import { isMaterialRejectedMatchChange } from "@/services/domain/matching-flow";
import { toDealerFacingMatchState } from "@/services/matching/dealer-facing-state";
import type { MarketActivitySnapshot } from "@/services/market/activity";
import {
  computeMarketability,
  computePricePosition,
} from "@/services/market/marketability";
import { MARKET_ACTIVITY_COPY } from "@/services/market/thresholds";

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
  const marketability = computeMarketability({
    supplyCount: over.supplyCount ?? null,
    demandCount: over.demandCount ?? null,
    supplyCoverageOk: supplyOk,
    demandCoverageOk: demandOk,
    matchCount30d: over.matches ?? null,
    customerMatchCount: over.customers ?? 0,
  });
  return {
    subject: { make: "Mazda", model: "CX-5", year: 2022 },
    generatedAt: "2026-09-19T00:00:00.000Z",
    dataCoverage: marketability.coverage,
    coverageCopy:
      marketability.coverage === "SUFFICIENT"
        ? null
        : MARKET_ACTIVITY_COPY.insufficient,
    supply: { count: over.supplyCount ?? null, insufficientData: !supplyOk },
    demand: { count: over.demandCount ?? null, insufficientData: !demandOk },
    matches: {
      count: over.matches ?? null,
      insufficientData: over.matches == null,
      lookbackDays: 30,
    },
    interest: { count: null, insufficientData: true, lookbackDays: 30 },
    reveals: { count: null, insufficientData: true, lookbackDays: 30 },
    pricePosition: computePricePosition({
      subjectPrice: 90000,
      rangeLow: 80000,
      rangeHigh: 110000,
    }),
    comparablePriceRange: {
      low: 80000,
      high: 110000,
      median: 95000,
      insufficientData: false,
      priceFamily: "SUPPLY_ASKING_PRICE_B2B",
      copy: null,
    },
    marketability,
    customerMatches: { count: over.customers ?? 0, scope: "dealer_local" },
    cohort: {
      make: "Mazda",
      model: "CX-5",
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
  incomingAskPrice: 90000,
  incomingAgreedPrice: null,
  outgoingVehicleId: null,
  outgoingAgreedPrice: null,
  openedAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
  decidedAt: null,
  outgoingVehicle: null,
};

describe("synthetic product-core scenarios", () => {
  it("5 purchase + own customer match keeps customer separate from network HIGH", () => {
    const snap = assemblePurchaseSnapshot({
      decision: purchaseDecision,
      vehicle: { id: "v1", make: "Mazda", model: "CX-5", year: 2022, trim: null },
      marketActivity: activity({
        supplyCount: 1,
        demandCount: 1,
        supplyOk: false,
        demandOk: false,
        customers: 2,
      }),
    });
    expect(snap.marketability.band).toBe("UNKNOWN");
    expect(snap.matchingCustomers.count).toBe(2);
    expect(JSON.stringify(snap)).not.toMatch(/BUY|DON'T BUY|כדאי לקנות/);
  });

  it("6 purchase + no customer match reports zero customers", () => {
    const snap = assemblePurchaseSnapshot({
      decision: purchaseDecision,
      vehicle: { id: "v1", make: "Mazda", model: "CX-5", year: 2022, trim: null },
      marketActivity: activity({ supplyCount: 6, demandCount: 6, customers: 0 }),
    });
    expect(snap.matchingCustomers.count).toBe(0);
    expect(snap.marketability.band).toBe("MEDIUM");
  });

  it("7/8 trade comparison does not invent a take-trade verdict", () => {
    const high = activity({ supplyCount: 4, demandCount: 8 });
    const low = activity({ supplyCount: 9, demandCount: 3 });
    const snap = assembleTradeSnapshot({
      decision: {
        ...purchaseDecision,
        type: "TRADE",
        incomingAskPrice: null,
        incomingAgreedPrice: 40000,
        outgoingAgreedPrice: 70000,
        outgoingVehicleId: "out1",
      },
      incomingVehicle: { id: "in1", make: "Hyundai", model: "Tucson", year: 2018, trim: null },
      outgoingVehicle: { id: "out1", make: "Mazda", model: "CX-5", year: 2022, trim: null },
      incomingActivity: low,
      outgoingActivity: high,
      outgoingDaysInInventory: null,
      outgoingAskingB2B: null,
      outgoingAskingRetail: null,
    });
    expect(snap.outgoing.marketability?.band).toBe("HIGH");
    expect(snap.incoming.marketability?.band).toBe("LOW");
    expect(JSON.stringify(snap)).not.toMatch(/כדאי לקחת את הטרייד/);
    expect(JSON.stringify(snap)).not.toMatch(/"deals"/);
  });

  it("11/12 dealer-facing states for reveal vs reject", () => {
    expect(toDealerFacingMatchState({ lifecycle: "REVEALED" })).toBe("CONTACT_READY");
    expect(
      toDealerFacingMatchState({
        lifecycle: "QUALIFIED",
        buyerInterestStatus: "REJECTED",
      })
    ).toBe("NOT_RELEVANT");
  });

  it("16 rejected match is not resurfaced without material change", () => {
    expect(
      isMaterialRejectedMatchChange({
        priorBand: "STRONG",
        priorEngine: "exchange-v2",
        nextBand: "STRONG",
        nextEngine: "exchange-v2",
      })
    ).toBe(false);
  });

  it("17 REAL dealer filter hides SYNTHETIC counterpart", () => {
    expect(
      counterpartMarketWhere({
        marketMode: "REAL",
        canAccessSyntheticMarket: false,
      })
    ).toEqual({ marketMode: { not: "SYNTHETIC" } });
  });
});

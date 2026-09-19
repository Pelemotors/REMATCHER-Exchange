import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketActivitySnapshot } from "@/services/market/activity";
import { computeMarketability } from "@/services/market/marketability";
import { MARKET_ACTIVITY_COPY } from "@/services/market/thresholds";

const getDecisionForVehicle = vi.fn();
const collectMarketActivity = vi.fn();
const vehicleFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: { findFirst: (...args: unknown[]) => vehicleFindFirst(...args) },
  },
}));
vi.mock("@/services/decisions/vehicle-decision", () => ({
  getDecisionForVehicle: (...args: unknown[]) => getDecisionForVehicle(...args),
}));
vi.mock("@/services/market/activity", () => ({
  collectMarketActivity: (...args: unknown[]) => collectMarketActivity(...args),
}));

import { getDecisionSnapshot } from "@/services/decisions/decision-snapshot";

function activity(band: "HIGH" | "LOW" | "UNKNOWN"): MarketActivitySnapshot {
  const high = band === "HIGH";
  const unknown = band === "UNKNOWN";
  const marketability = computeMarketability({
    supplyCount: unknown ? null : high ? 11 : 18,
    demandCount: unknown ? null : high ? 28 : 8,
    supplyCoverageOk: !unknown,
    demandCoverageOk: !unknown,
    customerMatchCount: 0,
  });
  return {
    subject: { id: "v", make: "BMW", model: "X3", year: 2022 },
    generatedAt: "2026-09-19T12:00:00.000Z",
    dataCoverage: marketability.coverage,
    coverageCopy:
      marketability.coverage === "SUFFICIENT"
        ? null
        : MARKET_ACTIVITY_COPY.insufficient,
    supply: {
      count: unknown ? null : high ? 11 : 18,
      insufficientData: unknown,
    },
    demand: {
      count: unknown ? null : high ? 28 : 8,
      insufficientData: unknown,
    },
    matches: { count: unknown ? null : 9, insufficientData: unknown, lookbackDays: 30 },
    interest: { count: null, insufficientData: true, lookbackDays: 30 },
    reveals: { count: null, insufficientData: true, lookbackDays: 30 },
    pricePosition: {
      band: "UNKNOWN",
      semantic: "network_asking_b2b",
      subjectPrice: 168000,
      rangeLow: null,
      rangeHigh: null,
    },
    comparablePriceRange: {
      low: null,
      high: null,
      median: null,
      insufficientData: true,
      priceFamily: "SUPPLY_ASKING_PRICE_B2B",
      copy: MARKET_ACTIVITY_COPY.insufficientPriceRange,
    },
    marketability,
    customerMatches: { count: 0, scope: "dealer_local" },
    cohort: {
      make: "BMW",
      model: "X3",
      yearMin: 2022,
      yearMax: 2022,
      fuel: null,
      source: "exchange-intelligence/engine",
      dimensions: ["canonical_make"],
    },
  };
}

const openPurchase = {
  id: "dec-1",
  dealerId: "d1",
  vehicleId: "v-in",
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

describe("getDecisionSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vehicleFindFirst.mockResolvedValue({
      id: "v-in",
      make: "BMW",
      model: "X3",
      year: 2022,
      trim: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      dealerRelationship: "OFFERED_TO_ME",
      b2bPrice: null,
      retailPrice: null,
      status: "ACTIVE",
    });
    collectMarketActivity.mockResolvedValue(activity("HIGH"));
  });

  it("only OPEN Decision gets an active snapshot workspace", async () => {
    getDecisionForVehicle.mockResolvedValue({
      ...openPurchase,
      status: "ACCEPTED",
    });
    const snap = await getDecisionSnapshot({ dealerId: "d1", vehicleId: "v-in" });
    expect(snap.workspaceActive).toBe(false);
    if (!snap.workspaceActive) expect(snap.reason).toBe("decision_terminal");
    expect(collectMarketActivity).not.toHaveBeenCalled();
  });

  it("PURCHASE snapshot uses Decision ask and does not auto-SOLD", async () => {
    getDecisionForVehicle.mockResolvedValue(openPurchase);
    const snap = await getDecisionSnapshot({ dealerId: "d1", vehicleId: "v-in" });
    expect(snap.workspaceActive).toBe(true);
    if (!snap.workspaceActive || snap.kind !== "PURCHASE") {
      throw new Error("expected purchase workspace");
    }
    expect(snap.purchase.incomingAskPrice).toBe(168000);
    expect(snap.purchase.marketability.band).toBe("HIGH");
    expect(JSON.stringify(snap)).not.toMatch(/BUY|DON'T BUY/);
    expect(vehicleFindFirst.mock.calls.every((call) => {
      const args = call[0] as { data?: unknown };
      return args?.data == null;
    })).toBe(true);
  });

  it("TRADE snapshot loads both sides and leaves outgoing unsold", async () => {
    getDecisionForVehicle.mockResolvedValue({
      ...openPurchase,
      type: "TRADE",
      incomingAskPrice: null,
      incomingAgreedPrice: 110000,
      outgoingVehicleId: "v-out",
      outgoingAgreedPrice: 180000,
    });
    vehicleFindFirst.mockImplementation(async (args: { where?: { id?: string } }) => {
      if (args.where?.id === "v-out") {
        return {
          id: "v-out",
          make: "Audi",
          model: "A3",
          year: 2021,
          trim: null,
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
          dealerRelationship: "OWNED",
          b2bPrice: 175000,
          retailPrice: 199000,
          status: "ACTIVE",
        };
      }
      return {
        id: "v-in",
        make: "BMW",
        model: "X3",
        year: 2022,
        trim: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        dealerRelationship: "TRADE_IN_CANDIDATE",
        b2bPrice: null,
        retailPrice: null,
        status: "ACTIVE",
      };
    });
    collectMarketActivity
      .mockResolvedValueOnce(activity("LOW"))
      .mockResolvedValueOnce(activity("HIGH"));

    const snap = await getDecisionSnapshot({ dealerId: "d1", vehicleId: "v-in" });
    expect(snap.workspaceActive).toBe(true);
    if (!snap.workspaceActive || snap.kind !== "TRADE") {
      throw new Error("expected trade workspace");
    }
    expect(snap.trade.incoming.marketability?.band).toBe("LOW");
    expect(snap.trade.outgoing.marketability?.band).toBe("HIGH");
    expect(snap.trade.outgoing.vehicle?.id).toBe("v-out");
    expect(snap.trade.financial.customerCashDifference).toBe(70000);
    expect(snap.trade.outgoing.daysInDealerInventory).toBeGreaterThan(0);
    expect(JSON.stringify(snap)).not.toContain("SOLD");
  });
});

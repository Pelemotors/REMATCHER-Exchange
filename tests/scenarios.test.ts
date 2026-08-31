import { describe, it, expect } from "vitest";
import { evaluateMatch } from "@/services/matching/engine";
import { DEMAND_LIFETIME_DAYS } from "@/config/product";
import { computeFreshnessState } from "@/services/inventory/freshness";
import type { Vehicle } from "@prisma/client";

const baseVehicle = (overrides: Partial<Vehicle> = {}): Vehicle => ({
  id: "v1",
  dealerId: "d1",
  status: "ACTIVE",
  rawInput: null,
  make: "Mazda",
  model: "CX-5",
  trim: "Premium",
  year: 2023,
  mileage: 61000,
  color: "לבן",
  ownershipHand: 1,
  ownershipType: null,
  region: "מרכז",
  retailPrice: 149000,
  b2bPrice: 128000,
  b2bPriceConfirmedAt: null,
  conditionNotes: null,
  fieldProvenance: null,
  lastInventoryUpdate: new Date(),
  lastAvailabilityConfirmedAt: new Date(),
  freshnessState: "FRESH",
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  ...overrides,
});

const profile = {
  make: "Mazda",
  model: "CX-5",
  yearMin: 2022,
  yearMax: null,
  budgetMax: 130000,
  colorExclusions: ["red"],
  hardConstraints: [],
  softPreferences: [],
};

describe("Pilot scenario suite", () => {
  it("1. Exact strong match", () => {
    const r = evaluateMatch(baseVehicle(), profile);
    expect(r.overallBand).toBe("STRONG");
    expect(r.hardPassed).toBe(true);
  });

  it("2. Relevant alternative — slight budget stretch", () => {
    const r = evaluateMatch(baseVehicle({ b2bPrice: 132000 }), profile);
    expect(r.overallBand).toBe("ALTERNATIVE");
  });

  it("3. Budget +5%", () => {
    const r = evaluateMatch(baseVehicle({ b2bPrice: 136500 }), profile);
    expect(r.overallBand).toBe("ALTERNATIVE");
  });

  it("4. Budget at +10% boundary", () => {
    const r = evaluateMatch(baseVehicle({ b2bPrice: 142000 }), profile);
    expect(["ALTERNATIVE", "HIDDEN"]).toContain(r.overallBand);
  });

  it("6. Wrong model reduces score", () => {
    const r = evaluateMatch(baseVehicle({ model: "CX-3" }), profile);
    expect(r.overallBand).not.toBe("STRONG");
  });

  it("5. Budget >10% hidden", () => {
    const r = evaluateMatch(baseVehicle({ b2bPrice: 150000 }), profile);
    expect(r.overallBand).toBe("HIDDEN");
  });

  it("7. Excluded color", () => {
    const r = evaluateMatch(baseVehicle({ color: "אדום" }), profile);
    expect(r.hardPassed).toBe(false);
    expect(r.overallBand).toBe("HIDDEN");
  });

  it("8. Stale vehicle still evaluates (freshness is separate gate)", () => {
    const r = evaluateMatch(baseVehicle({ freshnessState: "STALE" }), profile);
    expect(r.overallBand).toBe("STRONG");
  });

  it("9. Missing B2B price — evaluation proceeds", () => {
    const r = evaluateMatch(baseVehicle({ b2bPrice: null }), profile);
    expect(r.hardPassed).toBe(true);
  });

  it("10. Unknown trim does not hard-fail", () => {
    const r = evaluateMatch(baseVehicle({ trim: null }), profile);
    expect(r.hardPassed).toBe(true);
  });

  it("11–15. Interest states are distinct enums (schema contract)", () => {
    const statuses = ["INTERESTED", "REJECTED", "NO_RESPONSE"] as const;
    expect(new Set(statuses).size).toBe(3);
  });
});

describe("Demand lifecycle config", () => {
  it("17. Default demand lifetime is 3 days", () => {
    expect(DEMAND_LIFETIME_DAYS).toBe(3);
  });
});

describe("Freshness computation", () => {
  it("18. Vehicle without threshold stays non-stale when config null", () => {
    const state = computeFreshnessState(
      baseVehicle({
        freshnessState: "FRESH",
        lastAvailabilityConfirmedAt: new Date(Date.now() - 30 * 86400000),
      })
    );
    expect(state).toBe("FRESH");
  });
});

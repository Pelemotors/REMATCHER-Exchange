import { describe, it, expect } from "vitest";
import {
  demandProfileFromConstraints,
  evaluateMatch,
} from "@/services/matching/engine";
import { parseDemandFallback } from "@/services/ai/demand-parser";
import { toBuyerMatchView } from "@/lib/privacy-views";
import type { Vehicle } from "@prisma/client";

const baseVehicle: Vehicle = {
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
  b2bPrice: 134000,
  b2bPriceConfirmedAt: null,
  conditionNotes: null,
  fieldProvenance: null,
  lastInventoryUpdate: new Date(),
  lastAvailabilityConfirmedAt: new Date(),
  freshnessState: "FRESH",
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
};

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

describe("Matching Engine Invariants", () => {
  it("I-06: hard color exclusion fails regardless of score", () => {
    const redVehicle = { ...baseVehicle, color: "אדום" };
    const result = evaluateMatch(redVehicle, profile);
    expect(result.hardPassed).toBe(false);
    expect(result.overallBand).toBe("HIDDEN");
  });

  it("I-09: unknown mileage does not fake match on missing fields", () => {
    const noMileage = { ...baseVehicle, mileage: null };
    const result = evaluateMatch(noMileage, profile);
    expect(result.fieldResults.some((f) => f.result === "UNKNOWN")).toBe(false);
  });

  it("§31: >10% over budget is hidden", () => {
    const expensive = { ...baseVehicle, b2bPrice: 150000 };
    const result = evaluateMatch(expensive, profile);
    expect(result.overallBand).toBe("HIDDEN");
  });

  it("§31: 0-10% over budget cannot be STRONG", () => {
    const slightlyOver = { ...baseVehicle, b2bPrice: 134000 };
    const result = evaluateMatch(slightlyOver, profile);
    expect(result.overallBand).not.toBe("STRONG");
    expect(result.overallBand).toBe("ALTERNATIVE");
  });

  it("§33: strong match for in-budget good fit", () => {
    const good = { ...baseVehicle, b2bPrice: 128000 };
    const result = evaluateMatch(good, profile);
    expect(result.overallBand).toBe("STRONG");
    expect(result.score).toBeGreaterThanOrEqual(90);
  });
});

describe("Demand Parser Fallback", () => {
  it("I-08: does not invent 7 seats for Kodiaq", () => {
    const result = parseDemandFallback("מחפש Kodiaq 2022 עד 150");
    const seatConstraint = result.hardConstraints.find(
      (c) => c.field === "seats"
    );
    expect(seatConstraint).toBeUndefined();
  });

  it("parses CX-5 demo demand", () => {
    const result = parseDemandFallback(
      "מחפש CX-5 מ-22 ומעלה, עד 130, לא אדום"
    );
    expect(result.model?.value).toBe("CX-5");
    expect(result.exclusions.length).toBeGreaterThan(0);
  });
});

describe("Privacy — Buyer Match View", () => {
  it("does not expose dealerId in buyer view", () => {
    const view = toBuyerMatchView({
      ...baseVehicle,
      dealerId: "secret-dealer-id",
    });
    expect(view).not.toHaveProperty("dealerId");
    expect(JSON.stringify(view)).not.toContain("secret-dealer-id");
  });
});

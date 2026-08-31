import { describe, it, expect } from "vitest";
import { evaluateMatch } from "@/services/matching/engine";
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

describe("Agent Gates — Hard Constraints", () => {
  it("§25: hard constraint always beats score", () => {
    const profile = {
      make: "Mazda",
      model: "CX-5",
      yearMin: 2022,
      yearMax: null,
      budgetMax: 200000,
      colorExclusions: ["red"],
      hardConstraints: [],
      softPreferences: [],
    };
    const redVehicle = { ...baseVehicle, color: "אדום" };
    const result = evaluateMatch(redVehicle, profile);
    expect(result.hardPassed).toBe(false);
    expect(result.overallBand).toBe("HIDDEN");
  });

  it("§26: unknown is distinct from match", () => {
    const profile = {
      make: "Mazda",
      model: "CX-5",
      yearMin: 2022,
      yearMax: null,
      budgetMax: 130000,
      colorExclusions: [],
      hardConstraints: [],
      softPreferences: [],
    };
    const noYear = { ...baseVehicle, year: null };
    const result = evaluateMatch(noYear, profile);
    expect(result.fieldResults.some((f) => f.result === "UNKNOWN")).toBe(true);
  });
});

describe("Agent Gates — Presentation Thresholds", () => {
  it("§34: buyer presentation thresholds 90/75", () => {
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
    const strong = evaluateMatch(
      { ...baseVehicle, b2bPrice: 128000 },
      profile
    );
    expect(strong.overallBand).toBe("STRONG");
    expect(strong.score).toBeGreaterThanOrEqual(90);

    const alt = evaluateMatch({ ...baseVehicle, b2bPrice: 134000 }, profile);
    expect(alt.overallBand).toBe("ALTERNATIVE");
  });
});

describe("Privacy Pre-Reveal", () => {
  it("§ pre-reveal: buyer view excludes dealer identity", async () => {
    const { toBuyerMatchView } = await import("@/lib/privacy-views");
    const view = toBuyerMatchView({
      ...baseVehicle,
      dealerId: "secret-dealer-id",
    });
    expect(JSON.stringify(view)).not.toContain("secret-dealer-id");
  });
});

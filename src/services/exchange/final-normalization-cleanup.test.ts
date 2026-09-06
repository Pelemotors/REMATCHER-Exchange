import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CANONICAL_VEHICLE_FEATURES, canonicalizeVehicleFeature } from "./vehicle-features";
import { evaluateMatchV2 } from "@/services/matching/engine-v2";
import { parseRow } from "@/services/inventory/column-mapper";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function vehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    dealerId: "seller",
    make: "Skoda",
    model: "Superb",
    trim: null,
    year: 2023,
    mileage: 40_000,
    color: null,
    ownershipHand: 1,
    ownershipType: "PRIVATE",
    b2bPrice: 110_000,
    retailPrice: 110_000,
    region: null,
    rawInput: null,
    status: "ACTIVE",
    freshnessState: "FRESH",
    lastInventoryUpdate: new Date(),
    lastAvailabilityConfirmedAt: new Date(),
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    fieldProvenance: { features: ["AWD_4X4"] },
    ...overrides,
  } as any;
}

function intent(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    make: { importance: "HARD", target: "Skoda", provenance: "user_stated" },
    model: { importance: "HARD", target: "Superb", provenance: "user_stated" },
    price: { importance: "HIGH", target: 100_000, provenance: "user_stated" },
    ...overrides,
  } as any;
}

describe("final AI normalization cleanup", () => {
  it("keeps natural-language demand fallback non-semantic", () => {
    const text = source("src/services/ai/demand-parser.ts");
    const fallback = text.slice(text.indexOf("export function parseDemandFallback"), text.indexOf("type StatusField"));
    expect(fallback).toContain("נדרש AI כדי להבין ולנרמל את החיפוש");
    expect(fallback).not.toMatch(/יונדאי|סקודה|מאזדה|diesel|hyundai|skoda|mazda/iu);
  });

  it("keeps natural-language inventory fallback non-semantic", () => {
    const text = source("src/services/ai/inventory-normalizer.ts");
    const fallback = text.slice(text.indexOf("export function normalizeVehicleFallback"), text.indexOf("function askingPriceField"));
    expect(fallback).toContain("נדרש AI כדי להבין ולנרמל את פרטי הרכב");
    expect(fallback).not.toMatch(/יונדאי|סקודה|מאזדה|diesel|hyundai|skoda|mazda/iu);
  });

  it("does not semantically canonicalize spreadsheet vehicle text before AI", () => {
    const text = source("src/services/inventory/column-mapper.ts");
    expect(text).not.toContain("canonicalizeVehicleIdentity");
    expect(text).not.toContain("canonicalizeFuelType");
    expect(text).not.toContain("canonicalizeOwnershipSource");
    const row = parseRow(
      ["סקודה", "סופרב", "2023", "דיזל", "1.6", "125000", "4x4"],
      { make: 0, model: 1, year: 2, fuelType: 3, engineDisplacementCc: 4, b2bPrice: 5, features: 6 }
    );
    expect(row.make).toBe("סקודה");
    expect(row.model).toBe("סופרב");
    expect(row.fuelType).toBe("דיזל");
    expect(row.engineDisplacementCc).toBe("1.6");
    expect(row.b2bPrice).toBe(125000);
    expect(row.retailPrice).toBe(125000);
    expect(row.features).toEqual(["4x4"]);
  });

  it("uses one logical asking price in the Agent tool surface", () => {
    const text = source("src/services/assistant/agent-tools.ts");
    const block = text.slice(text.indexOf('"update_inventory_draft"'), text.indexOf('"remember_dealer_insight"'));
    expect(block).toContain("ONE seller price: asking price");
    expect(block).toContain("b2bPrice: nullableNumber");
    expect(block).not.toContain("retailPrice: nullableNumber");
    expect(block).toContain("features:");
    expect(block).toContain("fuelType: nullableString");
    expect(block).toContain("engineDisplacementCc: nullableNumber");
  });

  it("supports the expanded canonical feature vocabulary", () => {
    for (const feature of ["MATRIX_LED", "AIR_SUSPENSION", "POWER_TAILGATE", "SEVEN_SEATS"] as const) {
      expect(CANONICAL_VEHICLE_FEATURES).toContain(feature);
      expect(canonicalizeVehicleFeature(feature)).toBe(feature);
    }
  });

  it("accepts old inventory rows with only retailPrice as the one asking price", () => {
    const result = evaluateMatchV2({ vehicle: vehicle({ b2bPrice: null, retailPrice: 100_000 }), intent: intent() });
    expect(result.resolutionState).toBe("RESOLVED");
    expect(result.band).not.toBe("NO_MATCH");
  });

  it("holds a match when seller asking price is missing", () => {
    const result = evaluateMatchV2({ vehicle: vehicle({ b2bPrice: null, retailPrice: null }), intent: intent() });
    expect(result.resolutionState).toBe("NEEDS_INFORMATION");
    expect(result.decisionBlockingUnknowns).toContain("price");
  });

  it("holds a match when buyer budget is missing", () => {
    const result = evaluateMatchV2({ vehicle: vehicle(), intent: intent({ price: undefined }) });
    expect(result.resolutionState).toBe("NEEDS_INFORMATION");
    expect(result.decisionBlockingUnknowns).toContain("buyerPrice");
  });

  it("rejects seller asking price above buyer budget by more than 10 percent", () => {
    const result = evaluateMatchV2({ vehicle: vehicle({ b2bPrice: 110_001, retailPrice: 110_001 }), intent: intent() });
    expect(result.band).toBe("NO_MATCH");
  });

  it("allows seller asking price at exactly 10 percent above buyer budget", () => {
    const result = evaluateMatchV2({ vehicle: vehicle({ b2bPrice: 110_000, retailPrice: 110_000 }), intent: intent() });
    expect(result.resolutionState).toBe("RESOLVED");
    expect(result.band).not.toBe("NO_MATCH");
  });

  it("asks for an explicitly required feature when its presence is unknown", () => {
    const result = evaluateMatchV2({
      vehicle: vehicle({ fieldProvenance: { features: [] } }),
      intent: intent({ featureRequirements: [{ feature: "AWD_4X4", importance: "HARD", provenance: "user_stated" }] }),
    });
    expect(result.resolutionState).toBe("NEEDS_INFORMATION");
    expect(result.decisionBlockingUnknowns).toContain("feature:AWD_4X4");
  });

  it("rejects a vehicle when seller explicitly confirms a required feature is absent", () => {
    const result = evaluateMatchV2({
      vehicle: vehicle({ fieldProvenance: { features: [], absentFeatures: ["AWD_4X4"] } }),
      intent: intent({ featureRequirements: [{ feature: "AWD_4X4", importance: "HARD", provenance: "user_stated" }] }),
    });
    expect(result.band).toBe("NO_MATCH");
  });
});

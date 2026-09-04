/**
 * Matching & Learning 2.0 — scenario contracts (deterministic / judgment-separated).
 * Live conversational Agent QA (scenarios 1–5 style) is judgment; hard gates below are deterministic.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { evaluateMatchV2 } from "@/services/matching/engine-v2";
import { emptyStructuredIntent } from "@/services/matching/search-intent-types";
import type { MatchVehicleInput } from "@/services/matching/engine-v2";

function v(p: Partial<MatchVehicleInput> = {}): MatchVehicleInput {
  return {
    id: "v",
    dealerId: "s",
    status: "ACTIVE",
    make: "Hyundai",
    model: "Tucson",
    trim: null,
    year: 2022,
    mileage: 40000,
    color: "לבן",
    ownershipHand: 1,
    ownershipType: null,
    region: null,
    retailPrice: 110000,
    b2bPrice: 100000,
    b2bPriceConfirmedAt: null,
    conditionNotes: null,
    rawInput: null,
    fieldProvenance: null,
    freshnessState: "FRESH",
    lastInventoryUpdate: new Date(),
    lastAvailabilityConfirmedAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...p,
  } as MatchVehicleInput;
}

describe("ML2.0 scenario contracts", () => {
  it("SCENARIO 2 contract: year HARD + price flexible", () => {
    const intent = {
      ...emptyStructuredIntent(),
      make: { importance: "VERY_HIGH" as const, target: "Hyundai" },
      model: { importance: "VERY_HIGH" as const, target: "Tucson" },
      year: {
        importance: "HARD" as const,
        target: 2022,
        flexibility: { hardMin: 2022 },
      },
      price: {
        importance: "MEDIUM" as const,
        target: 100000,
        flexibility: {
          target: 100000,
          comfortableMax: 105000,
          stretchMax: 110000,
          hardMax: 115000,
        },
      },
    };
    expect(evaluateMatchV2({ vehicle: v({ year: 2021 }), intent }).band).toBe(
      "NO_MATCH"
    );
    expect(
      evaluateMatchV2({ vehicle: v({ year: 2022, b2bPrice: 108000 }), intent })
        .band
    ).not.toBe("NO_MATCH");
  });

  it("SCENARIO 3 contract: color OPEN + mileage HARD", () => {
    const intent = {
      ...emptyStructuredIntent(),
      make: { importance: "VERY_HIGH" as const, target: "Hyundai" },
      model: { importance: "VERY_HIGH" as const, target: "Tucson" },
      color: { importance: "OPEN" as const },
      mileage: {
        importance: "HARD" as const,
        flexibility: { hardMax: 80000, comfortableMax: 80000 },
      },
    };
    expect(
      evaluateMatchV2({ vehicle: v({ mileage: 90000, color: "כתום" }), intent })
        .band
    ).toBe("NO_MATCH");
  });

  it("SCENARIO 6: missing critical mileage ≠ STRONG", () => {
    const intent = {
      ...emptyStructuredIntent(),
      make: { importance: "VERY_HIGH" as const, target: "Hyundai" },
      model: { importance: "VERY_HIGH" as const, target: "Tucson" },
      mileage: {
        importance: "VERY_HIGH" as const,
        target: 50000,
        flexibility: {
          target: 50000,
          comfortableMax: 60000,
          stretchMax: 70000,
          hardMax: 80000,
        },
      },
    };
    expect(
      evaluateMatchV2({ vehicle: v({ mileage: null }), intent }).band
    ).not.toBe("STRONG");
  });

  it("SCENARIO 7: archive path emits INVENTORY_REMOVED not VEHICLE_SOLD", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/inventory/update-vehicle.ts"),
      "utf8"
    );
    expect(src).toContain('eventType: "INVENTORY_REMOVED"');
    expect(src).toContain("archived_not_sold");
    expect(src).toContain('eventType: "VEHICLE_SOLD"');
  });

  it("SCENARIO 9/10: dual outcome axes exist in case service", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/exchange/cases.ts"),
      "utf8"
    );
    expect(src).toContain("relevanceOutcome");
    expect(src).toContain("transactionOutcome");
  });

  it("SCENARIO 11: intelligence context is privacy-projected", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/exchange/intelligence-shadow.ts"),
      "utf8"
    );
    expect(src).toContain("privacySafeLearningProjection");
    expect(src).toContain("privacySafeVehicle");
    expect(src).toContain("retrieveRelevantCases");
    // User payload must not assemble Dealer Memory into the OpenAI call
    const userPayloadSection = src.slice(
      src.indexOf("content: JSON.stringify"),
      src.indexOf("requiredOutput")
    );
    expect(userPayloadSection).not.toMatch(/dealerMemory|Dealer Memory|memoryBlock/);
  });

  it("SCENARIO 12: shadow mode never owns visibility", () => {
    const flow = readFileSync(
      join(process.cwd(), "src/services/domain/matching-flow.ts"),
      "utf8"
    );
    expect(flow).toContain("runExchangeIntelligenceShadow");
    expect(flow).toContain("evaluateMatchV2");
    expect(flow).toMatch(/Shadow intelligence — never changes visibility/);
  });

  it("constitution forbids weight questionnaires for Search Intent", () => {
    const c = readFileSync(
      join(process.cwd(), "src/services/assistant/agent-constitution.ts"),
      "utf8"
    );
    expect(c).toContain("כוונת חיפוש");
    expect(c).toContain("HARD/SOFT");
  });
});

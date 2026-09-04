/**
 * Matching Engine 2.0 evaluation suite — scenarios A–I from Matching & Learning 2.0.
 */
import { describe, expect, it } from "vitest";
import type { Vehicle } from "@prisma/client";
import {
  evaluateMatchV2,
  type MatchVehicleInput,
} from "@/services/matching/engine-v2";
import type { StructuredSearchIntent } from "@/services/matching/search-intent-types";
import { legacyToSearchIntent } from "@/services/matching/legacy-search-intent-adapter";
import { emptyStructuredIntent } from "@/services/matching/search-intent-types";

function vehicle(partial: Partial<MatchVehicleInput> = {}): MatchVehicleInput {
  return {
    id: "v1",
    dealerId: "d-seller",
    status: "ACTIVE",
    make: "Hyundai",
    model: "Tucson",
    trim: null,
    year: 2022,
    mileage: 45000,
    color: "לבן",
    ownershipHand: 1,
    ownershipType: null,
    retailPrice: 115000,
    b2bPrice: 100000,
    b2bPriceConfirmedAt: null,
    conditionNotes: null,
    region: "מרכז",
    rawInput: null,
    fieldProvenance: null,
    freshnessState: "FRESH",
    lastInventoryUpdate: new Date(),
    lastAvailabilityConfirmedAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as MatchVehicleInput;
}

function baseIntent(
  overrides: Partial<StructuredSearchIntent> = {}
): StructuredSearchIntent {
  return {
    ...emptyStructuredIntent(),
    make: { importance: "VERY_HIGH", target: "Hyundai" },
    model: { importance: "VERY_HIGH", target: "Tucson" },
    year: {
      importance: "HIGH",
      target: 2022,
      flexibility: { hardMin: 2022, comfortableMin: 2022, target: 2022 },
    },
    price: {
      importance: "HIGH",
      target: 100000,
      flexibility: {
        target: 100000,
        comfortableMax: 103000,
        stretchMax: 106000,
        hardMax: 108000,
      },
    },
    ...overrides,
  };
}

describe("Matching Engine 2.0 suite", () => {
  it("A: same vehicle ranks differently when mileage vs color importance differ", () => {
    const v = vehicle({ mileage: 90000, color: "אדום" });
    const mileageHeavy = baseIntent({
      mileage: {
        importance: "VERY_HIGH",
        target: 50000,
        flexibility: {
          target: 50000,
          comfortableMax: 60000,
          stretchMax: 70000,
          hardMax: 120000,
        },
      },
      color: { importance: "OPEN" },
    });
    const colorHeavy = baseIntent({
      mileage: {
        importance: "PREFERENCE",
        target: 50000,
        flexibility: {
          target: 50000,
          comfortableMax: 100000,
          stretchMax: 120000,
          hardMax: 150000,
        },
      },
      color: { importance: "VERY_HIGH", target: "לבן" },
    });
    const a = evaluateMatchV2({ vehicle: v, intent: mileageHeavy });
    const b = evaluateMatchV2({ vehicle: v, intent: colorHeavy });
    expect(a.score).not.toBe(b.score);
  });

  it("B: trade-off prefers +5k price over +30k km", () => {
    const intent = baseIntent({
      tradeOffNotes: ["prefer +5k price over +30k km"],
      price: {
        importance: "HIGH",
        target: 100000,
        flexibility: {
          target: 100000,
          comfortableMax: 105000,
          stretchMax: 108000,
          hardMax: 110000,
        },
      },
      mileage: {
        importance: "VERY_HIGH",
        target: 50000,
        flexibility: {
          target: 50000,
          comfortableMax: 55000,
          stretchMax: 60000,
          hardMax: 70000,
        },
      },
    });
    const pricey = evaluateMatchV2({
      vehicle: vehicle({ b2bPrice: 105000, mileage: 50000 }),
      intent,
    });
    const highKm = evaluateMatchV2({
      vehicle: vehicle({ b2bPrice: 100000, mileage: 80000 }),
      intent,
    });
    expect(pricey.band).not.toBe("NO_MATCH");
    expect(highKm.band === "NO_MATCH" || highKm.score < pricey.score).toBe(
      true
    );
  });

  it("C: HARD fuel mismatch → NO_MATCH even if rest perfect", () => {
    const intent = baseIntent({
      fuel: { importance: "HARD", target: "דיזל" },
    });
    const ev = evaluateMatchV2({
      vehicle: vehicle({ fuel: "בנזין" }),
      intent,
    });
    expect(ev.band).toBe("NO_MATCH");
    expect(ev.hardChecks.some((h) => h.includes("fuel"))).toBe(true);
  });

  it("D: price slightly above target inside stretch stays Match", () => {
    const ev = evaluateMatchV2({
      vehicle: vehicle({ b2bPrice: 105000 }),
      intent: baseIntent(),
    });
    expect(["STRONG", "GOOD", "ALTERNATIVE"]).toContain(ev.band);
  });

  it("E: missing critical mileage cannot be STRONG", () => {
    const ev = evaluateMatchV2({
      vehicle: vehicle({ mileage: null }),
      intent: baseIntent({
        mileage: {
          importance: "VERY_HIGH",
          target: 50000,
          flexibility: {
            target: 50000,
            comfortableMax: 60000,
            stretchMax: 70000,
            hardMax: 80000,
          },
        },
      }),
    });
    expect(ev.band).not.toBe("STRONG");
    expect(ev.verificationRequired || ev.unknowns.length > 0).toBe(true);
  });

  it("F: wrong model with perfect price/year/color is not STRONG", () => {
    const ev = evaluateMatchV2({
      vehicle: vehicle({
        make: "Toyota",
        model: "Corolla",
        year: 2022,
        b2bPrice: 100000,
        color: "לבן",
      }),
      intent: baseIntent(),
    });
    expect(ev.band).toBe("NO_MATCH");
  });

  it("G: preference color mismatch does not hard-fail", () => {
    const ev = evaluateMatchV2({
      vehicle: vehicle({ color: "אדום" }),
      intent: baseIntent({
        color: { importance: "PREFERENCE", target: "לבן" },
      }),
    });
    expect(ev.band).not.toBe("NO_MATCH");
    expect(ev.hardChecks.length).toBe(0);
  });

  it("H: HARD color exclusion fails", () => {
    const ev = evaluateMatchV2({
      vehicle: vehicle({ color: "אדום" }),
      intent: baseIntent({
        color: { importance: "HARD", exclusions: ["אדום"] },
      }),
    });
    expect(ev.band).toBe("NO_MATCH");
  });

  it("I: legacy Demand adapter yields reasonable evaluation", () => {
    const adapted = legacyToSearchIntent(
      {
        make: "Hyundai",
        model: "Tucson",
        yearMin: 2022,
        budgetMax: 100000,
      },
      []
    );
    const ev = evaluateMatchV2({
      vehicle: vehicle(),
      intent: adapted.structuredIntent,
    });
    expect(["STRONG", "GOOD", "ALTERNATIVE"]).toContain(ev.band);
    expect(adapted.naturalLanguageSummary.length).toBeGreaterThan(0);
  });

  it("year HARD + price flexible maps correctly", () => {
    const intent = baseIntent({
      year: {
        importance: "HARD",
        target: 2022,
        flexibility: { hardMin: 2022, comfortableMin: 2022 },
      },
      price: {
        importance: "MEDIUM",
        target: 100000,
        flexibility: {
          target: 100000,
          comfortableMax: 105000,
          stretchMax: 110000,
          hardMax: 115000,
        },
      },
    });
    expect(
      evaluateMatchV2({ vehicle: vehicle({ year: 2021 }), intent }).band
    ).toBe("NO_MATCH");
    expect(
      evaluateMatchV2({
        vehicle: vehicle({ year: 2022, b2bPrice: 108000 }),
        intent,
      }).band
    ).not.toBe("NO_MATCH");
  });

  it("color OPEN + mileage HARD boundary", () => {
    const intent = baseIntent({
      color: { importance: "OPEN" },
      mileage: {
        importance: "HARD",
        target: 80000,
        flexibility: { hardMax: 80000, comfortableMax: 80000, target: 50000 },
      },
    });
    expect(
      evaluateMatchV2({
        vehicle: vehicle({ mileage: 90000, color: "כתום" }),
        intent,
      }).band
    ).toBe("NO_MATCH");
    expect(
      evaluateMatchV2({
        vehicle: vehicle({ mileage: 70000, color: "כתום" }),
        intent,
      }).band
    ).not.toBe("NO_MATCH");
  });
});

// silence unused Vehicle import warning if any
void (null as unknown as Vehicle);

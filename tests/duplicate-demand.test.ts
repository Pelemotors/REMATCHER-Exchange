import { describe, it, expect } from "vitest";
import {
  compareDemands,
  findDuplicateDemand,
} from "@/services/demand/duplicate-detection";

describe("Duplicate Demand Detection", () => {
  const existing = {
    id: "d1",
    status: "ACTIVE",
    confirmedJson: {
      make: "Mazda",
      model: "CX-5",
      yearMin: 2022,
      budgetMax: 130000,
      colorExclusions: ["red"],
    },
  };

  it("detects nearly identical CX5 Hebrew variant", () => {
    const result = findDuplicateDemand(
      {
        make: "מאזדה",
        model: "CX5",
        yearMin: 2022,
        budgetMax: 130000,
        colorExclusions: ["red"],
      },
      [existing]
    );
    expect(result.level).toBe("NEARLY_IDENTICAL");
    expect(result.existingDemandId).toBe("d1");
  });

  it("detects highly similar budget/year change", () => {
    const result = compareDemands(
      { make: "Mazda", model: "CX-5", yearMin: 2023, budgetMax: 140000 },
      {
        make: "Mazda",
        model: "CX-5",
        yearMin: 2022,
        budgetMax: 130000,
      }
    );
    expect(result.level).toBe("HIGHLY_SIMILAR");
    expect(result.differences.length).toBeGreaterThan(0);
  });

  it("treats different model as DIFFERENT", () => {
    const result = compareDemands(
      { make: "Toyota", model: "Corolla", yearMin: 2021, budgetMax: 100000 },
      {
        make: "Mazda",
        model: "CX-5",
        yearMin: 2022,
        budgetMax: 130000,
      }
    );
    expect(result.level).toBe("DIFFERENT");
  });
});

describe("Assistant fishing prevention", () => {
  it("blocks network inventory questions", async () => {
    const { runExchangeAssistant } = await import(
      "@/services/assistant/orchestrator"
    );
    const res = await runExchangeAssistant({
      dealerId: "dealer-a",
      userId: "user-a",
      message: "כמה CX-5 יש ברשת?",
      context: { route: "/home" },
    });
    expect(res.intent).toBe("FISHING_BLOCKED");
    expect(res.privacyBlocked).toBe(true);
  });
});

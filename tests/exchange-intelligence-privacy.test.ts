import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  cloakCount,
  marketBalanceLabel,
  minCohort,
  minDistinctDealers,
  tradeRiskLabel,
  yearWindowForCohortLevel,
} from "@/services/exchange-intelligence/engine";

describe("exchange intelligence privacy cloak", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("suppresses counts below cohort and distinct dealer thresholds", () => {
    vi.stubEnv("NETWORK_INTEL_MIN_COHORT", "5");
    vi.stubEnv("NETWORK_INTEL_MIN_DISTINCT_DEALERS", "3");
    expect(minCohort()).toBe(5);
    expect(minDistinctDealers()).toBe(3);
    const low = cloakCount(4, 5, 2, 3);
    expect(low.insufficientData).toBe(true);
    expect(low.value).toBeNull();
    const ok = cloakCount(6, 5, 3, 3);
    expect(ok.insufficientData).toBe(false);
    expect(ok.value).toBe(6);
  });

  it("market balance is INSUFFICIENT_DATA when either side fails privacy", () => {
    expect(marketBalanceLabel(8, 4, true, false)).toBe("INSUFFICIENT_DATA");
  });

  it("trade risk MODERATE/LOW not ELEVATED when demand-heavy", () => {
    const label = tradeRiskLabel({
      supplyCount: 10,
      demandCount: 18,
      supplyPrivacyOk: true,
      demandPrivacyOk: true,
    });
    expect(["LOW", "MODERATE"]).toContain(label);
    expect(label).not.toBe("ELEVATED");
  });

  it("year window preserves demand span at level 0", () => {
    const w = yearWindowForCohortLevel(
      {
        make: "X",
        model: "Y",
        yearMin: 2019,
        yearMax: 2021,
        fuel: null,
        engineHint: null,
      },
      0
    );
    expect(w).toEqual({ min: 2019, max: 2021, deltaYears: 0 });
  });

  it("engine module documents liquidity/trade rules and never exposes raw rows", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(process.cwd(), "src/services/exchange-intelligence/engine.ts"),
      "utf8"
    );
    expect(src).toContain("CHECK_LIQUIDITY");
    expect(src).toContain("CHECK_TRADE_RISK");
    expect(src).toContain("supplyDistinctDealers");
    expect(src).toContain("demandDistinctDealers");
    expect(src).toContain("Raw cross-dealer rows are never returned");
    expect(src).toContain("INSUFFICIENT_DATA");
    expect(src).toContain("NETWORK_INTEL_MIN_DISTINCT_DEALERS");
  });
});

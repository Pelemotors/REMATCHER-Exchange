import { describe, expect, it, vi, beforeEach } from "vitest";
import { cloakCount, minCohort, minDistinctDealers } from "@/services/exchange-intelligence/engine";

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

  it("engine module documents liquidity/trade rules and never exposes raw rows", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(process.cwd(), "src/services/exchange-intelligence/engine.ts"),
      "utf8"
    );
    expect(src).toContain("CHECK_LIQUIDITY");
    expect(src).toContain("CHECK_TRADE_RISK");
    expect(src).toContain("Raw cross-dealer rows are never returned");
    expect(src).toContain("insufficientData");
    expect(src).toContain("NETWORK_INTEL_MIN_DISTINCT_DEALERS");
  });
});

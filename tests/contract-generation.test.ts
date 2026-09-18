import { describe, expect, it } from "vitest";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  MARKET_OVERVIEW_OVERVIEW_KEYS,
  PRICE_DISTRIBUTION_KEYS,
  CATEGORICAL_DISTRIBUTION_KEYS,
  CUSTOMER_HINT_KEYS,
  INTAKE_CANDIDATE_SUBJECT_KEYS,
  buildMarketOverviewContractFixture,
  buildIntakeDemandDraftAmbiguousPhoneFixture,
  buildIntakeCandidateSubjectFixture,
} from "@/services/exchange-intelligence/contract-shapes";

const fixturesDir = join(__dirname, "fixtures/contracts");

function assertPriceDist(block: Record<string, unknown>, label: string) {
  for (const k of PRICE_DISTRIBUTION_KEYS) {
    expect(block, label).toHaveProperty(k);
  }
  expect(typeof block.insufficientData).toBe("boolean");
  expect(typeof block.priceFamily).toBe("string");
  for (const k of ["p25", "median", "p75"] as const) {
    const v = block[k];
    expect(v === null || typeof v === "number").toBe(true);
  }
}

function assertCatDist(block: Record<string, unknown>, label: string) {
  for (const k of CATEGORICAL_DISTRIBUTION_KEYS) {
    expect(block, label).toHaveProperty(k);
  }
  expect(typeof block.insufficientData).toBe("boolean");
  expect(
    block.buckets === null || typeof block.buckets === "object"
  ).toBe(true);
}

describe("Backend↔Swift contract generation", () => {
  it("writes and validates MARKET_OVERVIEW fixture from serializer shape", () => {
    mkdirSync(fixturesDir, { recursive: true });
    const fixture = buildMarketOverviewContractFixture();
    const path = join(fixturesDir, "intelligence_market_overview.json");
    writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");

    const loaded = JSON.parse(readFileSync(path, "utf8"));
    expect(loaded.ok).toBe(true);
    expect(loaded.action).toBe("MARKET_OVERVIEW");
    const ov = loaded.overview;
    for (const k of MARKET_OVERVIEW_OVERVIEW_KEYS) {
      expect(ov).toHaveProperty(k);
    }
    assertPriceDist(ov.buyerBudget, "buyerBudget");
    expect(ov.buyerBudget.priceFamily).toBe("BUYER_BUDGET");
    assertPriceDist(ov.askingB2B, "askingB2B");
    expect(ov.askingB2B.priceFamily).toBe("SUPPLY_ASKING_PRICE_B2B");
    assertPriceDist(ov.askingRetail, "askingRetail");
    assertPriceDist(ov.mileage, "mileage");
    assertCatDist(ov.fuelDistribution, "fuel");
    assertCatDist(ov.handDistribution, "hand");
    assertCatDist(ov.engineDistribution, "engine");
    assertCatDist(ov.ownershipDistribution, "ownership");
    expect(typeof ov.marketBalance).toBe("string");
    expect(typeof ov.liquidity).toBe("string");
    expect(typeof ov.tradeRisk).toBe("string");
    expect(ov.yearWidening).toMatchObject({ deltaYears: expect.any(Number) });
  });

  it("writes and validates intake demandDraft customerHint fixture", () => {
    const fixture = buildIntakeDemandDraftAmbiguousPhoneFixture();
    const path = join(fixturesDir, "intake_demand_draft_ambiguous_phone.json");
    writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");
    const hint = fixture.demandDraft.customerHint;
    for (const k of CUSTOMER_HINT_KEYS) {
      expect(hint).toHaveProperty(k);
    }
    expect(hint.requiresPhoneConfirmation).toBe(true);
    expect(hint.confirmedPhone).toBeNull();
    expect(Array.isArray(hint.phoneCandidates)).toBe(true);
  });

  it("writes and validates intake candidate subject fixture", () => {
    const fixture = buildIntakeCandidateSubjectFixture();
    const path = join(fixturesDir, "intake_candidate_subject.json");
    writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");
    for (const k of INTAKE_CANDIDATE_SUBJECT_KEYS) {
      expect(fixture).toHaveProperty(k);
    }
    expect(typeof fixture.fuel).toBe("string");
    expect(typeof fixture.engine).toBe("string");
    expect(typeof fixture.offeredPrice).toBe("number");
    expect(fixture.confidenceBand).toBe("HIGH");
    expect(typeof fixture.confidenceBand).toBe("string");
    expect("confidence" in fixture).toBe(false);
  });
});

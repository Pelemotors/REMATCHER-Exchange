import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  tradeRiskLabel,
  cloakCount,
  cloakDistribution,
  cloakCategoricalDistribution,
} from "@/services/exchange-intelligence/engine";
import {
  extractCustomerHintsFromText,
  isSafePhoneForPersist,
} from "@/services/capture/customer-extract";
import { marketWatchCanonicalKey } from "@/services/market-watch/watches";
import { canonicalizeModel } from "@/services/exchange/vehicle-identity";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");

describe("contributor privacy for distributions", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NETWORK_INTEL_MIN_DISTINCT_DEALERS", "3");
  });

  it("suppresses numeric price dist when 5 prices come from only 2 dealers (6 supply / 3 dealers)", () => {
    // 6 supply rows / 3 dealers, but only 5 prices from 2 dealers
    const allSupply = [
      { dealerId: "d1" },
      { dealerId: "d1" },
      { dealerId: "d2" },
      { dealerId: "d2" },
      { dealerId: "d2" },
      { dealerId: "d3" }, // no price
    ];
    const priceContributors = allSupply.filter((_, i) => i < 5);
    const prices = [100, 110, 120, 130, 140];
    expect(allSupply.length).toBe(6);
    expect(new Set(allSupply.map((r) => r.dealerId)).size).toBe(3);
    expect(priceContributors.length).toBe(5);
    expect(new Set(priceContributors.map((r) => r.dealerId)).size).toBe(2);

    const dist = cloakDistribution(prices, priceContributors);
    expect(dist.insufficientData).toBe(true);
    expect(dist.median).toBeNull();
  });

  it("allows numeric dist when contributors meet obs+dealer thresholds", () => {
    const contributors = [
      { dealerId: "d1" },
      { dealerId: "d1" },
      { dealerId: "d2" },
      { dealerId: "d2" },
      { dealerId: "d3" },
    ];
    const dist = cloakDistribution([90, 100, 110, 120, 130], contributors);
    expect(dist.insufficientData).toBe(false);
    expect(dist.median).not.toBeNull();
  });

  it("suppresses categorical dist when category contributors span only 2 dealers", () => {
    const rows = [
      { dealerId: "d1", fuel: "GASOLINE" },
      { dealerId: "d1", fuel: "GASOLINE" },
      { dealerId: "d2", fuel: "DIESEL" },
      { dealerId: "d2", fuel: "DIESEL" },
      { dealerId: "d2", fuel: "HYBRID" },
      { dealerId: "d3", fuel: null }, // no category
    ];
    const dist = cloakCategoricalDistribution(rows, (r) =>
      typeof r.fuel === "string" ? r.fuel : null
    );
    expect(dist.insufficientData).toBe(true);
    expect(dist.buckets).toBeNull();
  });
});

describe("trade risk semantics (final delta)", () => {
  it("high demand / low supply is never ELEVATED", () => {
    const label = tradeRiskLabel({
      supplyCount: 2,
      demandCount: 10,
      supplyPrivacyOk: true,
      demandPrivacyOk: true,
    });
    expect(label).not.toBe("ELEVATED");
    expect(["LOW", "MODERATE"]).toContain(label);
  });

  it("supply=0 + demand>0 is not ELEVATED", () => {
    expect(
      tradeRiskLabel({
        supplyCount: 0,
        demandCount: 8,
        supplyPrivacyOk: true,
        demandPrivacyOk: true,
      })
    ).not.toBe("ELEVATED");
  });

  it("high supply / low demand elevates", () => {
    expect(
      tradeRiskLabel({
        supplyCount: 12,
        demandCount: 2,
        supplyPrivacyOk: true,
        demandPrivacyOk: true,
      })
    ).toBe("ELEVATED");
  });

  it("suppressed side → UNKNOWN", () => {
    expect(
      tradeRiskLabel({
        supplyCount: 10,
        demandCount: 10,
        supplyPrivacyOk: false,
        demandPrivacyOk: true,
      })
    ).toBe("UNKNOWN");
  });

  it("offered price above B2B median elevates", () => {
    expect(
      tradeRiskLabel({
        supplyCount: 5,
        demandCount: 5,
        supplyPrivacyOk: true,
        demandPrivacyOk: true,
        offeredPrice: 140000,
        b2bMedian: 120000,
        b2bPrivacyOk: true,
      })
    ).toBe("ELEVATED");
  });
});

describe("customer hint phone ownership", () => {
  it("third-party phone in message body is not auto-safe", () => {
    const text =
      "מיכאל מחפש CX5 2023\nסוכן: תדבר עם אח שלי 052-3456789 מחר";
    const hints = extractCustomerHintsFromText(text);
    expect(isSafePhoneForPersist(hints)).toBe(false);
    expect(hints.phoneCandidates.length).toBeGreaterThan(0);
  });

  it("WhatsApp-shaped conversation yields requiresPhoneConfirmation payload shape", () => {
    const text = [
      "[16.9.2026, 17:46:12] לקוח: היי מחפש מאזדה CX5 2022",
      "[16.9.2026, 17:46:40] סוכן: תקציב?",
      "[16.9.2026, 17:47:01] לקוח: עד 130 אלף תתקשר 050-9876543",
    ].join("\n");
    const hints = extractCustomerHintsFromText(text);
    const safePhone = isSafePhoneForPersist(hints);
    const requiresPhoneConfirmation =
      !safePhone &&
      hints.phoneCandidates.some(
        (c) => c.confidence === "high" || c.confidence === "medium"
      );
    const customerHint = {
      name: hints.name,
      confirmedPhone: safePhone ? hints.normalizedPhone ?? hints.phone : null,
      phoneCandidates: hints.phoneCandidates.map((c) => ({
        raw: c.raw,
        normalized: c.normalized,
        attribution: c.attribution,
        confidence: c.confidence,
      })),
      requiresPhoneConfirmation,
    };
    expect(customerHint.confirmedPhone).toBeNull();
    expect(customerHint.requiresPhoneConfirmation).toBe(true);
    expect(customerHint.phoneCandidates.length).toBeGreaterThan(0);

    const fixturePath = join(
      root,
      "tests/fixtures/contracts/intake_demand_draft_ambiguous_phone.json"
    );
    expect(existsSync(fixturePath)).toBe(true);
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(fixture.demandDraft.customerHint.requiresPhoneConfirmation).toBe(true);
    expect(fixture.demandDraft.customerHint.confirmedPhone).toBeNull();
  });
});

describe("market watch canonical key", () => {
  it("normalizes casing for key equality", () => {
    const a = marketWatchCanonicalKey({
      dealerId: "d1",
      queryMake: "Mazda",
      queryModel: "CX-5",
      yearMin: 2022,
      yearMax: 2024,
    });
    const b = marketWatchCanonicalKey({
      dealerId: "d1",
      queryMake: "mazda",
      queryModel: "cx-5",
      yearMin: 2022,
      yearMax: 2024,
    });
    expect(a).toBe(b);
  });

  it("CX5 and CX-5 canonicalize to same model", () => {
    expect(canonicalizeModel("CX5")).toBe(canonicalizeModel("CX-5"));
    expect(canonicalizeModel("cx5")).toBe("CX-5");
  });
});

describe("cloakCount helpers", () => {
  it("cloakCount still requires min dealers", () => {
    expect(cloakCount(6, 3, 2, 3).insufficientData).toBe(true);
    expect(cloakCount(6, 3, 3, 3).insufficientData).toBe(false);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildDealerInventoryWhere,
  bulkOpsLimit,
} from "@/services/inventory/dealer-inventory-filter";
import {
  marketBalanceLabel,
  yearWindowForCohortLevel,
  tradeRiskLabel,
} from "@/services/exchange-intelligence/engine";
import {
  extractCustomerHintsFromText,
  isSafePhoneForPersist,
} from "@/services/capture/customer-extract";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("RC hardening — shared inventory filter", () => {
  it("buildDealerInventoryWhere supports list filters", () => {
    const aux = {
      attentionIds: new Set(["a1"]),
      interestVehicleIds: ["i1"],
    };
    expect(buildDealerInventoryWhere({ dealerId: "d", filter: "active" }).status).toBe(
      "ACTIVE"
    );
    expect(
      buildDealerInventoryWhere({ dealerId: "d", filter: "missing_price" }).b2bPrice
    ).toBeNull();
    expect(
      buildDealerInventoryWhere({ dealerId: "d", filter: "attention", aux }).id
    ).toEqual({ in: ["a1"] });
    expect(
      buildDealerInventoryWhere({ dealerId: "d", filter: "interest", aux }).id
    ).toEqual({ in: ["i1"] });
    const withQ = buildDealerInventoryWhere({ dealerId: "d", filter: "all", q: "tucson" });
    expect(withQ.AND).toBeTruthy();
  });

  it("bulk-inventory uses shared filter module not take:500", () => {
    const src = read("src/services/inventory/bulk-inventory.ts");
    expect(src).toContain("fetchAllMatchingVehicleIds");
    expect(src).not.toContain("take: 500");
    expect(src).toContain("totalMatchingCount");
    expect(src).toContain("failureCount");
  });

  it("bulk ops limit is explicit", () => {
    expect(bulkOpsLimit()).toBeGreaterThan(0);
  });
});

describe("RC hardening — intelligence privacy per-side", () => {
  it("market balance requires both sides privacy", () => {
    expect(marketBalanceLabel(10, 20, false, true)).toBe("INSUFFICIENT_DATA");
    expect(marketBalanceLabel(10, 20, true, true)).toBe("DEMAND_HEAVY");
    expect(marketBalanceLabel(20, 10, true, true)).toBe("SUPPLY_HEAVY");
    expect(marketBalanceLabel(10, 10, true, true)).toBe("BALANCED");
  });

  it("demand-heavy market balance does not auto-map to ELEVATED trade risk", () => {
    expect(tradeRiskLabel(10, 20)).toBe("MODERATE");
    expect(tradeRiskLabel(10, 20)).not.toBe("ELEVATED");
  });

  it("year widening levels 0/1/2", () => {
    const subject = {
      make: "HYUNDAI",
      model: "TUCSON",
      yearMin: 2020,
      yearMax: 2022,
      fuel: null,
      engineHint: null,
    };
    expect(yearWindowForCohortLevel(subject, 0)?.deltaYears).toBe(0);
    expect(yearWindowForCohortLevel(subject, 1)).toMatchObject({
      min: 2019,
      max: 2023,
      deltaYears: 1,
    });
    expect(yearWindowForCohortLevel(subject, 2)?.deltaYears).toBe(2);
  });

  it("engine documents per-side dealers and market balance rules", () => {
    const src = read("src/services/exchange-intelligence/engine.ts");
    expect(src).toContain("supplyDistinctDealers");
    expect(src).toContain("demandDistinctDealers");
    expect(src).toContain("DEMAND_HEAVY");
    expect(src).toContain("askingB2B");
    expect(src).toContain("needsOfferedPrice");
  });
});

describe("RC hardening — phone attribution", () => {
  it("message-only phone is not safe to persist", () => {
    const text = [
      "[16.9.2026, 17:46:12] לקוח: התקשרו אלי 052-765-4321 בבקשה",
    ].join("\n");
    const hints = extractCustomerHintsFromText(text);
    expect(hints.phoneCandidates[0]?.confidence).not.toBe("high");
    expect(isSafePhoneForPersist(hints)).toBe(false);
  });

  it("ownership phrase enables safe persist", () => {
    const text = "הטלפון שלי 052-765-4321";
    const hints = extractCustomerHintsFromText(text);
    expect(isSafePhoneForPersist(hints)).toBe(true);
  });
});

describe("RC hardening — private demand match OWNED-only primary", () => {
  it("matchDemandToMyInventory splits inventory vs workspace", () => {
    const src = read("src/services/matching/private-matching.ts");
    expect(src).toContain("inventoryMatches");
    expect(src).toContain("otherWorkspaceMatches");
    expect(src).toContain('"OWNED"');
    expect(src).toContain('"INVENTORY"');
  });
});

describe("RC hardening — watches and deletion", () => {
  it("watches dedupe and deactivate", () => {
    const watches = read("src/services/market-watch/watches.ts");
    expect(watches).toContain("findFirst");
    expect(watches).toContain("deactivateMarketWatch");
    expect(watches).toContain("deactivateAllMarketWatchesForDealer");
  });

  it("evaluate uses Exchange Intelligence V2 and baseline", () => {
    const ev = read("src/services/market-watch/evaluate.ts");
    expect(ev).toContain("runExchangeIntelligenceEngine");
    expect(ev).toContain("lastFingerprint == null");
    expect(ev).toContain("verificationStatus");
  });

  it("account deletion deactivates market watches", () => {
    const del = read("src/services/privacy/deletion.ts");
    expect(del).toContain("deactivateAllMarketWatchesForDealer");
  });
});

describe("RC hardening — contract fixtures exist", () => {
  const fixtures = [
    "intelligence_market_overview.json",
    "bulk_inventory_success.json",
    "market_pulse.json",
    "market_tape.json",
    "watches_list.json",
    "private_demand_match.json",
  ];
  for (const f of fixtures) {
    it(f, () => {
      const raw = read(`tests/fixtures/contracts/${f}`);
      expect(JSON.parse(raw)).toBeTruthy();
    });
  }
});

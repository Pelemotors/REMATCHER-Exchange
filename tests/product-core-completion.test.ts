import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decisionMissingReasons,
  sortActionCenterItems,
  type ActionCenterItem,
} from "@/services/actions/action-center";
import { checkCatalogPublishEligibility } from "@/services/catalog/eligibility";
import { shouldAutoPublishVehicle } from "@/services/catalog/reconcile";
import { counterpartMarketWhere } from "@/services/dealer/market-scope";
import { isMaterialRejectedMatchChange } from "@/services/domain/matching-flow";
import { toDealerFacingMatchState } from "@/services/matching/dealer-facing-state";
import { computeMarketability } from "@/services/market/marketability";
import { OWNED_INVENTORY_RELATIONSHIPS } from "@/services/vehicles/vehicle-capabilities";

describe("dealer-facing match state", () => {
  it("maps lifecycle without exposing backend names", () => {
    expect(toDealerFacingMatchState({ lifecycle: "QUALIFIED" })).toBe("MATCH_FOUND");
    expect(toDealerFacingMatchState({ lifecycle: "WAITING_SELLER" })).toBe(
      "WAITING_OTHER_SIDE"
    );
    expect(toDealerFacingMatchState({ lifecycle: "REVEALED" })).toBe("CONTACT_READY");
    expect(toDealerFacingMatchState({ lifecycle: "MUTUAL" })).toBe("CONTACT_READY");
    expect(
      toDealerFacingMatchState({
        lifecycle: "QUALIFIED",
        buyerInterestStatus: "REJECTED",
      })
    ).toBe("NOT_RELEVANT");
    expect(toDealerFacingMatchState({ lifecycle: "CLOSED" })).toBe("CLOSED");
  });
});

describe("catalog policy + eligibility", () => {
  it("FORCE_EXCLUDE blocks even owned active vehicles", () => {
    const result = checkCatalogPublishEligibility(
      {
        status: "ACTIVE",
        dealerRelationship: "OWNED",
        dealerId: "d1",
        catalogOverride: "FORCE_EXCLUDE",
      },
      "d1"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("force_exclude");
  });

  it("FORCE_INCLUDE cannot publish review or EXTERNAL", () => {
    for (const rel of ["OFFERED_TO_ME", "TRADE_IN_CANDIDATE", "EXTERNAL"] as const) {
      const result = checkCatalogPublishEligibility(
        {
          status: "ACTIVE",
          dealerRelationship: rel,
          dealerId: "d1",
          catalogOverride: "FORCE_INCLUDE",
        },
        "d1"
      );
      expect(result.ok).toBe(false);
    }
  });

  it("MANUAL publishes only FORCE_INCLUDE; auto policy publishes eligible defaults", () => {
    expect(
      shouldAutoPublishVehicle({
        publicationPolicy: "MANUAL",
        catalogOverride: "DEFAULT_FROM_POLICY",
        eligible: true,
      })
    ).toBe(false);
    expect(
      shouldAutoPublishVehicle({
        publicationPolicy: "MANUAL",
        catalogOverride: "FORCE_INCLUDE",
        eligible: true,
      })
    ).toBe(true);
    expect(
      shouldAutoPublishVehicle({
        publicationPolicy: "ALL_ELIGIBLE_ACTIVE_INVENTORY",
        catalogOverride: "DEFAULT_FROM_POLICY",
        eligible: true,
      })
    ).toBe(true);
    expect(
      shouldAutoPublishVehicle({
        publicationPolicy: "ALL_ELIGIBLE_ACTIVE_INVENTORY",
        catalogOverride: "FORCE_EXCLUDE",
        eligible: true,
      })
    ).toBe(false);
    expect(
      shouldAutoPublishVehicle({
        publicationPolicy: "MANUAL",
        catalogOverride: "FORCE_INCLUDE",
        eligible: false,
      })
    ).toBe(false);
  });

  it("existing catalogs default MANUAL and migration is additive", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain(
      "publicationPolicy    CatalogPublicationPolicy @default(MANUAL)"
    );
    expect(schema).toContain(
      "catalogOverride    CatalogVehicleOverride @default(DEFAULT_FROM_POLICY)"
    );
    const sql = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260919220000_catalog_publication_policy/migration.sql"
      ),
      "utf8"
    );
    expect(sql).not.toMatch(/DROP |TRUNCATE |DELETE /i);
    expect(sql).toContain("DEFAULT 'MANUAL'");
  });
});

describe("action center priority + missing info", () => {
  it("sorts blocked-on-me before new opportunities", () => {
    const items = sortActionCenterItems([
      {
        id: "b",
        type: "BUYER_MATCH",
        title: "match",
        priority: 2,
        entityType: "CandidateMatch",
        entityId: "1",
        href: "/matches/1",
        createdAt: "2026-09-19T12:00:00.000Z",
        urgent: false,
      },
      {
        id: "a",
        type: "SELLER_OPPORTUNITY",
        title: "opp",
        priority: 1,
        entityType: "SellerOpportunity",
        entityId: "2",
        href: "/opportunities?focus=2",
        createdAt: "2026-09-19T11:00:00.000Z",
        urgent: true,
      },
    ] satisfies ActionCenterItem[]);
    expect(items[0].type).toBe("SELLER_OPPORTUNITY");
    expect(items[1].type).toBe("BUYER_MATCH");
  });

  it("surfaces only missing Decision facts", () => {
    expect(
      decisionMissingReasons({
        type: "TRADE",
        outgoingVehicleId: null,
        incomingAgreedPrice: null,
      })
    ).toEqual(["outgoing", "allowance"]);
    expect(
      decisionMissingReasons({
        type: "PURCHASE",
        incomingAskPrice: 90000,
      })
    ).toEqual([]);
    expect(decisionMissingReasons({ type: "PURCHASE", incomingAskPrice: null })).toEqual([
      "ask",
    ]);
  });
});

describe("marketability synthetic scenarios", () => {
  it("1 high demand / lower supply → HIGH", () => {
    const r = computeMarketability({
      supplyCount: 4,
      demandCount: 8,
      supplyCoverageOk: true,
      demandCoverageOk: true,
    });
    expect(r.band).toBe("HIGH");
    expect(r.coverage).toBe("SUFFICIENT");
  });

  it("2 high supply / low demand → LOW", () => {
    const r = computeMarketability({
      supplyCount: 9,
      demandCount: 3,
      supplyCoverageOk: true,
      demandCoverageOk: true,
    });
    expect(r.band).toBe("LOW");
  });

  it("3 balanced market → MEDIUM", () => {
    const r = computeMarketability({
      supplyCount: 6,
      demandCount: 6,
      supplyCoverageOk: true,
      demandCoverageOk: true,
    });
    expect(r.band).toBe("MEDIUM");
  });

  it("4 insufficient sample → UNKNOWN", () => {
    const r = computeMarketability({
      supplyCount: 0,
      demandCount: 1,
      supplyCoverageOk: false,
      demandCoverageOk: true,
    });
    expect(r.band).toBe("UNKNOWN");
    expect(r.coverage).not.toBe("SUFFICIENT");
  });
});

describe("suppression + isolation + inventory semantics", () => {
  it("rejected rematch stays hidden without material change", () => {
    expect(
      isMaterialRejectedMatchChange({
        priorBand: "STRONG",
        priorEngine: "v2",
        nextBand: "STRONG",
        nextEngine: "v2",
      })
    ).toBe(false);
    expect(
      isMaterialRejectedMatchChange({
        priorBand: "STRONG",
        priorEngine: "v2",
        nextBand: "MODERATE",
        nextEngine: "v2",
      })
    ).toBe(true);
  });

  it("REAL counterpart filter excludes SYNTHETIC", () => {
    expect(
      counterpartMarketWhere({
        marketMode: "REAL",
        canAccessSyntheticMarket: false,
      })
    ).toEqual({ marketMode: { not: "SYNTHETIC" } });
    expect(
      counterpartMarketWhere({
        marketMode: "SYNTHETIC",
        canAccessSyntheticMarket: false,
      })
    ).toEqual({ marketMode: "SYNTHETIC" });
  });

  it("home inventory counts only owned/inventory relationships", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/dealer/work-center.ts"),
      "utf8"
    );
    expect(src).toContain("OWNED_INVENTORY_RELATIONSHIPS");
    expect(OWNED_INVENTORY_RELATIONSHIPS).toEqual(["OWNED", "INVENTORY"]);
  });

  it("confirm awaits rematch and cancel deactivates side effects", () => {
    const confirm = readFileSync(
      join(process.cwd(), "src/app/api/v1/demands/confirm/route.ts"),
      "utf8"
    );
    expect(confirm).toContain("await runMatchingForDemand");
    expect(confirm).not.toContain("void runMatchingForDemand");
    const mutations = readFileSync(
      join(process.cwd(), "src/services/demand/demand-mutations.ts"),
      "utf8"
    );
    expect(mutations).toContain("cancelDemandForDealer");
    expect(mutations).toContain("deactivateDemandSideEffects");
  });
});

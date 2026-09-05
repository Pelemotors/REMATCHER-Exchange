/**
 * Final Pilot Closeout — Buyer Visibility Gate + Exchange-initiated enrichment.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  evaluateMatchV2,
  type MatchVehicleInput,
} from "@/services/matching/engine-v2";
import { emptyStructuredIntent } from "@/services/matching/search-intent-types";
import { toBuyerMatchView } from "@/lib/privacy-views";
import {
  buildPublicMatchSummary,
  sanitizeMatchSummaryForClient,
} from "@/services/commercial/reveal-flow";
import { COPY } from "@/config/brand";
import { fieldLabelHe, hashRequestedFields } from "@/services/matching/information-request";

function vehicle(partial: Partial<MatchVehicleInput> = {}): MatchVehicleInput {
  return {
    id: "v1",
    dealerId: "seller",
    status: "ACTIVE",
    make: "Skoda",
    model: "Superb",
    trim: null,
    year: 2023,
    mileage: 40000,
    color: null,
    ownershipHand: null,
    ownershipType: null,
    region: null,
    retailPrice: null,
    b2bPrice: null,
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
    ...partial,
  } as MatchVehicleInput;
}

function intentSuperb() {
  return {
    ...emptyStructuredIntent(),
    make: { importance: "VERY_HIGH" as const, target: "Skoda" },
    model: { importance: "VERY_HIGH" as const, target: "Superb" },
    year: {
      importance: "HARD" as const,
      target: 2022,
      flexibility: { hardMin: 2022, comfortableMin: 2022 },
    },
    mileage: {
      importance: "HIGH" as const,
      target: 100000,
      flexibility: {
        target: 80000,
        comfortableMax: 100000,
        stretchMax: 100000,
        hardMax: 100000,
      },
    },
    price: {
      importance: "HIGH" as const,
      target: 200000,
      flexibility: {
        target: 180000,
        comfortableMax: 200000,
        stretchMax: 210000,
        hardMax: 220000,
      },
    },
    drivetrain: { importance: "HARD" as const, target: "4x4" },
    color: { importance: "OPEN" as const },
    hand: { importance: "OPEN" as const },
  };
}

describe("Buyer Visibility Gate — server source", () => {
  it("CASE 1: missing price → engine NEEDS_INFORMATION, not buyer-visible query", () => {
    const r = evaluateMatchV2({
      vehicle: vehicle({
        mileage: 40000,
        fieldProvenance: { drivetrain: "4x4" },
        b2bPrice: null,
      }),
      intent: intentSuperb(),
    });
    expect(r.resolutionState).toBe("NEEDS_INFORMATION");
    expect(r.decisionBlockingUnknowns).toContain("price");

    const api = readFileSync(
      join(process.cwd(), "src/app/api/matches/route.ts"),
      "utf8"
    );
    expect(api).toContain("BUYER_VISIBLE_MATCH_WHERE");
    expect(api).not.toContain("NEEDS_INFORMATION");
    expect(api).not.toContain("PENDING_VALIDATION");

    const policy = readFileSync(
      join(process.cwd(), "src/services/domain/candidate-policy.ts"),
      "utf8"
    );
    expect(policy).toContain('status: "VALIDATED"');
    expect(policy).toContain('resolutionState: "RESOLVED"');
    expect(policy).toContain("STRONG");
    expect(policy).toContain("GOOD");
    expect(policy).toContain("ALTERNATIVE");
  });

  it("CASE 2: missing mileage + HARD fuel → exact blocking fields", () => {
    const r = evaluateMatchV2({
      vehicle: vehicle({
        mileage: null,
        b2bPrice: 150000,
        fieldProvenance: null,
      }),
      intent: {
        ...intentSuperb(),
        fuel: { importance: "HARD" as const, target: "בנזין" },
      },
    });
    expect(r.resolutionState).toBe("NEEDS_INFORMATION");
    expect(r.decisionBlockingUnknowns).toEqual(
      expect.arrayContaining(["mileage", "fuel"])
    );
    expect(r.decisionBlockingUnknowns).not.toContain("color");
  });

  it("CASE 3: multiple missing including price → seller field labels only", () => {
    const fields = ["mileage", "drivetrain", "price"];
    expect(fields.map(fieldLabelHe)).toEqual([
      "קילומטראז׳",
      "הנעה",
      "מחיר",
    ]);
    expect(fieldLabelHe("price")).not.toMatch(/B2B|סוחר|עסקה/i);
  });

  it("matches API disables buyer request_info", () => {
    const api = readFileSync(
      join(process.cwd(), "src/app/api/matches/route.ts"),
      "utf8"
    );
    expect(api).toContain("buyer_initiated_enrichment_disabled");
    expect(api).toContain("410");
    expect(api).not.toContain("requestCandidateInformation");
  });

  it("matching-flow auto-initiates exchange enrichment on Potential", () => {
    const flow = readFileSync(
      join(process.cwd(), "src/services/domain/matching-flow.ts"),
      "utf8"
    );
    expect(flow).toContain("ensureExchangeInitiatedEnrichment");
    expect(flow).toContain("POTENTIAL_MATCH_IDENTIFIED");
    expect(flow).not.toContain("No seller push until explicit buyer CTA");
    expect(flow).not.toContain(
      "Buyer can see potential in matches API"
    );
  });

  it("enrichment ≠ Interest (module + Interest gate)", () => {
    const svc = readFileSync(
      join(process.cwd(), "src/services/matching/information-request.ts"),
      "utf8"
    );
    expect(svc).toContain("ensureExchangeInitiatedEnrichment");
    expect(svc).toContain('initiatedBy: "exchange"');
    expect(svc).not.toContain("buyerInterest.create");
    expect(svc).toContain("buyer_initiated_enrichment_disabled");

    const flow = readFileSync(
      join(process.cwd(), "src/services/domain/matching-flow.ts"),
      "utf8"
    );
    expect(flow).toContain("BUYER_VISIBLE_MATCH_WHERE");
    expect(flow).toContain("canPresentCandidateToBuyer");
  });
});

describe("Price privacy — CASE 7", () => {
  it("buyer match DTO / reveal summary omit private price", () => {
    const view = toBuyerMatchView({
      make: "Skoda",
      model: "Superb",
      trim: null,
      year: 2023,
      mileage: 40000,
      color: null,
      region: null,
      b2bPrice: 155000,
      ownershipHand: 1,
      dealerId: "secret",
    });
    expect(JSON.stringify(view)).not.toContain("155000");
    expect(view).not.toHaveProperty("b2bPrice");

    const summary = buildPublicMatchSummary({
      make: "Skoda",
      model: "Superb",
      year: 2023,
      explanation: "ok",
    });
    expect(JSON.stringify(summary)).not.toMatch(/b2bPrice|155000/);

    const sanitized = sanitizeMatchSummaryForClient({
      make: "Skoda",
      b2bPrice: 155000,
      scoreBand: "STRONG",
    });
    expect(JSON.stringify(sanitized)).not.toContain("b2bPrice");
  });

  it("Push copy has no price / B2B jargon", () => {
    const blob = `${COPY.partialDemandTitle} ${COPY.partialDemandBody} ${COPY.opportunity} ${COPY.mutualPushBody}`;
    expect(blob).not.toMatch(/B2B|תקציב|budget|מחיר B2B/i);
  });
});

describe("Enrichment field hash stability", () => {
  it("hash ignores order/duplicates", () => {
    expect(hashRequestedFields(["price", "mileage"])).toBe(
      hashRequestedFields(["mileage", "price", "price"])
    );
  });
});

describe("Identity privacy — CASE 8 (static)", () => {
  it("buyer view never includes dealerId", () => {
    const view = toBuyerMatchView({
      make: "A",
      model: "B",
      trim: null,
      year: 2020,
      mileage: 1,
      color: null,
      region: null,
      ownershipHand: null,
      dealerId: "dealer-secret-xyz",
    });
    expect(JSON.stringify(view)).not.toContain("dealer-secret-xyz");
  });

  it("enrichment GET never returns requester identity fields", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/inventory/enrichment/route.ts"),
      "utf8"
    );
    expect(route).toContain("requesterIdentity: null");
    expect(route).toContain("updateVehicleForDealer");
    expect(route).toContain("session.user.dealerId");
  });
});

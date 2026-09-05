import { describe, expect, it } from "vitest";
import { COPY } from "@/config/brand";
import { toBuyerMatchView, toSellerOpportunityView } from "@/lib/privacy-views";
import {
  buildPublicMatchSummary,
  sanitizeMatchSummaryForClient,
} from "@/services/commercial/reveal-flow";
import { interestLane } from "@/lib/commercial-ux";

describe("Bilateral connection — Reveal privacy (DTO)", () => {
  it("buildPublicMatchSummary never includes private commercial fields", () => {
    const summary = buildPublicMatchSummary({
      make: "Mazda",
      model: "CX-5",
      year: 2022,
      explanation: "התאמה טובה",
    });
    const json = JSON.stringify(summary);
    expect(json).not.toMatch(/b2bPrice|budgetMax|sellerFloor|scoreBand|margin/i);
    expect(summary.make).toBe("Mazda");
  });

  it("sanitizeMatchSummaryForClient strips legacy b2bPrice and scoreBand", () => {
    const sanitized = sanitizeMatchSummaryForClient({
      make: "Toyota",
      model: "Corolla",
      year: 2021,
      b2bPrice: 99000,
      scoreBand: "STRONG",
      sellerFloor: 85000,
      budgetMax: 120000,
      explanation: "ok",
    });
    const json = JSON.stringify(sanitized);
    expect(json).not.toContain("99000");
    expect(json).not.toContain("b2bPrice");
    expect(json).not.toContain("scoreBand");
    expect(json).not.toContain("sellerFloor");
    expect(json).not.toContain("budgetMax");
    expect(sanitized?.make).toBe("Toyota");
    expect(sanitized?.explanation).toBe("ok");
  });
});

describe("Bilateral connection — Buyer/Seller privacy views", () => {
  it("Buyer Match view does not expose seller b2bPrice", () => {
    const view = toBuyerMatchView({
      make: "Mazda",
      model: "CX-5",
      trim: null,
      year: 2022,
      mileage: 40000,
      color: null,
      region: null,
      b2bPrice: 134000,
      ownershipHand: 1,
      dealerId: "seller-secret",
    });
    const json = JSON.stringify(view);
    expect(json).not.toContain("134000");
    expect(json).not.toContain("b2bPrice");
    expect(json).not.toContain("seller-secret");
  });

  it("Seller Opportunity view does not expose buyer budgetMax", () => {
    const view = toSellerOpportunityView(
      {
        confirmedJson: {
          make: "Mazda",
          model: "CX-5",
          yearMin: 2020,
          budgetMax: 150000,
          trimPreference: "high_trim",
        },
      },
      { score: 0.9 }
    );
    const json = JSON.stringify(view);
    expect(json).not.toContain("150000");
    expect(json).not.toContain("budgetMax");
    expect(view.budgetRelationship).toBe("relationship_only");
    expect(view.buyerIdentity).toBeNull();
  });
});

describe("Bilateral connection — Push copy (Partial / Qualified / Mutual)", () => {
  it("Partial Seller Push uses potential language without B2B jargon", () => {
    expect(COPY.partialDemandTitle).toBe(
      "יש ביקוש שעשוי להיות רלוונטי לרכב שלך"
    );
    expect(COPY.partialDemandBody).toBe("לחץ כאן לעדכן פרטים חסרים");
    expect(COPY.partialDemandTitle).toContain("שעשוי להיות");
    expect(COPY.partialDemandTitle).not.toBe(COPY.opportunity);
    expect(`${COPY.partialDemandTitle} ${COPY.partialDemandBody}`).not.toMatch(
      /B2B|budget|score/i
    );
  });

  it("Qualified Seller Push uses confirmed relevant language", () => {
    expect(COPY.opportunity).toBe("יש ביקוש רלוונטי לרכב שלך");
    expect(COPY.opportunityPushBody).toBe("לחץ כדי לקדם את העסקה");
  });

  it("Mutual Push has no identity and no commercial values", () => {
    expect(COPY.mutualInterest).toBe("יש התאמה הדדית");
    expect(COPY.mutualPushBody).toBe(
      "שניכם רוצים להתקדם — לחץ לפרטי הקשר"
    );
    const payload = `${COPY.mutualInterest} ${COPY.mutualPushBody}`;
    expect(payload).not.toMatch(/טלפון|שם|B2B|מחיר|budget/i);
  });

  it("Buyer/Seller CTAs use proceed language", () => {
    expect(COPY.interested).toBe("כן, רוצה להתקדם");
    expect(COPY.notRelevant).toBe("לא מתאים לי");
    expect(COPY.waitingOtherSide).toContain("הבעת עניין");
  });
});

describe("Bilateral connection — Interest lanes", () => {
  it("one-sided Interest is waiting, not connection", () => {
    expect(interestLane("INTERESTED")).toBe("waiting");
    expect(interestLane("INTERESTED", null)).toBe("waiting");
  });

  it("Reveal id moves lane to history (connection discoverable)", () => {
    expect(interestLane("INTERESTED", "reveal-1")).toBe("history");
  });

  it("no Interest remains actionable", () => {
    expect(interestLane(null)).toBe("action");
    expect(interestLane("NO_RESPONSE")).toBe("action");
  });
});

describe("Bilateral connection — domain invariants (static)", () => {
  it("enrichment ≠ Interest: InformationRequest module documents separation", async () => {
    const src = await import("@/services/matching/information-request");
    expect(typeof src.fulfillRequestsAfterVehicleUpdate).toBe("function");
    expect(typeof src.reevaluateDemandsForVehicle).toBe("function");
  });

  it("Reveal creation helper is canonical and idempotent-shaped", async () => {
    const mod = await import("@/services/commercial/reveal-flow");
    expect(typeof mod.createRevealFromMutualInterest).toBe("function");
    expect(typeof mod.getRevealForDealer).toBe("function");
  });
});

/**
 * Mass 2.5 — Partial Match + Interest-Driven Enrichment suite.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import {
  evaluateMatchV2,
  type MatchVehicleInput,
} from "@/services/matching/engine-v2";
import { emptyStructuredIntent } from "@/services/matching/search-intent-types";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    candidateMatch: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    informationRequest: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: {
      findFirst: vi.fn(),
    },
    vehicle: { findFirst: vi.fn() },
    demand: { findFirst: vi.fn() },
  },
}));

vi.mock("@/services/exchange/events", () => ({
  emitExchangeEvent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/services/notifications", () => ({
  notifyDealerUsers: vi.fn().mockResolvedValue(undefined),
}));

function vehicle(partial: Partial<MatchVehicleInput> = {}): MatchVehicleInput {
  return {
    id: "v1",
    dealerId: "seller",
    status: "ACTIVE",
    make: "Hyundai",
    model: "Tucson",
    trim: null,
    year: 2022,
    mileage: 74000,
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

const tucsonIntent = {
  ...emptyStructuredIntent(),
  make: { importance: "VERY_HIGH" as const, target: "Hyundai" },
  model: { importance: "VERY_HIGH" as const, target: "Tucson" },
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
    target: 100000,
    flexibility: {
      target: 100000,
      comfortableMax: 103000,
      stretchMax: 106000,
      hardMax: 108000,
    },
  },
  color: { importance: "OPEN" as const },
  hand: { importance: "OPEN" as const },
};

describe("Mass 2.5 Partial Match", () => {
  it("1. known fits + price unknown → NEEDS_INFORMATION(price)", () => {
    const ev = evaluateMatchV2({
      vehicle: vehicle({ b2bPrice: null, color: null, ownershipHand: null }),
      intent: tucsonIntent,
    });
    expect(ev.resolutionState).toBe("NEEDS_INFORMATION");
    expect(ev.band).toBeNull();
    expect(ev.decisionBlockingUnknowns).toEqual(["price"]);
    expect(ev.decisionBlockingUnknowns).not.toContain("color");
    expect(ev.decisionBlockingUnknowns).not.toContain("hand");
  });

  it("2. color unknown but OPEN → not blocking", () => {
    const ev = evaluateMatchV2({
      vehicle: vehicle({ b2bPrice: 100000, color: null }),
      intent: tucsonIntent,
    });
    expect(ev.resolutionState).toBe("RESOLVED");
    expect(ev.decisionBlockingUnknowns).not.toContain("color");
    expect(["STRONG", "GOOD", "ALTERNATIVE"]).toContain(ev.band);
  });

  it("3. HARD fuel unknown → NEEDS_INFORMATION(fuel)", () => {
    const ev = evaluateMatchV2({
      vehicle: vehicle({ b2bPrice: 100000, fuel: null }),
      intent: {
        ...tucsonIntent,
        fuel: { importance: "HARD", target: "דיזל" },
      },
    });
    expect(ev.resolutionState).toBe("NEEDS_INFORMATION");
    expect(ev.decisionBlockingUnknowns).toContain("fuel");
  });

  it("4. known HARD year failure + fuel unknown → NO_MATCH, no info request", () => {
    const ev = evaluateMatchV2({
      vehicle: vehicle({ year: 2021, b2bPrice: 100000, fuel: null }),
      intent: {
        ...tucsonIntent,
        fuel: { importance: "HARD", target: "דיזל" },
      },
    });
    expect(ev.band).toBe("NO_MATCH");
    expect(ev.resolutionState).toBe("RESOLVED");
    expect(ev.decisionBlockingUnknowns).toHaveLength(0);
  });

  it("5. wrong model + unknowns → NO_MATCH / not Potential", () => {
    const ev = evaluateMatchV2({
      vehicle: vehicle({
        make: "Toyota",
        model: "Corolla",
        b2bPrice: null,
        color: null,
      }),
      intent: tucsonIntent,
    });
    expect(ev.band).toBe("NO_MATCH");
    expect(ev.resolutionState).toBe("RESOLVED");
  });

  it("fieldsHash is stable for idempotency", () => {
    const hash = (fields: string[]) =>
      createHash("sha256")
        .update(
          [...new Set(fields.map((f) => f.trim().toLowerCase()))]
            .filter(Boolean)
            .sort()
            .join("|")
        )
        .digest("hex")
        .slice(0, 32);
    expect(hash(["price", "fuel"])).toBe(hash(["fuel", "price", "price"]));
  });

  it("6–8. Exchange-initiated enrichment — buyer request_info disabled", () => {
    const api = readFileSync(
      join(process.cwd(), "src/app/api/matches/route.ts"),
      "utf8"
    );
    expect(api).toContain("buyer_initiated_enrichment_disabled");
    expect(api).not.toContain("requestCandidateInformation");
    const svc = readFileSync(
      join(process.cwd(), "src/services/matching/information-request.ts"),
      "utf8"
    );
    expect(svc).toContain("MORE_INFO_REQUESTED");
    expect(svc).toContain("ensureExchangeInitiatedEnrichment");
    expect(svc).not.toContain("buyerInterest.create");
    expect(svc).toContain("ENRICHMENT_NOTIFY_COOLDOWN");
  });

  it("7. Potential → Exchange auto enrichment (no buyer CTA)", () => {
    const flow = readFileSync(
      join(process.cwd(), "src/services/domain/matching-flow.ts"),
      "utf8"
    );
    expect(flow).toContain("POTENTIAL_MATCH_IDENTIFIED");
    expect(flow).toContain("ensureExchangeInitiatedEnrichment");
    expect(flow).not.toContain("No seller push until explicit buyer CTA");
  });

  it("9–12. enrichment + re-eval hooks exist", () => {
    const upd = readFileSync(
      join(process.cwd(), "src/services/inventory/update-vehicle.ts"),
      "utf8"
    );
    expect(upd).toContain("fulfillRequestsAfterVehicleUpdate");
    const svc = readFileSync(
      join(process.cwd(), "src/services/matching/information-request.ts"),
      "utf8"
    );
    expect(svc).toContain("INVENTORY_ENRICHED");
    expect(svc).toContain("runMatchingForDemand");
    expect(svc).toContain("BUYER_MATCH");
    expect(svc).toContain("reevaluateDemandsForVehicle");
    // Must rematch even when no OPEN InformationRequest remains
    expect(svc).not.toMatch(
      /if \(open\.length === 0\) return \{ fulfilled: 0, reevaluated/
    );
    const flow = readFileSync(
      join(process.cwd(), "src/services/domain/matching-flow.ts"),
      "utf8"
    );
    expect(flow).toContain("MATCH_INVALIDATED");
    expect(flow).toContain("no_match_after_reeval");
  });

  it("13–14. demand/vehicle terminal states cancel requests", () => {
    const sold = readFileSync(
      join(process.cwd(), "src/services/inventory/sold-lifecycle.ts"),
      "utf8"
    );
    expect(sold).toContain("cancelOpenRequestsForVehicle");
    const mark = readFileSync(
      join(process.cwd(), "src/services/inventory/mark-sold.ts"),
      "utf8"
    );
    expect(mark).toContain("applyVehicleSoldLifecycle");
    const close = readFileSync(
      join(process.cwd(), "src/services/assistant/tools/action-tools.ts"),
      "utf8"
    );
    expect(close).toContain("cancelOpenRequestsForDemand");
  });

  it("15. privacy: buyer view and seller notify omit counterpart identity", () => {
    const svc = readFileSync(
      join(process.cwd(), "src/services/matching/information-request.ts"),
      "utf8"
    );
    expect(svc).toContain("COPY.partialDemandTitle");
    expect(svc).toContain("requesterIdentity: null");
    expect(svc).not.toMatch(/businessName|contactName|phone/);
    // Push must not name counterpart identity
    expect(svc).not.toMatch(/סוחר אחר מחפש|סוחרים אחרים מחפשים/);
  });

  it("16. enrichment tool scopes to own vehicle", () => {
    const tools = readFileSync(
      join(process.cwd(), "src/services/matching/search-intent-agent-tools.ts"),
      "utf8"
    );
    expect(tools).toContain("get_inventory_enrichment_context");
    expect(tools).toContain("getOpenEnrichmentForVehicle");
  });

  it("events distinguish potential from match", () => {
    const flow = readFileSync(
      join(process.cwd(), "src/services/domain/matching-flow.ts"),
      "utf8"
    );
    expect(flow).toContain("POTENTIAL_MATCH_IDENTIFIED");
    expect(flow).toContain("MATCH_CREATED");
  });
});

describe("Mass 2.5 InformationRequest domain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("8. buyer-initiated enrichment is disabled", async () => {
    const { requestCandidateInformation } = await import(
      "@/services/matching/information-request"
    );
    const out = await requestCandidateInformation({
      requesterDealerId: "buyer",
      candidateMatchId: "m1",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toBe("buyer_initiated_enrichment_disabled");
    }
  });

  it("8b. exchange-initiated enrichment upserts OPEN request", async () => {
    const { prisma } = await import("@/lib/prisma");
    const findUniqueMatch = prisma.candidateMatch.findUnique as ReturnType<
      typeof vi.fn
    >;
    const findUniqueReq = prisma.informationRequest.findUnique as ReturnType<
      typeof vi.fn
    >;
    const create = prisma.informationRequest.create as ReturnType<typeof vi.fn>;
    const findMany = prisma.informationRequest.findMany as ReturnType<typeof vi.fn>;
    const notif = prisma.notification.findFirst as ReturnType<typeof vi.fn>;
    const count = prisma.informationRequest.count as ReturnType<typeof vi.fn>;

    findUniqueMatch.mockResolvedValue({
      id: "m1",
      vehicleId: "v1",
      demandId: "d1",
      searchIntentVersionId: "si1",
      decisionBlockingUnknowns: ["price", "mileage"],
      vehicle: {
        dealerId: "seller",
        status: "ACTIVE",
        make: "Hyundai",
        model: "Tucson",
        year: 2022,
      },
      demand: { status: "ACTIVE", dealerId: "buyer" },
    });
    findUniqueReq.mockResolvedValue(null);
    create.mockResolvedValue({ id: "r1", status: "OPEN" });
    findMany.mockResolvedValue([
      { requestedFields: ["price", "mileage"], updatedAt: new Date(), createdAt: new Date() },
    ]);
    notif.mockResolvedValue(null);
    count.mockResolvedValue(1);

    const { ensureExchangeInitiatedEnrichment } = await import(
      "@/services/matching/information-request"
    );
    const out = await ensureExchangeInitiatedEnrichment({
      candidateMatchId: "m1",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.created).toBe(true);
    }
    expect(create).toHaveBeenCalled();
  });
});

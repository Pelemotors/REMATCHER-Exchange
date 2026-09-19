import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reviewAskingPriceFromCommercial } from "@/services/vehicles/review-asking-price";
import { buildDealerInventoryWhere } from "@/services/inventory/dealer-inventory-filter";

const mockDecisionFindUnique = vi.fn();
const mockDecisionCreate = vi.fn();
const mockDecisionUpdate = vi.fn();
const mockDecisionFindMany = vi.fn();
const mockVehicleFindFirst = vi.fn();
const mockVehicleFindMany = vi.fn();
const mockVehicleUpdate = vi.fn();
const mockCandidateFindFirst = vi.fn();
const mockConvert = vi.fn();
const mockEmit = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicleDecision: {
      findUnique: (...args: unknown[]) => mockDecisionFindUnique(...args),
      create: (...args: unknown[]) => mockDecisionCreate(...args),
      update: (...args: unknown[]) => mockDecisionUpdate(...args),
      findMany: (...args: unknown[]) => mockDecisionFindMany(...args),
    },
    vehicle: {
      findFirst: (...args: unknown[]) => mockVehicleFindFirst(...args),
      findMany: (...args: unknown[]) => mockVehicleFindMany(...args),
      update: (...args: unknown[]) => mockVehicleUpdate(...args),
    },
    vehicleCandidate: {
      findFirst: (...args: unknown[]) => mockCandidateFindFirst(...args),
    },
  },
}));
vi.mock("@/services/exchange/events", () => ({
  emitExchangeEvent: (...args: unknown[]) => {
    mockEmit(...args);
    return Promise.resolve(undefined);
  },
}));
vi.mock("@/services/vehicles/relationship-visibility", () => ({
  convertToOwnedInventory: (...args: unknown[]) => mockConvert(...args),
}));

import {
  acceptDecision,
  assertOutgoingVehicleEligible,
  backfillOpenVehicleDecisions,
  declineDecision,
  decisionTypeForRelationship,
  openOrGetDecision,
  persistDecisionPrice,
  retargetOpenDecision,
} from "@/services/decisions/vehicle-decision";

function decisionRow(over: Record<string, unknown> = {}) {
  return {
    id: "dec-1",
    dealerId: "d1",
    vehicleId: "v-in",
    sourceCandidateId: "c1",
    type: "PURCHASE",
    status: "OPEN",
    incomingAskPrice: 90000,
    incomingAgreedPrice: null,
    outgoingVehicleId: null,
    outgoingAgreedPrice: null,
    openedAt: new Date("2026-09-19T00:00:00.000Z"),
    updatedAt: new Date("2026-09-19T00:00:00.000Z"),
    decidedAt: null,
    outgoingVehicle: null,
    ...over,
  };
}

describe("Decision creation rules", () => {
  it("maps OFFERED to PURCHASE and TRADE_IN to TRADE", () => {
    expect(decisionTypeForRelationship("OFFERED_TO_ME")).toBe("PURCHASE");
    expect(decisionTypeForRelationship("TRADE_IN_CANDIDATE")).toBe("TRADE");
    expect(decisionTypeForRelationship("OWNED")).toBeNull();
    expect(decisionTypeForRelationship("EXTERNAL")).toBeNull();
  });

  it("OWNED / EXTERNAL / SEARCH_LIKE do not open a Decision", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/intake/apply-intent.ts"),
      "utf8"
    );
    expect(src).toContain("ensureDecisionForCommitted");
    expect(src).toContain("decisionTypeForRelationship");
    const search = readFileSync(
      join(process.cwd(), "src/services/vehicles/set-dealer-intent.ts"),
      "utf8"
    );
    expect(search).toContain("SEARCH_TARGET");
    expect(search).toContain("upsertSearchTargetFromVehicle");
    expect(search).not.toMatch(/SEARCH_TARGET[\s\S]{0,200}openOrGetDecision/);
  });

  it("openOrGetDecision is idempotent", async () => {
    mockDecisionFindUnique.mockResolvedValue(decisionRow());
    const first = await openOrGetDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      type: "PURCHASE",
    });
    const second = await openOrGetDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      type: "PURCHASE",
    });
    expect(first.created).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(mockDecisionCreate).not.toHaveBeenCalled();
  });

  it("creates PURCHASE OPEN when missing", async () => {
    mockDecisionFindUnique.mockResolvedValue(null);
    mockDecisionCreate.mockResolvedValue(
      decisionRow({ incomingAskPrice: 90000 })
    );
    const result = await openOrGetDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      type: "PURCHASE",
      sourceCandidateId: "c1",
      incomingAskPrice: 90000,
    });
    expect(result.created).toBe(true);
    expect(result.decision.type).toBe("PURCHASE");
    expect(result.decision.status).toBe("OPEN");
    expect(mockDecisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "PURCHASE",
          incomingAskPrice: 90000,
        }),
      })
    );
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "decision.opened" })
    );
  });
});

describe("Backfill", () => {
  it("creates PURCHASE/TRADE from existing review vehicles and skips duplicates", async () => {
    mockVehicleFindMany.mockResolvedValue([
      { id: "v1", dealerId: "d1", dealerRelationship: "OFFERED_TO_ME" },
      { id: "v2", dealerId: "d1", dealerRelationship: "TRADE_IN_CANDIDATE" },
    ]);
    mockCandidateFindFirst
      .mockResolvedValueOnce({
        id: "c1",
        commercialJson: { offeredPrice: 90000, b2bPrice: 1, retailPrice: 2 },
      })
      .mockResolvedValueOnce({ id: "c2", commercialJson: { askingPrice: 70000 } });
    mockDecisionFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(decisionRow({ vehicleId: "v2", type: "TRADE" }));
    mockDecisionCreate.mockResolvedValue(
      decisionRow({ incomingAskPrice: 90000 })
    );

    const result = await backfillOpenVehicleDecisions();
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(mockDecisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "PURCHASE",
          incomingAskPrice: 90000,
        }),
      })
    );
  });

  it("never seeds acquisition price from b2b/retail", () => {
    expect(
      reviewAskingPriceFromCommercial({
        b2bPrice: 120000,
        retailPrice: 150000,
      })
    ).toBeNull();
    expect(
      reviewAskingPriceFromCommercial({
        offeredPrice: 90000,
        b2bPrice: 1,
        retailPrice: 2,
      })
    ).toBe(90000);
  });
});

describe("Purchase lifecycle", () => {
  beforeEach(() => {
    mockDecisionFindUnique.mockReset();
    mockDecisionUpdate.mockReset();
    mockConvert.mockReset();
  });

  it("accept converts the same vehicle and marks ACCEPTED", async () => {
    mockDecisionFindUnique.mockResolvedValue(decisionRow());
    mockConvert.mockResolvedValue({
      ok: true,
      vehicle: { id: "v-in", dealerRelationship: "OWNED" },
    });
    mockDecisionUpdate.mockResolvedValue(
      decisionRow({
        status: "ACCEPTED",
        incomingAgreedPrice: 88000,
        decidedAt: new Date(),
      })
    );
    const result = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      incomingAgreedPrice: 88000,
    });
    expect(result.ok).toBe(true);
    expect(mockConvert).toHaveBeenCalledWith({
      dealerId: "d1",
      vehicleId: "v-in",
    });
    if (result.ok) {
      expect(result.decision.status).toBe("ACCEPTED");
      expect(result.decision.vehicleId).toBe("v-in");
    }
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "decision.accepted" })
    );
  });

  it("accept is idempotent when already ACCEPTED", async () => {
    mockDecisionFindUnique.mockResolvedValue(
      decisionRow({ status: "ACCEPTED", incomingAgreedPrice: 88000 })
    );
    const result = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      incomingAgreedPrice: 88000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.idempotent).toBe(true);
    expect(mockConvert).not.toHaveBeenCalled();
  });

  it("cannot accept after DECLINED", async () => {
    mockDecisionFindUnique.mockResolvedValue(decisionRow({ status: "DECLINED" }));
    const result = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      incomingAgreedPrice: 88000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("decision_declined");
  });

  it("decline becomes DECLINED and cannot later accept", async () => {
    mockDecisionFindUnique.mockResolvedValue(decisionRow());
    mockDecisionUpdate.mockResolvedValue(
      decisionRow({ status: "DECLINED", decidedAt: new Date() })
    );
    const declined = await declineDecision({ dealerId: "d1", vehicleId: "v-in" });
    expect(declined.ok).toBe(true);
    if (declined.ok) expect(declined.decision.status).toBe("DECLINED");
  });

  it("cannot decline after ACCEPTED", async () => {
    mockDecisionFindUnique.mockResolvedValue(
      decisionRow({ status: "ACCEPTED" })
    );
    const result = await declineDecision({ dealerId: "d1", vehicleId: "v-in" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("decision_accepted");
  });

  it("decline is idempotent", async () => {
    mockDecisionFindUnique.mockResolvedValue(
      decisionRow({ status: "DECLINED" })
    );
    const result = await declineDecision({ dealerId: "d1", vehicleId: "v-in" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.idempotent).toBe(true);
    expect(mockDecisionUpdate).not.toHaveBeenCalled();
  });
});

describe("Trade lifecycle", () => {
  beforeEach(() => {
    mockDecisionFindUnique.mockReset();
    mockVehicleFindFirst.mockReset();
    mockDecisionUpdate.mockReset();
    mockConvert.mockReset();
  });

  it("rejects illegal outgoing vehicles", async () => {
    mockVehicleFindFirst.mockResolvedValueOnce(null);
    expect(
      await assertOutgoingVehicleEligible({
        dealerId: "d1",
        incomingVehicleId: "v-in",
        outgoingVehicleId: "missing",
      })
    ).toMatchObject({ ok: false, error: "outgoing_not_found" });

    expect(
      await assertOutgoingVehicleEligible({
        dealerId: "d1",
        incomingVehicleId: "v-in",
        outgoingVehicleId: "v-in",
      })
    ).toMatchObject({ ok: false, error: "outgoing_same_as_incoming" });

    mockVehicleFindFirst.mockResolvedValue({
      id: "v-out",
      dealerRelationship: "OFFERED_TO_ME",
      status: "ACTIVE",
    });
    expect(
      await assertOutgoingVehicleEligible({
        dealerId: "d1",
        incomingVehicleId: "v-in",
        outgoingVehicleId: "v-out",
      })
    ).toMatchObject({ ok: false, error: "outgoing_not_owned" });

    mockVehicleFindFirst.mockResolvedValue({
      id: "v-out",
      dealerRelationship: "OWNED",
      status: "SOLD",
    });
    expect(
      await assertOutgoingVehicleEligible({
        dealerId: "d1",
        incomingVehicleId: "v-in",
        outgoingVehicleId: "v-out",
      })
    ).toMatchObject({ ok: false, error: "outgoing_not_active" });
  });

  it("accept requires outgoing vehicle and agreed trade price", async () => {
    mockDecisionFindUnique.mockResolvedValue(
      decisionRow({ type: "TRADE", incomingAskPrice: 50000 })
    );
    const missingOutgoing = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      incomingAgreedPrice: 45000,
    });
    expect(missingOutgoing.ok).toBe(false);
    if (!missingOutgoing.ok) {
      expect(missingOutgoing.error).toBe("outgoing_vehicle_required");
    }

    mockDecisionFindUnique.mockResolvedValue(
      decisionRow({
        type: "TRADE",
        outgoingVehicleId: "v-out",
        incomingAgreedPrice: null,
      })
    );
    mockVehicleFindFirst.mockResolvedValue({
      id: "v-out",
      dealerRelationship: "OWNED",
      status: "ACTIVE",
    });
    const missingPrice = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
    });
    expect(missingPrice.ok).toBe(false);
    if (!missingPrice.ok) {
      expect(missingPrice.error).toBe("agreed_price_required");
    }
  });

  it("accept converts incoming only and never marks outgoing SOLD", async () => {
    mockDecisionFindUnique.mockResolvedValue(
      decisionRow({
        type: "TRADE",
        outgoingVehicleId: "v-out",
        incomingAgreedPrice: 45000,
      })
    );
    mockVehicleFindFirst.mockResolvedValue({
      id: "v-out",
      dealerRelationship: "OWNED",
      status: "ACTIVE",
    });
    mockConvert.mockResolvedValue({
      ok: true,
      vehicle: { id: "v-in", dealerRelationship: "OWNED" },
    });
    mockDecisionUpdate.mockResolvedValue(
      decisionRow({
        type: "TRADE",
        status: "ACCEPTED",
        outgoingVehicleId: "v-out",
        incomingAgreedPrice: 45000,
        decidedAt: new Date(),
      })
    );
    const result = await acceptDecision({
      dealerId: "d1",
      vehicleId: "v-in",
    });
    expect(result.ok).toBe(true);
    expect(mockConvert).toHaveBeenCalledTimes(1);
    expect(mockConvert).toHaveBeenCalledWith({
      dealerId: "d1",
      vehicleId: "v-in",
    });
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "decision.accepted",
        eventData: expect.objectContaining({ outgoingAutoSold: false }),
      })
    );
  });
});

describe("Relationship and price authority", () => {
  it("blocks direct review→OWNED and silent text conversion", () => {
    const rel = readFileSync(
      join(process.cwd(), "src/services/vehicles/relationship-visibility.ts"),
      "utf8"
    );
    expect(rel).toContain("use_convert_owned");
    const intent = readFileSync(
      join(process.cwd(), "src/services/intake/apply-intent.ts"),
      "utf8"
    );
    expect(intent).toContain("use_convert_owned");
    expect(intent).toContain("retargetOpenDecision");
    const setIntent = readFileSync(
      join(process.cwd(), "src/services/vehicles/set-dealer-intent.ts"),
      "utf8"
    );
    expect(setIntent).toContain("use_accept_decision");
    expect(setIntent).not.toContain("convertToOwnedInventory");
  });

  it("retarget only works while OPEN", async () => {
    mockDecisionFindUnique.mockResolvedValue(
      decisionRow({ status: "ACCEPTED" })
    );
    const result = await retargetOpenDecision({
      dealerId: "d1",
      vehicleId: "v-in",
      type: "TRADE",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("decision_terminal");
  });

  it("persists Decision price as authority", async () => {
    mockDecisionFindUnique.mockResolvedValue(
      decisionRow({ incomingAskPrice: null })
    );
    mockDecisionUpdate.mockResolvedValue({});
    const saved = await persistDecisionPrice({
      dealerId: "d1",
      vehicleId: "v-in",
      price: 90000,
      field: "incomingAskPrice",
    });
    expect(saved).toBe(90000);
    expect(mockDecisionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { incomingAskPrice: 90000 },
      })
    );
  });

  it("review filter is OPEN decisions; all excludes declined leftovers", () => {
    const review = buildDealerInventoryWhere({
      dealerId: "d1",
      filter: "review",
    });
    expect(review.incomingDecisions).toEqual({
      some: { dealerId: "d1", status: "OPEN" },
    });
    const all = buildDealerInventoryWhere({ dealerId: "d1", filter: "all" });
    expect(all.OR).toEqual(
      expect.arrayContaining([
        { dealerRelationship: { in: ["OWNED", "INVENTORY"] } },
        {
          incomingDecisions: {
            some: { dealerId: "d1", status: "OPEN" },
          },
        },
      ])
    );
  });

  it("intelligence loads Decision price first", () => {
    const engine = readFileSync(
      join(process.cwd(), "src/services/exchange-intelligence/engine.ts"),
      "utf8"
    );
    expect(engine).toContain("loadReviewAskingPriceForVehicle");
    const price = readFileSync(
      join(process.cwd(), "src/services/vehicles/review-asking-price.ts"),
      "utf8"
    );
    expect(price).toContain("loadDecisionAuthorityPrice");
    expect(price).toContain("persistDecisionPrice");
  });
});

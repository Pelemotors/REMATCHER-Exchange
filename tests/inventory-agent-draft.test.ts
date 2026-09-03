import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  advanceDraftAfterGap,
  applyFields,
  buildStructuredSummary,
  canConfirm,
  hasInventoryIdentity,
  nextGapToAsk,
  openGaps,
  parseAmendment,
  parseGapAnswer,
  readyForConfirmation,
  type PendingInventoryDraft,
} from "@/services/assistant/inventory-draft";
import { heuristicPlan } from "@/services/assistant/planner";
import { hasVehicleIdentity } from "@/services/inventory/create-vehicle";

function baseDraft(
  overrides: Partial<PendingInventoryDraft> = {}
): PendingInventoryDraft {
  return {
    status: "DRAFT",
    sourceText: "טויוטה קורולה 2022 139000",
    fields: {
      make: "טויוטה",
      model: "קורולה",
      trim: null,
      year: 2022,
      mileage: null,
      color: null,
      ownershipHand: null,
      retailPrice: 139000,
      b2bPrice: null,
      region: null,
    },
    askedGaps: [],
    ...overrides,
  };
}

describe("inventory draft identity hard gate", () => {
  it("requires make model year", () => {
    expect(
      hasInventoryIdentity({
        make: "Toyota",
        model: null,
        trim: null,
        year: 2022,
        mileage: null,
        color: null,
        ownershipHand: null,
        retailPrice: null,
        b2bPrice: null,
        region: null,
      })
    ).toBe(false);
    expect(hasInventoryIdentity(baseDraft().fields)).toBe(true);
    expect(hasVehicleIdentity({ make: "A", model: "B", year: 2020 })).toBe(true);
  });

  it("canConfirm only when identity present", () => {
    expect(canConfirm(baseDraft())).toBe(true);
    expect(
      canConfirm(
        baseDraft({
          fields: { ...baseDraft().fields, year: null },
        })
      )
    ).toBe(false);
  });
});

describe("inventory draft gaps", () => {
  it("asks mileage before b2b and never re-asks", () => {
    const d = baseDraft();
    expect(nextGapToAsk(d)).toBe("mileage");
    const afterAsk = { ...d, askedGaps: ["mileage" as const] };
    expect(nextGapToAsk(afterAsk)).toBe("b2b_price");
    const bothAsked = { ...d, askedGaps: ["mileage" as const, "b2b_price" as const] };
    expect(nextGapToAsk(bothAsked)).toBeNull();
    expect(readyForConfirmation(bothAsked)).toBe(true);
  });

  it("skip advances askedGaps without inventing values", () => {
    const d = baseDraft();
    const next = advanceDraftAfterGap(d, "mileage", "skip");
    expect(next.askedGaps).toContain("mileage");
    expect(next.fields.mileage).toBeNull();
    expect(nextGapToAsk(next)).toBe("b2b_price");
  });

  it("parses mileage and b2b answers", () => {
    expect(parseGapAnswer("mileage", "62 אלף")).toEqual({ mileage: 62000 });
    expect(parseGapAnswer("b2b_price", "B2B 134000")).toEqual({ b2bPrice: 134000 });
    expect(parseGapAnswer("mileage", "לא יודע")).toBe("skip");
  });

  it("openGaps does not require km/b2b for identity", () => {
    const gaps = openGaps(baseDraft().fields);
    expect(gaps).toContain("mileage");
    expect(gaps).toContain("b2b_price");
  });
});

describe("structured summary and amendments", () => {
  it("builds pipe summary with unknown fields", () => {
    const s = buildStructuredSummary(baseDraft());
    expect(s).toContain("טויוטה קורולה");
    expect(s).toContain("2022");
    expect(s).toMatch(/ק"מ לא ידוע/);
    expect(s).toContain("139");
    expect(s).toContain("B2B לא ידוע");
  });

  it("amendment returns to draft fields", () => {
    const d = baseDraft({ status: "WAITING_CONFIRMATION" });
    const patch = parseAmendment("בעצם 58 אלף קמ");
    expect(patch).toEqual({ mileage: 58000 });
    const updated = applyFields(d, patch!);
    expect(updated.status).toBe("DRAFT");
    expect(updated.fields.mileage).toBe(58000);
  });
});

describe("planner create_inventory", () => {
  it("detects explicit inventory add intent", () => {
    expect(heuristicPlan("רשום לי רכב למלאי").actionIntent).toBe(
      "create_inventory"
    );
  });

  it("detects free-text vehicle listing without search words", () => {
    expect(heuristicPlan("טויוטה קורולה 2022 62 אלף 139000").actionIntent).toBe(
      "create_inventory"
    );
  });

  it("keeps search intent as create_demand", () => {
    expect(heuristicPlan("פתח לי חיפוש על קורולה").actionIntent).toBe(
      "create_demand"
    );
  });
});

describe("createVehicleForDealer shared path", () => {
  const mockCreate = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
  });

  it("executeConfirmInventoryCreate uses domain service not raw prisma in tool", async () => {
    vi.doMock("@/services/inventory/create-vehicle", () => ({
      createVehicleForDealer: mockCreate.mockResolvedValue({
        ok: true,
        vehicle: {
          id: "v1",
          make: "Toyota",
          model: "Corolla",
          year: 2022,
        },
      }),
    }));
    vi.doMock("@/services/notifications", () => ({
      logAppEvent: vi.fn(),
    }));
    vi.doMock("@/lib/prisma", () => ({
      prisma: { vehicle: { create: vi.fn() } },
    }));

    const { executeConfirmInventoryCreate } = await import(
      "@/services/assistant/tools/action-tools"
    );
    const result = await executeConfirmInventoryCreate("d1", {
      sourceText: "טויוטה קורולה 2022",
      fields: {
        make: "Toyota",
        model: "Corolla",
        trim: null,
        year: 2022,
        mileage: 62000,
        color: null,
        ownershipHand: null,
        retailPrice: 139000,
        b2bPrice: null,
        region: null,
      },
    });

    expect(result.ok).toBe(true);
    expect(mockCreate).toHaveBeenCalled();
  });
});

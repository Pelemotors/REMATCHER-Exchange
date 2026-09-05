import { describe, it, expect } from "vitest";
import {
  advanceDraftAfterGap,
  applyFields,
  buildStructuredSummary,
  canConfirm,
  hasInventoryIdentity,
  identityPartialMessage,
  isCommerciallyComplete,
  nextGapToAsk,
  openCommercialGaps,
  parseAmendment,
  parseGapAnswer,
  readyForConfirmation,
  splitMultiVehicleText,
  type PendingInventoryDraft,
} from "@/services/assistant/inventory-draft";
import {
  applyShorthandToFields,
  assertNoInventedModel,
  resolveVehicleShorthand,
} from "@/services/assistant/vehicle-shorthand";
import { normalizeVehicleFallback } from "@/services/ai/inventory-normalizer";
import {
  isSoldIntent,
  isUnavailableIntent,
  isUpdateIntent,
  parseVehicleUpdateChanges,
  matchVehiclesFromText,
  type InventoryCandidate,
} from "@/services/inventory/lookup";
import { readFileSync } from "fs";
import { join } from "path";
import { INVENTORY_PLAYBOOK_VERSION } from "@/services/assistant/inventory-commercial-playbook";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";

const root = join(__dirname, "..");

function baseDraft(
  overrides: Partial<PendingInventoryDraft> = {}
): PendingInventoryDraft {
  return {
    status: "DRAFT",
    sourceText: "טויוטה קורולה 2022 139000",
    fields: {
      make: "Toyota",
      model: "Corolla",
      trim: null,
      year: 2022,
      mileage: null,
      color: null,
      ownershipHand: null,
      ownershipType: null,
      retailPrice: 139000,
      b2bPrice: null,
      region: null,
    },
    askedGaps: [],
    skippedGaps: [],
    ...overrides,
  };
}

describe("Inventory Intelligence 2.6 — versioning", () => {
  it("bumps agent and playbook — Agent may be newer than playbook minor", () => {
    expect(["2.6", "2.7", "3.0", "3.1", "3.1.1", "4.0"]).toContain(AGENT_VERSION);
    expect(INVENTORY_PLAYBOOK_VERSION).toBe("2.6");
  });

  it("does not introduce a second agent registry", () => {
    const src = readFileSync(
      join(root, "src/services/assistant/tools/registry.ts"),
      "utf8"
    );
    expect(src).toMatch(/AGENT_VERSION = "4\.0"/);
    expect(src).not.toMatch(/INVENTORY_AGENT_VERSION|separateInventoryAgent/);
  });
});

describe("normalization / shorthand", () => {
  it("קורולה 22 → Toyota Corolla 2022", () => {
    const hit = resolveVehicleShorthand("קורולה 22");
    expect(hit).toEqual({
      make: "Toyota",
      model: "Corolla",
      confidence: "high",
    });
    const fields = applyShorthandToFields("קורולה 22", {
      make: null,
      model: null,
      year: null,
      mileage: null,
      b2bPrice: null,
    });
    expect(fields.make).toBe("Toyota");
    expect(fields.model).toBe("Corolla");
    expect(fields.year).toBe(2022);
  });

  it("CX5 23 → Mazda CX-5 2023", () => {
    const fields = applyShorthandToFields("CX5 23", {
      make: null,
      model: null,
      year: null,
      mileage: null,
      b2bPrice: null,
    });
    expect(fields.make).toBe("Mazda");
    expect(fields.model).toBe("CX-5");
    expect(fields.year).toBe(2023);
  });

  it("טויוטה 22 does NOT invent Corolla", () => {
    const fb = normalizeVehicleFallback("טויוטה 22");
    expect(fb.make?.status).toBe("known");
    expect(fb.make?.value).toBe("Toyota");
    expect(fb.model?.status === "known" ? fb.model.value : null).toBeFalsy();
    expect(assertNoInventedModel("טויוטה 22", "Corolla")).toBe(false);
  });

  it("parses 62 אלף and 134 לסוחר", () => {
    const fields = applyShorthandToFields("קורולה 22 62 אלף 134 לסוחר", {
      make: null,
      model: null,
      year: null,
      mileage: null,
      b2bPrice: null,
    });
    expect(fields.mileage).toBe(62000);
    expect(fields.b2bPrice).toBe(134000);
  });
});

describe("clarification / commercial completeness", () => {
  it("asks model when identity incomplete — natural message", () => {
    const msg = identityPartialMessage({
      ...baseDraft().fields,
      model: null,
      make: "Toyota",
      year: 2022,
      mileage: 62000,
    });
    expect(msg).toMatch(/דגם/);
    expect(msg).not.toMatch(/validation|schema|required field/i);
    expect(msg).not.toContain("שלח שוב את כל הפרטים");
  });

  it("asks mileage before color; one gap at a time", () => {
    const d = baseDraft({
      fields: {
        ...baseDraft().fields,
        retailPrice: null,
        b2bPrice: null,
        mileage: null,
      },
    });
    expect(nextGapToAsk(d)).toBe("mileage");
    expect(openCommercialGaps(d)).not.toContain("color");
  });

  it("does not re-ask skipped field", () => {
    const d = baseDraft();
    const skipped = advanceDraftAfterGap(d, "mileage", "skip");
    expect(skipped.skippedGaps).toContain("mileage");
    expect(nextGapToAsk(skipped)).not.toBe("mileage");
    expect(nextGapToAsk(skipped)).toBe("ownership");
  });

  it("ownership may be asked when commercially useful", () => {
    const d = baseDraft({
      fields: {
        ...baseDraft().fields,
        mileage: 62000,
        b2bPrice: 134000,
        retailPrice: null,
      },
    });
    expect(nextGapToAsk(d)).toBe("ownership");
  });

  it("stops optional questions once commercially useful", () => {
    const d = baseDraft({
      fields: {
        ...baseDraft().fields,
        mileage: 62000,
        b2bPrice: 134000,
        ownershipType: "private",
        color: null,
        trim: null,
      },
      askedGaps: [],
    });
    expect(isCommerciallyComplete(d)).toBe(true);
    expect(nextGapToAsk(d)).toBeNull();
    expect(readyForConfirmation(d)).toBe(true);
  });

  it("parses ownership answer יד 1 פרטית", () => {
    expect(parseGapAnswer("ownership", "יד 1 פרטית")).toEqual({
      ownershipHand: 1,
      ownershipType: "private",
    });
  });

  it("summary prefers מחיר (not B2B jargon)", () => {
    const s = buildStructuredSummary(
      baseDraft({
        fields: {
          ...baseDraft().fields,
          mileage: 62000,
          b2bPrice: 134000,
        },
      })
    );
    expect(s).toContain("מחיר");
    expect(s).not.toContain("B2B");
    expect(s).not.toContain("מחיר לסוחר");
  });
});

describe("updates / sold / context", () => {
  it("parses mileage / dealer price / ownership / trim / color updates", () => {
    expect(parseVehicleUpdateChanges("תעדכן את הקורולה ל-78 אלף ק״מ")).toMatchObject({
      mileage: 78000,
    });
    expect(parseVehicleUpdateChanges("מחיר לסוחר 132")).toMatchObject({
      b2bPrice: 132000,
    });
    expect(parseVehicleUpdateChanges("היא יד 2")).toMatchObject({
      ownershipHand: 2,
    });
    expect(parseVehicleUpdateChanges("המקור שלה ליסינג")).toMatchObject({
      ownershipType: "leasing",
    });
    expect(parseVehicleUpdateChanges("הצבע לבן")).toMatchObject({
      color: "לבן",
    });
    expect(parseVehicleUpdateChanges("זה Executive")).toMatchObject({
      trim: "Executive",
    });
  });

  it("contextual היא על 79 עכשיו → mileage proposal", () => {
    expect(parseVehicleUpdateChanges("היא על 79 עכשיו")).toMatchObject({
      mileage: 79000,
    });
  });

  it("sold vs unavailable", () => {
    expect(isSoldIntent("הקורולה נמכרה")).toBe(true);
    expect(isUnavailableIntent("לא זמינה כרגע")).toBe(true);
    expect(isSoldIntent("לא זמינה כרגע")).toBe(false);
  });

  it("update intent broader than B2B", () => {
    expect(isUpdateIntent("תעדכן את הקורולה ל-79 אלף")).toBe(true);
    expect(isUpdateIntent("היא יד 1")).toBe(true);
  });

  it("disambiguates two Corollas", () => {
    const candidates: InventoryCandidate[] = [
      {
        id: "v1",
        make: "Toyota",
        model: "Corolla",
        year: 2022,
        mileage: 62000,
        b2bPrice: 134000,
        retailPrice: null,
        status: "ACTIVE",
      },
      {
        id: "v2",
        make: "Toyota",
        model: "Corolla",
        year: 2021,
        mileage: 91000,
        b2bPrice: 120000,
        retailPrice: null,
        status: "ACTIVE",
      },
    ];
    expect(matchVehiclesFromText("הקורולה נמכרה", candidates).length).toBe(2);
  });
});

describe("multi-vehicle drafts", () => {
  it("splits multiple vehicle lines without mixing", () => {
    const chunks = splitMultiVehicleText(`יש לי:
קורולה 22 62 אלף 134 לסוחר
CX5 23 48 אלף 159
ספורטאז 21 90 אלף`);
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toMatch(/קורולה/);
    expect(chunks[1]).toMatch(/CX5/i);
    expect(chunks[2]).toMatch(/ספורטאז/);
  });
});

describe("identity gate preserved", () => {
  it("canConfirm requires make model year", () => {
    expect(canConfirm(baseDraft())).toBe(true);
    expect(hasInventoryIdentity({ ...baseDraft().fields, model: null })).toBe(
      false
    );
  });

  it("amendment updates draft fields", () => {
    const patch = parseAmendment("בעצם 58 אלף קמ");
    expect(patch).toEqual({ mileage: 58000 });
    const updated = applyFields(
      baseDraft({ status: "WAITING_CONFIRMATION" }),
      patch!
    );
    expect(updated.status).toBe("DRAFT");
    expect(updated.fields.mileage).toBe(58000);
  });
});

describe("mobile contrast guards", () => {
  it("workspace CSS uses rm2 dark tokens — no light dark-on-dark fallbacks", () => {
    const css = readFileSync(
      join(root, "src/components/inventory/inventory-agent-workspace.module.css"),
      "utf8"
    );
    expect(css).toContain("--rm2-text-primary");
    expect(css).toContain("--rm2-surface-secondary");
    expect(css).toContain(".bubbleAssistant");
    expect(css).toContain(".bubbleUser");
    expect(css).toContain(".input::placeholder");
    expect(css).not.toMatch(/--v2-text-primary,\s*#1c1917/);
    expect(css).not.toMatch(/background:\s*var\(--v2-surface,\s*#fff\)/);
    expect(css).not.toMatch(/color:\s*var\(--v2-text-primary,\s*#1c1917\)/);
  });
});

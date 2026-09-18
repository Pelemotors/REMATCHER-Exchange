import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  assignMediaToIdentityGroups,
} from "@/services/intake/discovery";
import { govLookupUpdateForKnownPlate } from "@/services/intake/plate-identity";
import { buildIntakeDemandDraft } from "@/services/intake/demand-draft-build";
import { parseDemandFallback } from "@/services/ai/demand-parser";
import { summarizeDemandHe } from "@/services/intake/demand-summary";
import {
  resolveExchangeIntelSubject,
} from "@/services/exchange-intelligence/engine";

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  vehicle: { findFirst: vi.fn() },
  demand: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  vehicleCandidate: { findFirst: vi.fn(), update: vi.fn() },
  appEvent: { findUnique: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/services/dealer/market-scope", () => ({
  dealerAllowsSyntheticMarket: vi.fn(async () => false),
  networkDemandWhere: vi.fn(() => ({})),
}));

vi.mock("@/services/vehicles/relationship-visibility", () => ({
  networkSupplyWhere: vi.fn(() => ({})),
}));

vi.mock("@/services/events/log-event", () => ({
  logEvent: vi.fn(async () => ({ created: true })),
}));

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("intake idempotency and grouping docs", () => {
  it("createOrResumeIntakeBatch uses dealerId+clientBatchId unique resume", () => {
    const src = read("src/services/intake/batch.ts");
    expect(src).toContain("dealerId_clientBatchId");
    expect(src).toContain("intake.batch.create");
    expect(src).toContain("intake.batch.resume");
  });

  it("same plate groups to one candidate; distinct plates stay separate", () => {
    const same = assignMediaToIdentityGroups([
      { id: "a", originalOrder: 0, plateNormalized: "11111111" },
      { id: "b", originalOrder: 1, plateNormalized: "11111111" },
    ]);
    expect(same).toHaveLength(1);
    expect(same[0]?.mediaIds).toEqual(["a", "b"]);

    const distinct = assignMediaToIdentityGroups([
      { id: "a", originalOrder: 0, plateNormalized: "11111111" },
      { id: "b", originalOrder: 1, plateNormalized: "22222222" },
    ]);
    expect(distinct).toHaveLength(2);
    expect(distinct.every((g) => g.groupingReason === "distinct_plate")).toBe(true);
  });

  it("discovery module documents plate grouping rules", () => {
    const src = read("src/services/intake/discovery.ts");
    expect(src).toContain("Distinct plates → distinct groups");
    expect(src).toContain("Distinct plates → distinct groups");
  });
});

describe("plate identity missingFields", () => {
  it("known plate never keeps detectedPlate in missingFields after GOV", () => {
    const update = govLookupUpdateForKnownPlate({
      govState: "NOT_FOUND",
      plateNormalized: "1234567",
      govIdentity: null,
      provenance: {},
      lowOcr: false,
    });
    expect(update.missingFields).toEqual([]);
  });
});

describe("screenshot → demandDraft fixture", () => {
  const whatsAppText = [
    "[18.9.2026, 10:02:11] לקוח: מחפש מאזda CX5 2023 עד 145 אלף",
    "[18.9.2026, 10:02:40] לקוח: יש לי טרייד ספורטאז' 2019",
    "[18.9.2026, 10:03:01] לקוח: תתקשרו 050-7654321",
  ].join("\n");

  it("targets CX5 budget 145k; Sportage stays trade-in; phone needs confirm", () => {
    const parsed = parseDemandFallback(
      whatsAppText.replace("מאזda", "מאזדה")
    );
    expect(parsed.model?.value).toBe("CX-5");
    expect(parsed.make?.value).toBe("Mazda");
    expect(parsed.yearMin?.value).toBe(2023);
    expect(parsed.budgetMax?.value).toBe(145000);
    expect(parsed.customerTradeIn?.model).toBe("Sportage");
    expect(parsed.customerTradeIn?.make).toBe("Kia");
    expect(parsed.ownershipType?.value).not.toBe("TRADE_IN");

    const draft = buildIntakeDemandDraft({
      conversationText: whatsAppText.replace("מאזda", "מאזדה"),
      parsed,
      summaryHe: summarizeDemandHe(parsed),
    });
    expect(draft?.customerHint.requiresPhoneConfirmation).toBe(true);
    expect(draft?.customerHint.confirmedPhone).toBeNull();
    expect(draft?.summaryHe).toMatch(/CX-5|מאזדה/i);
  });
});

describe("exchange intelligence subject + CHECK_BUY_PRICE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolveExchangeIntelSubject returns make_model_unresolved reason", async () => {
    prismaMock.vehicle.findFirst.mockResolvedValue({
      id: "v1",
      make: "???",
      model: null,
      year: 2020,
      fieldProvenance: {},
    });
    const r = await resolveExchangeIntelSubject("d1", { vehicleId: "v1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("subject_unresolved");
      expect(r.reason).toBe("make_model_unresolved");
    }
  });

  it("engine CHECK_BUY_PRICE path exposes needsOfferedPrice and strips privacyNote", () => {
    const engine = read("src/services/exchange-intelligence/engine.ts");
    expect(engine).toContain("needsOfferedPrice: true");
    expect(engine).not.toContain("privacyNote:");
  });
});

describe("observability wiring", () => {
  it("logs structured intake.gov_lookup, intent.apply, intelligence.engine_run", () => {
    expect(read("src/services/intake/process-batch.ts")).toContain(
      '"intake.gov_lookup"'
    );
    expect(read("src/services/vehicles/set-dealer-intent.ts")).toContain(
      '"intent.apply"'
    );
    expect(read("src/services/exchange-intelligence/engine.ts")).toContain(
      '"intelligence.engine_run"'
    );
  });
});

describe("setDealerIntent module", () => {
  it("SEARCH_TARGET uses demand upsert not vehicle relationship", () => {
    const src = read("src/services/demand/search-target-intent.ts");
    expect(src).toContain("upsertDemandForSearchTarget");
    expect(src).not.toContain("dealerRelationship");
  });

  it("blocks silent OWNED via setVehicleRelationship on workspace vehicles", () => {
    expect(read("src/services/vehicles/relationship-visibility.ts")).toContain(
      "use_convert_owned"
    );
  });
});

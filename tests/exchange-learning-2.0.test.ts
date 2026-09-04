/**
 * Exchange Events / Cases / Learning / Intelligence shadow privacy tests.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const mockEventFindUnique = vi.fn();
const mockEventCreate = vi.fn();
const mockCaseFindFirst = vi.fn();
const mockCaseCreate = vi.fn();
const mockCaseUpdate = vi.fn();
const mockLearningFindMany = vi.fn();
const mockLearningFindFirst = vi.fn();
const mockLearningCreate = vi.fn();
const mockLearningUpdate = vi.fn();
const mockComparisonCreate = vi.fn();
const mockMatchUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    exchangeEvent: {
      findUnique: (...a: unknown[]) => mockEventFindUnique(...a),
      create: (...a: unknown[]) => mockEventCreate(...a),
    },
    exchangeCase: {
      findFirst: (...a: unknown[]) => mockCaseFindFirst(...a),
      create: (...a: unknown[]) => mockCaseCreate(...a),
      update: (...a: unknown[]) => mockCaseUpdate(...a),
      findUnique: vi.fn(),
    },
    exchangeLearning: {
      findMany: (...a: unknown[]) => mockLearningFindMany(...a),
      findFirst: (...a: unknown[]) => mockLearningFindFirst(...a),
      create: (...a: unknown[]) => mockLearningCreate(...a),
      update: (...a: unknown[]) => mockLearningUpdate(...a),
    },
    matchDecisionComparison: {
      create: (...a: unknown[]) => mockComparisonCreate(...a),
    },
    candidateMatch: {
      update: (...a: unknown[]) => mockMatchUpdate(...a),
    },
  },
}));

vi.mock("@/services/ai/client", () => ({
  isOpenAIConfigured: () => false,
  getOpenAIClient: () => null,
  logAiOperation: vi.fn(),
}));

import { emitExchangeEvent } from "@/services/exchange/events";
import {
  closeExchangeCaseOutcome,
  upsertMatchExchangeCase,
} from "@/services/exchange/cases";
import {
  distillLearningFromCases,
  privacySafeLearningProjection,
  retrieveRelevantLearnings,
} from "@/services/exchange/learning";
import { runExchangeIntelligenceShadow } from "@/services/exchange/intelligence-shadow";

describe("Exchange Learning 2.0", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits events idempotently by key", async () => {
    mockEventFindUnique.mockResolvedValueOnce({ id: "e1", eventType: "MATCH_CREATED" });
    const row = await emitExchangeEvent({
      eventType: "MATCH_CREATED",
      idempotencyKey: "k1",
      dealerId: "d1",
    });
    expect(row?.id).toBe("e1");
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("sanitizes PII keys from eventData", async () => {
    mockEventFindUnique.mockResolvedValue(null);
    mockEventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
    await emitExchangeEvent({
      eventType: "INVENTORY_ADDED",
      eventData: {
        make: "Toyota",
        phone: "050",
        transcript: "secret chat",
        dealerMemory: { x: 1 },
      },
      idempotencyKey: "k2",
    });
    const data = mockEventCreate.mock.calls[0][0].data;
    const payload = data.eventData as Record<string, unknown>;
    expect(payload.make).toBe("Toyota");
    expect(payload.phone).toBeUndefined();
    expect(payload.transcript).toBeUndefined();
    expect(payload.dealerMemory).toBeUndefined();
  });

  it("does not treat archive semantics as sold in source comments", () => {
    const eventsSrc = readFileSync(
      join(process.cwd(), "src/services/exchange/events.ts"),
      "utf8"
    );
    expect(eventsSrc).toContain("Never infer VEHICLE_SOLD from removal");
  });

  it("upserts match case with stripped dealer identity fields", async () => {
    mockCaseFindFirst.mockResolvedValue(null);
    mockCaseCreate.mockImplementation(async ({ data }: { data: unknown }) => data);
    await upsertMatchExchangeCase({
      candidateMatchId: "m1",
      vehicleSnapshot: {
        make: "Hyundai",
        dealerId: "SECRET",
        phone: "050",
        businessName: "Hidden Motors",
      },
    });
    const data = mockCaseCreate.mock.calls[0][0].data;
    const snap = data.vehicleSnapshot as Record<string, unknown>;
    expect(snap.make).toBe("Hyundai");
    expect(snap.dealerId).toBeUndefined();
    expect(snap.phone).toBeUndefined();
    expect(snap.businessName).toBeUndefined();
  });

  it("keeps relevance and transaction outcomes separate", async () => {
    mockCaseFindFirst.mockResolvedValue({ id: "c1", evidenceType: "SYSTEM_OBSERVED" });
    mockCaseUpdate.mockResolvedValue({});
    await closeExchangeCaseOutcome({
      candidateMatchId: "m1",
      relevanceOutcome: "RELEVANT",
      transactionOutcome: "NO_DEAL",
      outcomeReasonCategory: "FINANCING",
    });
    expect(mockCaseUpdate.mock.calls[0][0].data).toMatchObject({
      relevanceOutcome: "RELEVANT",
      transactionOutcome: "NO_DEAL",
      outcomeReasonCategory: "FINANCING",
    });
  });

  it("refuses single-anecdote learning distillation", async () => {
    const out = await distillLearningFromCases({
      topic: "tucson.dwell",
      learningType: "inventory_lifecycle",
      summary: "sold fast",
      supportingCaseIds: ["only-one"],
    });
    expect(out.ok).toBe(false);
  });

  it("retrieves learnings with time decay and segment boost", async () => {
    mockLearningFindMany.mockResolvedValue([
      {
        id: "l1",
        topic: "t",
        learningType: "dwell",
        summary: "observed lower dwell in segment",
        confidence: 0.5,
        status: "ACTIVE",
        segmentContext: { make: "hyundai", model: "tucson" },
        lastEvaluatedAt: new Date(),
        validTo: null,
      },
    ]);
    const rows = await retrieveRelevantLearnings({
      make: "Hyundai",
      model: "Tucson",
      limit: 3,
    });
    expect(rows).toHaveLength(1);
  });

  it("privacySafeLearningProjection omits dealer-private fields", () => {
    const proj = privacySafeLearningProjection({
      id: "l1",
      topic: "t",
      learningType: "x",
      summary: "s",
      confidence: 0.4,
      segmentContext: { make: "Hyundai" },
      status: "ACTIVE",
    });
    expect(proj).not.toHaveProperty("dealerId");
    expect(JSON.stringify(proj)).not.toMatch(/phone|memory/i);
  });

  it("shadow intelligence no-ops without OpenAI and never changes visibility authority", async () => {
    const decision = await runExchangeIntelligenceShadow({
      candidateMatchId: "m1",
      intent: { schemaVersion: 2 },
      engine: {
        engineVersion: "matching-engine-2.0",
        band: "GOOD",
        resolutionState: "RESOLVED",
        score: 80,
        hardPassed: true,
        verificationRequired: false,
        dimensions: [],
        fits: [],
        compromises: [],
        unknowns: [],
        hardChecks: [],
        criticalResults: [],
        decisionBlockingUnknowns: [],
        knownFits: [],
        knownTensions: [],
        whyPotential: null,
      },
      vehicle: { make: "Hyundai", model: "Tucson" },
    });
    expect(decision).toBeNull();
    expect(mockMatchUpdate).not.toHaveBeenCalled();
  });

  it("agent tools include search intent and report_business_event", () => {
    const tools = readFileSync(
      join(process.cwd(), "src/services/assistant/agent-tools.ts"),
      "utf8"
    );
    expect(tools).toContain("draft_search_intent");
    expect(tools).toContain("report_business_event");
    expect(tools).toContain("Never ask the dealer for numeric weights");
  });
});

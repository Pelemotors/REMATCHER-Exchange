/**
 * Universal Agent 3.1 — capability router transcripts (mocked domain).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ingestSpy = vi.fn();
const persistDraft = vi.fn();
const updateDemand = vi.fn();
const activateDemand = vi.fn();
const parseDemandMock = vi.fn();
const owned = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/services/notifications", () => ({ logAppEvent: vi.fn() }));
vi.mock("@/services/ai/client", () => ({
  callOpenAIStructured: vi.fn(),
  isOpenAIConfigured: () => false,
  logAiOperation: vi.fn(),
}));
vi.mock("@/services/assistant/inventory-ingest", () => ({
  handleInventoryIngestTurn: (...args: unknown[]) => ingestSpy(...args),
}));
vi.mock("@/services/assistant/inventory-manage", () => ({
  handleInventoryManageTurn: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    demand: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; dealerId?: string } }) =>
        where.dealerId === "dealer-1" && where.id !== "foreign-demand"
          ? { id: where.id, confirmedJson: { make: "Mazda", model: "CX-5" } }
          : null
      ),
      findMany: vi.fn(async () => []),
    },
    vehicle: { findFirst: vi.fn(async () => null) },
    reveal: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("@/services/ai/demand-parser", () => ({
  parseDemand: (...args: unknown[]) => parseDemandMock(...args),
}));
vi.mock("@/services/demand/demand-mutations", () => ({
  persistDemandDraftForDealer: (...args: unknown[]) => persistDraft(...args),
  updateDemandForDealer: (...args: unknown[]) => updateDemand(...args),
  activateDemandForDealer: (...args: unknown[]) => activateDemand(...args),
}));
vi.mock("@/services/assistant/target-resolution", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/services/assistant/target-resolution")
  >();
  return {
    ...actual,
    assertDemandOwned: (...args: unknown[]) => owned(...args),
    resolveAuthorizedDemands: vi.fn(async () => [
      { id: "s1", title: "Mazda CX-5" },
    ]),
  };
});
vi.mock("@/services/assistant/tools/read-tools", () => ({
  executeToolsParallel: vi.fn(async (tools: string[]) => ({
    results: {
      getMyActiveDemands: [{ id: "s1", title: "Mazda CX-5", daysLeft: 5 }],
      getMyExpiringDemands: [],
      getMyAuthorizedMatches: [
        {
          id: "m1",
          demandTitle: "Toyota Corolla",
          scoreBand: "STRONG",
          vehicle: { make: "Toyota", model: "Corolla" },
        },
      ],
      getMyReveals: [{ id: "r1", counterpart: "סוחר מאומת", vehicle: "CX-5" }],
      getMyPendingOutcomes: [{ id: "r2", daysOpen: 3 }],
      getMyOpportunities: [{ id: "o1", vehicleTitle: "Mazda 3" }],
    },
    durations: Object.fromEntries(tools.map((t) => [t, 1])),
    errors: {},
  })),
}));

import { routeTurnPlan } from "@/services/assistant/capability-router";
import { executeSearchMutation } from "@/services/assistant/search-capability";
import { planTurnFallback } from "@/services/assistant/turn-planner";
import type { AgentTurnPlan } from "@/services/assistant/agent-turn-plan";
import type { AgentMeta } from "@/services/assistant/tools/registry";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";

function meta(): AgentMeta {
  return {
    agentVersion: AGENT_VERSION,
    plannerUsed: false,
    synthesizerUsed: false,
    model: null,
    tools: [],
    toolDurations: {},
    plannerDurationMs: 0,
    synthesisDurationMs: 0,
    fallbackReason: null,
    responseType: "read",
    legacyPlannerUsed: false,
  };
}

function basePlan(action: Partial<AgentTurnPlan["action"]>): AgentTurnPlan {
  return {
    understanding: {
      userGoal: "test",
      messageMeaning: "test",
      refersToCurrentTask: false,
      refersToActiveObject: false,
      targetReference: action.targetReference ?? null,
    },
    responseNeed: { shouldAnswerNow: true, answerGoal: null },
    conversation: {
      keepCurrentTask: false,
      suspendCurrentTask: false,
      resumeTaskReference: null,
      correctedUnderstanding: null,
      queuedFollowUp: null,
    },
    facts: { add: [], correct: [], reject: [] },
    action: {
      kind: "READ",
      capability: "SEARCHES",
      operation: "READ",
      scope: "ONE",
      toolGoal: null,
      targetReference: null,
      ...action,
    },
    clarification: { needed: false, reason: null, suggestedQuestion: null },
    telemetryHint: { relation: "NEW_REQUEST", questionAbout: null },
    confidence: 0.9,
    source: "ai",
  };
}

describe("Capability router transcripts", () => {
  beforeEach(() => {
    ingestSpy.mockReset();
    persistDraft.mockReset();
    updateDemand.mockReset();
    activateDemand.mockReset();
    parseDemandMock.mockReset();
    owned.mockReset();
    persistDraft.mockResolvedValue({ id: "draft-1" });
    parseDemandMock.mockResolvedValue({
      make: "Mazda",
      model: "CX-5",
      yearMin: 2022,
    });
    owned.mockImplementation(async (_d: string, id: string) => id !== "foreign-demand");
  });

  it("SEARCHES CREATE persists draft and does not ingest inventory", async () => {
    const result = await routeTurnPlan({
      dealerId: "dealer-1",
      userId: "u1",
      message: "תפתח לי חיפוש ל-CX5 2022 ומעלה",
      plan: basePlan({
        kind: "PROPOSE_MUTATION",
        capability: "SEARCHES",
        operation: "CREATE",
        scope: "ONE",
      }),
      conversation: {
        sessionContext: { operatingMode: "inventory_management" },
        pendingInventoryDraft: {
          status: "DRAFT",
          sourceText: "קורולה",
          fields: {
            make: "Toyota",
            model: "Corolla",
            year: 2023,
            mileage: 60000,
            ownershipType: null,
            ownershipHand: null,
            b2bPrice: null,
            retailPrice: null,
            color: null,
            trim: null,
            region: null,
          },
          askedGaps: [],
        },
      },
      meta: meta(),
    });
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(persistDraft).toHaveBeenCalled();
    expect(result.meta?.legacyPlannerUsed).toBe(false);
    expect(result.conversation?.pendingSearchDraft?.demandId).toBe("draft-1");
    expect(result.conversation?.pendingInventoryDraft?.fields.model).toBe("Corolla");
    expect(result.message).not.toMatch(/חסר לי היצרן/);
  });

  it("HELP on inventory page does not ingest", async () => {
    const result = await routeTurnPlan({
      dealerId: "dealer-1",
      userId: "u1",
      message: "אפשר לשלוח לך כמה רכבים ביחד? תן לי פורמט",
      plan: basePlan({
        kind: "ANSWER_ONLY",
        capability: "HELP",
        operation: "HELP",
        toolGoal: null,
      }),
      conversation: { sessionContext: { operatingMode: "inventory_management" } },
      meta: meta(),
    });
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(result.message).toMatch(/שורה לכל רכב/);
    expect(result.meta?.executor).toBe("help");
  });

  it("MATCHES READ returns authorized list not only a count", async () => {
    const result = await routeTurnPlan({
      dealerId: "dealer-1",
      userId: "u1",
      message: "תראה לי את ההתאמות שלי",
      plan: basePlan({
        kind: "READ",
        capability: "MATCHES",
        operation: "READ",
        toolGoal: "get_my_matches",
      }),
      meta: meta(),
    });
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(result.message).toMatch(/Corolla|התאמ/);
  });

  it("REVEALS and OUTCOMES read without legacy planner", async () => {
    const reveals = await routeTurnPlan({
      dealerId: "dealer-1",
      userId: "u1",
      message: "איזה חשיפות יש לי?",
      plan: basePlan({
        kind: "READ",
        capability: "REVEALS",
        operation: "READ",
        toolGoal: "get_my_reveals",
      }),
      meta: meta(),
    });
    expect(reveals.meta?.legacyPlannerUsed).toBe(false);
    expect(reveals.meta?.executor).toBe("read_tools");

    const outcomes = await routeTurnPlan({
      dealerId: "dealer-1",
      userId: "u1",
      message: "על מה עוד לא עדכנתי תוצאה?",
      plan: basePlan({
        kind: "READ",
        capability: "OUTCOMES",
        operation: "READ",
        toolGoal: "get_my_outcomes",
      }),
      meta: meta(),
    });
    expect(outcomes.meta?.legacyPlannerUsed).toBe(false);
  });

  it("client-state tampering: foreign demand id is rejected", async () => {
    const result = await executeSearchMutation({
      dealerId: "dealer-1",
      pending: {
        action: "close_demand",
        label: "close",
        payload: { demandId: "foreign-demand" },
      },
      meta: meta(),
    });
    expect(result?.message).toMatch(/אין הרשאה/);
  });

  it("planner failure fallback clarifies instead of inventory ingest", () => {
    const plan = planTurnFallback({
      message: "asdfzxcv qwerty",
      inventoryMode: true,
    });
    expect(plan.source).not.toBe("ai");
    expect(plan.action.kind).not.toBe("PROPOSE_MUTATION");
    expect(plan.action.capability).not.toBe("INVENTORY");
  });
});

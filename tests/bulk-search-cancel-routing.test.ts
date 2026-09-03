/**
 * Production transcript: cancel all searches while inventory workspace is open.
 * Inventory ingest must not own the turn.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ingestSpy = vi.fn();
const bulkPrep = vi.fn();
const bulkExec = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/services/notifications", () => ({ logAppEvent: vi.fn() }));
vi.mock("@/services/ai/client", () => ({
  callOpenAIStructured: vi.fn(),
  isOpenAIConfigured: () => true,
  logAiOperation: vi.fn(),
}));
vi.mock("@/services/assistant/inventory-ingest", () => ({
  handleInventoryIngestTurn: (...args: unknown[]) => ingestSpy(...args),
}));
vi.mock("@/services/assistant/inventory-manage", () => ({
  handleInventoryManageTurn: vi.fn(),
}));
vi.mock("@/services/assistant/planner", () => ({
  planAgentTurn: vi.fn(async () => ({
    plan: { actionIntent: "read_state", tools: [] },
    plannerUsed: true,
    model: "mock",
    durationMs: 1,
  })),
}));
vi.mock("@/services/assistant/synthesizer", () => ({
  helpOnlyResponse: () => ({ message: "help", suggestions: [] }),
  synthesizeResponse: vi.fn(),
}));
vi.mock("@/services/assistant/tools/read-tools", () => ({
  executeToolsParallel: vi.fn(),
  getDemandByIdForDealer: vi.fn(),
}));
vi.mock("@/services/assistant/tools/action-tools", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/assistant/tools/action-tools")
  >("@/services/assistant/tools/action-tools");
  return {
    ...actual,
    prepareBulkDemandClosure: (...args: unknown[]) => bulkPrep(...args),
    executeBulkDemandClosure: (...args: unknown[]) => bulkExec(...args),
  };
});

vi.mock("@/services/assistant/turn-planner", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/assistant/turn-planner")
  >("@/services/assistant/turn-planner");
  return {
    ...actual,
    planConversationTurn: vi.fn(),
  };
});

import { planConversationTurn } from "@/services/assistant/turn-planner";
import { runExchangeAssistantV2 } from "@/services/assistant/v2-orchestrator";
import type { AgentTurnPlan } from "@/services/assistant/agent-turn-plan";

function productionLikePlan(): AgentTurnPlan {
  return {
    understanding: {
      userGoal: "cancel all of my active searches",
      messageMeaning: "תבטל כרגע את כל החיפושים שלי",
      refersToCurrentTask: false,
      refersToActiveObject: false,
      targetReference: "all my searches",
    },
    responseNeed: { shouldAnswerNow: true, answerGoal: "confirm_close" },
    conversation: {
      keepCurrentTask: false,
      suspendCurrentTask: false,
      resumeTaskReference: null,
      correctedUnderstanding: null,
    },
    facts: { add: [], correct: [], reject: [] },
    action: {
      kind: "PROPOSE_MUTATION",
      capability: "inventory",
      toolGoal: null,
      targetReference: "all my searches",
    },
    clarification: { needed: false, reason: null, suggestedQuestion: null },
    telemetryHint: { relation: "NEW_REQUEST", questionAbout: null },
    confidence: 0,
    source: "ai",
  };
}

describe("Transcript — תבטל כרגע את כל החיפושים שלי", () => {
  beforeEach(() => {
    ingestSpy.mockReset();
    bulkPrep.mockReset();
    bulkExec.mockReset();
    vi.mocked(planConversationTurn).mockResolvedValue(productionLikePlan());
    bulkPrep.mockResolvedValue({
      ok: true,
      empty: false,
      demands: [
        { id: "s1", title: "Mazda CX-5" },
        { id: "s2", title: "חיפוש 2" },
        { id: "s3", title: "חיפוש 3" },
        { id: "s4", title: "חיפוש 4" },
      ],
      action: "close_demands_bulk",
      label: 'לסגור 4 חיפושים פעילים (Mazda CX-5, חיפוש 2, חיפוש 3, חיפוש 4)?',
      payload: { demandIds: ["s1", "s2", "s3", "s4"] },
    });
  });

  it("proposes bulk close with confirmation; inventory ingest is not selected", async () => {
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "תבטל כרגע את כל החיפושים שלי",
      context: { route: "/inventory", mode: "inventory_management" },
      conversation: {
        sessionContext: { operatingMode: "inventory_management" },
        lastAuthorizedSnapshot: {
          activeDemandCount: 4,
          activeDemandIds: ["s1", "s2", "s3", "s4"],
          activeDemandTitles: ["Mazda CX-5", "חיפוש 2", "חיפוש 3", "חיפוש 4"],
        },
        lastList: [
          { id: "s1", title: "Mazda CX-5", type: "demand" },
          { id: "s2", title: "חיפוש 2", type: "demand" },
          { id: "s3", title: "חיפוש 3", type: "demand" },
          { id: "s4", title: "חיפוש 4", type: "demand" },
        ],
        pendingInventoryDraft: {
          status: "DRAFT",
          sourceText: "קורולה",
          fields: {
            make: "Toyota",
            model: "Corolla",
            year: 2022,
            mileage: null,
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
    });

    expect(planConversationTurn).toHaveBeenCalled();
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(bulkExec).not.toHaveBeenCalled();
    expect(bulkPrep).toHaveBeenCalledWith("dealer-1");
    expect(result.message).not.toMatch(/חסר לי היצרן/);
    expect(result.message).toMatch(/4 חיפושים/);
    expect(result.conversation?.pendingConfirmation?.action).toBe(
      "close_demands_bulk"
    );
    expect(result.conversation?.pendingConfirmation?.payload.demandIds).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
    ]);
    expect(result.conversation?.pendingInventoryDraft?.fields.model).toBe(
      "Corolla"
    );
  });

  it("executes domain close only after explicit confirmation", async () => {
    bulkExec.mockResolvedValue({ ok: true, closed: 4, requested: 4 });
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "כן",
      context: { route: "/inventory", mode: "inventory_management" },
      conversation: {
        pendingConfirmation: {
          action: "close_demands_bulk",
          label: "לסגור 4 חיפושים?",
          payload: { demandIds: ["s1", "s2", "s3", "s4"] },
        },
        pendingInventoryDraft: {
          status: "DRAFT",
          sourceText: "קורולה",
          fields: {
            make: "Toyota",
            model: "Corolla",
            year: 2022,
            mileage: null,
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
    });
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(bulkExec).toHaveBeenCalledWith("dealer-1", ["s1", "s2", "s3", "s4"]);
    expect(result.message).toMatch(/סגרתי 4/);
    expect(result.conversation?.pendingInventoryDraft?.fields.make).toBe(
      "Toyota"
    );
  });
});

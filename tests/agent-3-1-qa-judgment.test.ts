/**
 * Agent 3.1.1 production QA — judgment vs help, natural confirm, search labels.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ingestSpy = vi.fn();
const bulkPrep = vi.fn();
const bulkExec = vi.fn();

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
      findFirst: vi.fn(async ({ where }: { where: { dealerId?: string } }) =>
        where.dealerId === "dealer-1" ? { id: where } : null
      ),
    },
  },
}));
vi.mock("@/services/assistant/target-resolution", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/services/assistant/target-resolution")
  >();
  return {
    ...actual,
    assertDemandOwned: vi.fn(async () => true),
    resolveAuthorizedDemands: vi.fn(async () => [
      { id: "s1", title: "Mazda CX-5 — 2022 ומעלה" },
      { id: "s2", title: "Mazda CX-5 — 2023 ומעלה" },
      { id: "s3", title: "Mazda CX-5 — עד 120 אלף" },
      { id: "s4", title: "Mazda CX-5 — עד 130 אלף" },
    ]),
  };
});
vi.mock("@/services/assistant/tools/read-tools", () => ({
  executeToolsParallel: vi.fn(async (tools: string[]) => ({
    results: {
      getMyExchangeState: {
        activeDemands: 4,
        authorizedMatches: 2,
        openOpportunities: 0,
      },
      getMyExpiringDemands: [
        { id: "s1", title: "Mazda CX-5 — 2022 ומעלה", daysLeft: 1 },
      ],
      getMyPendingValidations: [],
      getMyAuthorizedMatches: [
        { id: "m1", demandTitle: "Mazda CX-5", scoreBand: "STRONG" },
        { id: "m2", demandTitle: "Mazda CX-5", scoreBand: "ALTERNATIVE" },
      ],
      getMyOpportunities: [],
      getMyInventoryRequiringAttention: [
        { id: "v1", title: "Toyota Corolla 2023", freshnessState: "STALE" },
      ],
      getMyStaleInventory: [{ id: "v1", title: "Toyota Corolla 2023" }],
      getMyPendingOutcomes: [],
    },
    durations: Object.fromEntries(tools.map((t) => [t, 1])),
    errors: {},
  })),
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

import {
  formatBulkSearchCloseMessage,
  formatSearchDisplayLabel,
} from "@/lib/demand-display";
import { isJudgmentPlan, isProductHelpPlan } from "@/services/assistant/turn-policy";
import { routeTurnPlan } from "@/services/assistant/capability-router";
import { planConversationTurn } from "@/services/assistant/turn-planner";
import { runExchangeAssistantV2 } from "@/services/assistant/v2-orchestrator";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";
import type { AgentTurnPlan } from "@/services/assistant/agent-turn-plan";
import type { AgentMeta } from "@/services/assistant/tools/registry";
import { productHelpAnswer } from "@/services/assistant/help-responses";
import { buildDeterministicResponse } from "@/services/assistant/synthesizer";

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

function plan(action: Partial<AgentTurnPlan["action"]>, relation: AgentTurnPlan["telemetryHint"]["relation"] = "NEW_REQUEST"): AgentTurnPlan {
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
      capability: "GENERAL",
      operation: "READ",
      scope: null,
      toolGoal: "get_dealer_attention",
      targetReference: null,
      ...action,
    },
    clarification: { needed: false, reason: null, suggestedQuestion: null },
    telemetryHint: { relation, questionAbout: null },
    confidence: 0.8,
    source: "ai",
  };
}

const pendingFour = {
  action: "close_demands_bulk",
  label: "לסגור 4?",
  payload: {
    demandIds: ["s1", "s2", "s3", "s4"],
    capability: "SEARCHES",
    operation: "CLOSE",
    scope: "ALL_AUTHORIZED",
    targetCount: 4,
  },
};

describe("Search display labels", () => {
  it("canonicalizes mixed make language and differentiates constraints", () => {
    const a = formatSearchDisplayLabel({
      make: "מאזדה",
      model: "CX-5",
      yearMin: 2022,
      budgetMax: 130000,
    });
    const b = formatSearchDisplayLabel({
      make: "Mazda",
      model: "CX-5",
      yearMin: 2023,
    });
    expect(a).toMatch(/^Mazda CX-5/);
    expect(a).toMatch(/2022 ומעלה/);
    expect(a).toMatch(/130 אלף/);
    expect(b).toMatch(/2023 ומעלה/);
    expect(a).not.toBe(b);
  });

  it("summarizes identical labels instead of repeating them", () => {
    const label = formatSearchDisplayLabel({ make: "Mazda", model: "CX-5" });
    const msg = formatBulkSearchCloseMessage([label, label, label, label]);
    expect(msg).toMatch(/4 חיפושים פעילים ל-Mazda CX-5/);
    expect(msg.split("Mazda CX-5").length).toBe(2);
  });

  it("lists differentiated searches", () => {
    const msg = formatBulkSearchCloseMessage([
      "Mazda CX-5 — 2022 ומעלה, עד 130 אלף",
      "Mazda CX-5 — 2023 ומעלה",
    ]);
    expect(msg).toMatch(/• /);
    expect(msg).toMatch(/לסגור את כולם/);
  });
});

describe("Judgment vs HELP (production plans)", () => {
  it("production HELP+ANSWER_ONLY start question is judgment, not product help", () => {
    const production = plan(
      {
        kind: "ANSWER_ONLY",
        capability: "HELP",
        operation: "NONE",
        toolGoal: null,
      },
      "ADVISORY_QUESTION"
    );
    expect(isJudgmentPlan(production)).toBe(true);
    expect(isProductHelpPlan(production)).toBe(false);
  });

  it("template question stays product help", () => {
    const helpPlan = plan(
      { kind: "ANSWER_ONLY", capability: "HELP", operation: "HELP", toolGoal: null },
      "ADVISORY_QUESTION"
    );
    helpPlan.telemetryHint.questionAbout = "INPUT_FORMAT";
    expect(isJudgmentPlan(helpPlan)).toBe(false);
    expect(isProductHelpPlan(helpPlan)).toBe(true);
  });

  it("ממה כדאי להתחיל? reads attention snapshot, not the capability menu", async () => {
    const result = await routeTurnPlan({
      dealerId: "dealer-1",
      userId: "u1",
      message: "ממה כדאי להתחיל?",
      plan: plan(
        {
          kind: "ANSWER_ONLY",
          capability: "HELP",
          operation: "NONE",
          toolGoal: null,
        },
        "ANSWER"
      ),
      conversation: { sessionContext: { operatingMode: "inventory_management" } },
      meta: meta(),
    });
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(result.message).not.toBe(
      productHelpAnswer(null, "ממה כדאי להתחיל?")
    );
    expect(result.message).not.toMatch(/אפשר לשאול על מלאי/);
    expect(result.meta?.executor).toBe("dealer_attention");
    expect(result.meta?.legacyPlannerUsed).toBe(false);
    expect(result.message).toMatch(/CX-5|התאמ|מלאי|טיפול/);
  });

  it("zero actionable state is grounded, not a capability menu", () => {
    const response = buildDeterministicResponse(
      { getMyExchangeState: { activeDemands: 0, authorizedMatches: 0 } },
      "מה כדאי לעשות עכשיו?",
      { goal: "prioritize_actions" }
    );
    expect(response.message).toMatch(/אין משהו דחוף/);
    expect(response.message).not.toMatch(/אפשר לשאול על מלאי/);
  });

  it("בהינתן הנתונים שלי uses the same grounded path", async () => {
    const result = await routeTurnPlan({
      dealerId: "dealer-1",
      userId: "u1",
      message: "בהינתן הנתונים שלי, ממה כדאי שנתחיל?",
      plan: plan(
        {
          kind: "ANSWER_ONLY",
          capability: "HELP",
          operation: "NONE",
          toolGoal: null,
        },
        "ADVISORY_QUESTION"
      ),
      meta: meta(),
    });
    expect(result.message).not.toMatch(/אפשר לשאול על מלאי/);
    expect(result.meta?.executor).toBe("dealer_attention");
  });
});

describe("Natural confirmation", () => {
  beforeEach(() => {
    ingestSpy.mockReset();
    bulkPrep.mockReset();
    bulkExec.mockReset();
    bulkExec.mockResolvedValue({ ok: true, closed: 4, requested: 4 });
  });

  it.each(["כן", "כן תבטל אותם", "סגור אותם", "מאשר", "יאללה"])(
    "confirms pending close without a second proposal: %s",
    async (message) => {
      vi.mocked(planConversationTurn).mockResolvedValue(
        plan({
          kind: "CONFIRM_PENDING_MUTATION",
          capability: "SEARCHES",
          operation: "CLOSE",
          scope: "ALL_AUTHORIZED",
          toolGoal: null,
        }, "CONFIRMATION")
      );
      const result = await runExchangeAssistantV2({
        dealerId: "dealer-1",
        userId: "u1",
        message,
        context: { route: "/inventory", mode: "inventory_management" },
        conversation: { pendingConfirmation: pendingFour },
      });
      expect(bulkPrep).not.toHaveBeenCalled();
      expect(bulkExec).toHaveBeenCalledWith("dealer-1", ["s1", "s2", "s3", "s4"]);
      expect(result.message).toMatch(/סגרתי 4/);
      expect(result.meta?.legacyPlannerUsed).toBe(false);
    }
  );

  it("restated CLOSE ALL while pending executes instead of re-proposing", async () => {
    vi.mocked(planConversationTurn).mockResolvedValue(
      plan({
        kind: "PROPOSE_MUTATION",
        capability: "SEARCHES",
        operation: "CLOSE",
        scope: "ALL_AUTHORIZED",
        toolGoal: null,
      })
    );
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "u1",
      message: "כן תבטל אותם",
      context: { route: "/inventory" },
      conversation: { pendingConfirmation: pendingFour },
    });
    expect(bulkPrep).not.toHaveBeenCalled();
    expect(bulkExec).toHaveBeenCalled();
    expect(result.message).toMatch(/סגרתי 4/);
  });

  it("rejects without writing", async () => {
    vi.mocked(planConversationTurn).mockResolvedValue(
      plan({
        kind: "CANCEL_PENDING_MUTATION",
        capability: "SEARCHES",
        operation: "CLOSE",
        toolGoal: null,
      }, "CANCEL")
    );
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "u1",
      message: "לא, תשאיר אותם",
      context: { route: "/inventory" },
      conversation: { pendingConfirmation: pendingFour },
    });
    expect(bulkExec).not.toHaveBeenCalled();
    expect(result.message).toMatch(/בוטל/);
  });

  it("scope change does not close all four", async () => {
    const result = await routeTurnPlan({
      dealerId: "dealer-1",
      userId: "u1",
      message: "כן אבל רק שניים",
      plan: plan({
        kind: "PROPOSE_MUTATION",
        capability: "SEARCHES",
        operation: "CLOSE",
        scope: "MANY",
        toolGoal: null,
      }),
      conversation: { pendingConfirmation: pendingFour },
      meta: meta(),
    });
    expect(bulkExec).not.toHaveBeenCalled();
    expect(result.message).toMatch(/שניים|אילו/);
    expect(result.meta?.responseType).not.toBe("mutation_close");
  });

  it("match read during pending close does not confirm or cancel", async () => {
    const result = await routeTurnPlan({
      dealerId: "dealer-1",
      userId: "u1",
      message: "רגע, כמה התאמות יש לי?",
      plan: plan({
        kind: "READ",
        capability: "MATCHES",
        operation: "READ",
        toolGoal: "get_my_matches",
      }),
      conversation: { pendingConfirmation: pendingFour },
      meta: meta(),
    });
    expect(bulkExec).not.toHaveBeenCalled();
    expect(result.conversation?.pendingConfirmation?.action).toBe(
      "close_demands_bulk"
    );
  });
});

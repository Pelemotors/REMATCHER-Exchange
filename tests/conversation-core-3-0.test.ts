/**
 * Conversation Core 3.0 — Turn Plan schema + transcript-style tests.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/ai/client", () => ({
  callOpenAIStructured: vi.fn(),
  isOpenAIConfigured: () => false,
  logAiOperation: vi.fn(),
}));
vi.mock("@/services/notifications", () => ({
  logAppEvent: vi.fn(),
}));

import { TURN_PLAN_SCHEMA } from "@/services/assistant/turn-plan-schema";
import {
  planTurnFallback,
  turnPlanToEvent,
} from "@/services/assistant/turn-planner";
import {
  inventoryOwnsTurn,
  shouldProposeDemandClosure,
  validateTurnPlan,
  toolGoalToReadTools,
} from "@/services/assistant/turn-policy";
import { checkPrivacyGate } from "@/services/assistant/privacy-gate";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";
import { handleInventoryIngestTurn } from "@/services/assistant/inventory-ingest";
import type { PendingInventoryDraft } from "@/services/assistant/inventory-draft";
import type { AgentTurnPlan } from "@/services/assistant/agent-turn-plan";
import type { ConversationState } from "@/services/assistant/conversation-state";

type JsonSchemaNode = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaNode;
  items?: JsonSchemaNode;
};

function validateStrictSchema(node: JsonSchemaNode, path: string): string[] {
  const errors: string[] = [];
  if (node.type === "object" || node.properties) {
    if (node.additionalProperties !== false) {
      errors.push(`${path}: additionalProperties must be false`);
    }
    if (!Array.isArray(node.required)) {
      errors.push(`${path}: required missing`);
    } else if (node.properties) {
      for (const key of Object.keys(node.properties)) {
        if (!node.required!.includes(key)) {
          errors.push(`${path}: required missing ${key}`);
        }
        errors.push(
          ...validateStrictSchema(node.properties[key], `${path}.${key}`)
        );
      }
    }
  }
  if (node.items) {
    errors.push(...validateStrictSchema(node.items, `${path}.items`));
  }
  return errors;
}

describe("Conversation Core 3.0 — versioning", () => {
  it("AGENT_VERSION is 3.0 — existing Agent, not a new instance", () => {
    expect(AGENT_VERSION).toBe("3.0");
  });
});

describe("TURN_PLAN_SCHEMA — OpenAI strict compliance", () => {
  it("passes recursive strict validation", () => {
    const violations = validateStrictSchema(
      TURN_PLAN_SCHEMA as unknown as JsonSchemaNode,
      "root"
    );
    expect(violations).toEqual([]);
  });
});

describe("Turn Planner fallback — CURRENT MESSAGE > WORKFLOW", () => {
  it("workflow help → ANSWER_ONLY / INPUT_FORMAT — not fishing", () => {
    const msg =
      "כדי לכתוב לך כמה רכבים ביחד?\nיכול להכין לי טמפלייט של פרטי רכב שצריך לכתוב?";
    expect(checkPrivacyGate(msg).blocked).toBe(false);
    const plan = planTurnFallback({ message: msg, inventoryMode: true });
    expect(plan.action.kind).toBe("ANSWER_ONLY");
    expect(plan.telemetryHint.questionAbout).toBe("INPUT_FORMAT");
    const policy = validateTurnPlan({ message: msg, plan });
    expect(policy.decision).toBe("ALLOW");
  });

  it("network fishing still DENY via policy", () => {
    const msg = "כמה CX-5 יש ברשת?";
    const plan = planTurnFallback({ message: msg });
    const policy = validateTurnPlan({ message: msg, plan });
    expect(policy.decision).toBe("DENY");
  });

  it("topic switch mid-draft → SUSPEND_AND_READ get_my_matches", () => {
    const conversation: ConversationState = {
      pendingInventoryDraft: {
        status: "DRAFT",
        sourceText: "אודי",
        fields: {
          make: "Audi",
          model: "Q7",
          year: 2012,
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
    };
    const plan = planTurnFallback({
      message: "כמה התאמות יש לי?",
      conversation,
      inventoryMode: true,
    });
    expect(plan.action.kind).toBe("SUSPEND_AND_READ");
    expect(plan.action.toolGoal).toBe("get_my_matches");
    expect(toolGoalToReadTools("get_my_matches")).toContain(
      "getMyAuthorizedMatches"
    );
  });

  it("maps plan to StructuredTurnEvent bridge", () => {
    const plan = planTurnFallback({
      message: "תן לי טמפלייט למלאי",
      inventoryMode: true,
    });
    const event = turnPlanToEvent(plan);
    expect(event.relation).toBe("ADVISORY_QUESTION");
    expect(event.intent).toBe("help");
  });
});

describe("Transcript A — advice mid-draft preserves work", () => {
  function emptyDraft(): PendingInventoryDraft {
    return {
      status: "DRAFT",
      sourceText: "קורולה 2022",
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
    };
  }

  it("מה הכי חשוב בפרטי מודעה? answers advice, preserves draft", async () => {
    const draft = emptyDraft();
    const conversation: ConversationState = {
      pendingInventoryDraft: draft,
      sessionContext: {
        forcedIntent: "create_inventory",
        operatingMode: "inventory_management",
      },
    };
    const plan = planTurnFallback({
      message: "מה הכי חשוב בפרטי מודעה?",
      conversation,
      inventoryMode: true,
    });
    const turn = turnPlanToEvent(plan);
    const result = await handleInventoryIngestTurn({
      dealerId: "d1",
      userId: "u1",
      message: "מה הכי חשוב בפרטי מודעה?",
      conversation,
      meta: {
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
      },
      turn,
    });
    expect(result).not.toBeNull();
    expect(result!.message).toMatch(/דגם|שנה|ק״מ|מחיר/);
    expect(result!.message).not.toMatch(/^חסר לי/);
    expect(result!.conversation?.pendingInventoryDraft?.fields.make).toBe(
      "Toyota"
    );
    expect(result!.inventoryMutationResult).toBeUndefined();
  });
});

describe("Confirm requires pending mutation", () => {
  it("CONFIRM without pending → REQUIRE_CLARIFICATION", () => {
    const plan = planTurnFallback({ message: "כן" });
    // Force confirm kind
    plan.action.kind = "CONFIRM_PENDING_MUTATION";
    const policy = validateTurnPlan({ message: "כן", plan, conversation: {} });
    expect(policy.decision).toBe("REQUIRE_CLARIFICATION");
  });
});

function stubPlan(
  overrides: Partial<{
    kind: AgentTurnPlan["action"]["kind"];
    capability: string | null;
    toolGoal: AgentTurnPlan["action"]["toolGoal"];
    facts: AgentTurnPlan["facts"];
    keepCurrentTask: boolean;
  }>
): AgentTurnPlan {
  return {
    understanding: {
      userGoal: "cancel all active searches",
      messageMeaning: "תבטל כרגע את כל החיפושים שלי",
      refersToCurrentTask: false,
      refersToActiveObject: false,
      targetReference: "all active searches",
    },
    responseNeed: { shouldAnswerNow: true, answerGoal: "confirm_close" },
    conversation: {
      keepCurrentTask: overrides.keepCurrentTask ?? false,
      suspendCurrentTask: true,
      resumeTaskReference: null,
      correctedUnderstanding: null,
    },
    facts: overrides.facts ?? { add: [], correct: [], reject: [] },
    action: {
      kind: overrides.kind ?? "PROPOSE_MUTATION",
      capability: overrides.capability ?? "searches",
      toolGoal: overrides.toolGoal ?? "get_my_searches",
      targetReference: "all active searches",
    },
    clarification: { needed: false, reason: null, suggestedQuestion: null },
    telemetryHint: { relation: "NEW_REQUEST", questionAbout: null },
    confidence: 0.8,
    source: "ai",
  };
}

describe("Capability routing — inventory is not the default sink", () => {
  it("inventoryMode fallback does not invent PROPOSE_MUTATION inventory", () => {
    const plan = planTurnFallback({
      message: "תבטל כרגע את כל החיפושים שלי",
      inventoryMode: true,
    });
    expect(plan.action.capability).not.toBe("inventory");
    expect(plan.action.kind).not.toBe("PROPOSE_MUTATION");
  });

  it("PROPOSE_MUTATION inventory without vehicle facts does not own the turn", () => {
    const plan = stubPlan({ capability: "inventory", toolGoal: null });
    expect(
      inventoryOwnsTurn({
        plan,
        conversation: {
          sessionContext: { operatingMode: "inventory_management" },
        },
      })
    ).toBe(false);
  });

  it("production transcript: 4 searches + inventory workspace → demand closure, not inventory", () => {
    const plan = stubPlan({
      capability: "inventory",
      toolGoal: null,
    });
    const conversation: ConversationState = {
      sessionContext: { operatingMode: "inventory_management" },
      lastAuthorizedSnapshot: {
        activeDemandCount: 4,
        activeDemandIds: ["d1", "d2", "d3", "d4"],
        activeDemandTitles: ["Mazda CX-5", "A", "B", "C"],
      },
      lastList: [
        { id: "d1", title: "Mazda CX-5", type: "demand" },
        { id: "d2", title: "A", type: "demand" },
        { id: "d3", title: "B", type: "demand" },
        { id: "d4", title: "C", type: "demand" },
      ],
    };
    expect(inventoryOwnsTurn({ plan, conversation })).toBe(false);
    expect(shouldProposeDemandClosure({ plan, conversation })).toBe(true);
    expect(turnPlanToEvent(plan).intent).not.toBe("create_inventory");
  });

  it("capability searches always proposes demand closure", () => {
    const plan = stubPlan({ capability: "searches" });
    expect(shouldProposeDemandClosure({ plan, conversation: {} })).toBe(true);
    expect(inventoryOwnsTurn({ plan, conversation: {} })).toBe(false);
  });
});

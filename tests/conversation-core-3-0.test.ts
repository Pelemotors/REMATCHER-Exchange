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
import { validateTurnPlan, toolGoalToReadTools } from "@/services/assistant/turn-policy";
import { checkPrivacyGate } from "@/services/assistant/privacy-gate";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";
import { handleInventoryIngestTurn } from "@/services/assistant/inventory-ingest";
import type { PendingInventoryDraft } from "@/services/assistant/inventory-draft";
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

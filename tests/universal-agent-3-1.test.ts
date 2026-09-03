/**
 * Universal Agent 3.1 — one conversational brain, capability/operation/scope.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("server-only", () => ({}));
vi.mock("@/services/ai/client", () => ({
  callOpenAIStructured: vi.fn(),
  isOpenAIConfigured: () => false,
  logAiOperation: vi.fn(),
}));

import { TURN_PLAN_SCHEMA } from "@/services/assistant/turn-plan-schema";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";
import {
  normalizeCapability,
  normalizeOperation,
  normalizeScope,
} from "@/services/assistant/capability-model";
import { shouldProposeDemandClosure } from "@/services/assistant/turn-policy";
import { toolGoalToReadTools } from "@/services/assistant/turn-policy";
import { productHelpAnswer } from "@/services/assistant/help-responses";
import type { AgentTurnPlan } from "@/services/assistant/agent-turn-plan";

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

function plan(partial: Partial<AgentTurnPlan["action"]>): AgentTurnPlan {
  return {
    understanding: {
      userGoal: "test",
      messageMeaning: "test",
      refersToCurrentTask: false,
      refersToActiveObject: false,
      targetReference: null,
    },
    responseNeed: { shouldAnswerNow: false, answerGoal: null },
    conversation: {
      keepCurrentTask: false,
      suspendCurrentTask: false,
      resumeTaskReference: null,
      correctedUnderstanding: null,
      queuedFollowUp: null,
    },
    facts: { add: [], correct: [], reject: [] },
    action: {
      kind: "PROPOSE_MUTATION",
      capability: "SEARCHES",
      operation: "CLOSE",
      scope: "ALL_AUTHORIZED",
      toolGoal: null,
      targetReference: null,
      ...partial,
    },
    clarification: { needed: false, reason: null, suggestedQuestion: null },
    telemetryHint: { relation: "NEW_REQUEST", questionAbout: null },
    confidence: 0.8,
    source: "ai",
  };
}

describe("Universal Agent 3.1", () => {
  it("same Agent, version 3.1", () => {
    expect(AGENT_VERSION).toBe("3.1");
  });

  it("TURN_PLAN_SCHEMA remains recursively strict and includes operation/scope", () => {
    const violations = validateStrictSchema(
      TURN_PLAN_SCHEMA as unknown as JsonSchemaNode,
      "root"
    );
    expect(violations).toEqual([]);
    expect(TURN_PLAN_SCHEMA.properties.action.required).toEqual(
      expect.arrayContaining(["operation", "scope", "capability"])
    );
  });

  it("production orchestrator does not call planAgentTurn", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/assistant/v2-orchestrator.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/planAgentTurn/);
    expect(src).toMatch(/routeTurnPlan/);
    expect(src).toMatch(/legacyPlannerUsed: false/);
  });

  it("CREATE search is not treated as CLOSE", () => {
    expect(
      shouldProposeDemandClosure({
        plan: plan({ operation: "CREATE", scope: "ONE" }),
      })
    ).toBe(false);
    expect(
      shouldProposeDemandClosure({
        plan: plan({ operation: "CLOSE", scope: "ALL_AUTHORIZED" }),
      })
    ).toBe(true);
  });

  it("maps new tool goals", () => {
    expect(toolGoalToReadTools("get_my_reveals")).toEqual(["getMyReveals"]);
    expect(toolGoalToReadTools("get_my_outcomes")).toEqual([
      "getMyPendingOutcomes",
    ]);
    expect(toolGoalToReadTools("get_my_commercial")).toEqual([
      "getMyCommercialStatus",
    ]);
  });

  it("normalizes capability aliases", () => {
    expect(normalizeCapability("searches")).toBe("SEARCHES");
    expect(normalizeOperation("cancel")).toBe("CLOSE");
    expect(normalizeScope("all")).toBe("ALL_AUTHORIZED");
  });

  it("help answers workflow format without mutation copy", () => {
    const msg = productHelpAnswer("INPUT_FORMAT", "תן לי פורמט לכמה רכבים");
    expect(msg).toMatch(/שורה לכל רכב/);
    expect(msg).not.toMatch(/חסר לי היצרן/);
  });

  it("dead interpretAgentTurn is not exported from interpreter", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/assistant/turn-interpreter.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/export async function interpretAgentTurn/);
  });
});

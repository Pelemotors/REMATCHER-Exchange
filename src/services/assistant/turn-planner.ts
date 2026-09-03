import "server-only";
import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import {
  callOpenAIStructured,
  isOpenAIConfigured,
  logAiOperation,
} from "@/services/ai/client";
import type { ConversationState } from "@/services/assistant/conversation-state";
import {
  isConfirmation,
  isRejection,
} from "@/services/assistant/conversation-state";
import type { AgentTurnPlan, FactChange } from "@/services/assistant/agent-turn-plan";
import { TURN_PLAN_SCHEMA } from "@/services/assistant/turn-plan-schema";
import { interpretTurnFallback } from "@/services/assistant/turn-interpreter";
import type { StructuredTurnEvent } from "@/services/assistant/turn-event";
import { isWorkflowHelpRequest } from "@/services/assistant/privacy-gate";
import { isSkipAnswer } from "@/services/assistant/inventory-draft";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";

/**
 * Map Turn Plan → StructuredTurnEvent for capability handlers still using 2.7 bridge.
 * Enums are telemetry — not speech universe.
 */
export function turnPlanToEvent(plan: AgentTurnPlan): StructuredTurnEvent {
  const facts: Record<string, unknown> = {};
  for (const f of [...plan.facts.add, ...plan.facts.correct]) {
    facts[f.field] = f.value;
  }
  const extractedFacts = Object.keys(facts).length
    ? (facts as StructuredTurnEvent["extractedFacts"])
    : undefined;

  return {
    relation: plan.telemetryHint.relation,
    intent:
      plan.action.kind === "CONFIRM_PENDING_MUTATION"
        ? "continue_current"
        : plan.action.toolGoal === "get_my_matches"
          ? "read_matches"
          : plan.action.toolGoal === "get_my_searches" ||
              plan.action.toolGoal === "get_my_state"
            ? "read_state"
            : plan.action.kind === "PROPOSE_MUTATION" &&
                plan.action.capability === "inventory"
              ? plan.facts.add.some((f) => f.field === "status")
                ? "mark_sold"
                : "create_inventory"
              : plan.telemetryHint.relation === "ADVISORY_QUESTION" ||
                  plan.action.kind === "ANSWER_ONLY"
                ? "help"
                : plan.action.capability === "inventory"
                  ? "create_inventory"
                  : "continue_current",
    targetCapability:
      (plan.action.capability as StructuredTurnEvent["targetCapability"]) ??
      "unknown",
    questionAbout: plan.telemetryHint.questionAbout,
    extractedFacts,
    correctedFacts:
      plan.facts.correct.length > 0
        ? (Object.fromEntries(
            plan.facts.correct.map((f) => [f.field, f.value])
          ) as StructuredTurnEvent["correctedFacts"])
        : undefined,
    rejectedInterpretations: plan.facts.reject
      .map((r) => r.value)
      .filter((v): v is string => typeof v === "string"),
    confirms: plan.action.kind === "CONFIRM_PENDING_MUTATION",
    cancels: plan.action.kind === "CANCEL_PENDING_MUTATION",
    skipRequested: plan.telemetryHint.relation === "SKIP",
    resumeRequested: plan.action.kind === "RESUME",
    needsClarification: plan.clarification.needed,
    clarificationReason: plan.clarification.reason ?? undefined,
    preferredWording: plan.conversation.correctedUnderstanding,
    confidence: {
      overall:
        plan.confidence >= 0.8
          ? "high"
          : plan.confidence >= 0.5
            ? "medium"
            : "low",
    },
    source: plan.source,
  };
}

function factsFromEvent(event: StructuredTurnEvent): {
  add: FactChange[];
  correct: FactChange[];
} {
  const add: FactChange[] = [];
  const correct: FactChange[] = [];
  const src =
    event.correctedFacts && Object.keys(event.correctedFacts).length
      ? event.correctedFacts
      : event.extractedFacts;
  if (!src) return { add, correct };
  const target = event.relation === "CORRECTION" ? correct : add;
  for (const [field, value] of Object.entries(src)) {
    if (value == null || field === "exclusions" || field === "notes") continue;
    if (typeof value === "string" || typeof value === "number") {
      target.push({ field, value, confidence: "medium" });
    }
  }
  return { add, correct };
}

/** Deterministic fallback planner — modest, not full NLP. */
export function planTurnFallback(params: {
  message: string;
  conversation?: ConversationState;
  inventoryMode?: boolean;
}): AgentTurnPlan {
  const event = interpretTurnFallback(params);
  const { add, correct } = factsFromEvent(event);

  let kind: AgentTurnPlan["action"]["kind"] = "NONE";
  let toolGoal: AgentTurnPlan["action"]["toolGoal"] = null;
  let capability: string | null = event.targetCapability;

  if (event.relation === "CONFIRMATION") kind = "CONFIRM_PENDING_MUTATION";
  else if (event.relation === "CANCEL") kind = "CANCEL_PENDING_MUTATION";
  else if (event.relation === "RESUME") kind = "RESUME";
  else if (event.relation === "TOPIC_SWITCH") {
    kind = "SUSPEND_AND_READ";
    toolGoal =
      event.intent === "read_matches" ? "get_my_matches" : "get_my_state";
  } else if (
    event.relation === "ADVISORY_QUESTION" ||
    event.relation === "CONTEXT_QUESTION" ||
    isWorkflowHelpRequest(params.message)
  ) {
    kind = "ANSWER_ONLY";
    capability = "inventory";
  } else if (event.relation === "UNKNOWN" && event.needsClarification) {
    kind = "CLARIFY";
  } else if (add.length || correct.length) {
    kind = "PROPOSE_MUTATION";
    capability = "inventory";
  } else if (params.inventoryMode && !event.needsClarification) {
    kind = "PROPOSE_MUTATION";
    capability = "inventory";
  }

  return {
    understanding: {
      userGoal: event.intent,
      messageMeaning: params.message.slice(0, 200),
      refersToCurrentTask: Boolean(
        params.conversation?.pendingInventoryDraft ||
          params.conversation?.pendingInventoryMutation
      ),
      refersToActiveObject: Boolean(params.conversation?.focusedObject),
      targetReference: event.targetObject?.referenceText ?? null,
    },
    responseNeed: {
      shouldAnswerNow:
        kind === "ANSWER_ONLY" ||
        kind === "CLARIFY" ||
        event.relation === "CONTEXT_QUESTION",
      answerGoal:
        event.questionAbout ??
        (kind === "CLARIFY" ? "clarify_intent" : null),
    },
    conversation: {
      keepCurrentTask:
        kind !== "SUSPEND_AND_READ" && kind !== "CANCEL_PENDING_MUTATION",
      suspendCurrentTask: kind === "SUSPEND_AND_READ",
      resumeTaskReference: kind === "RESUME" ? "inventory_draft" : null,
      correctedUnderstanding: event.preferredWording ?? null,
    },
    facts: {
      add,
      correct,
      reject: (event.rejectedInterpretations ?? []).map((value) => ({
        field: null,
        value,
        reason: "rejected_interpretation",
      })),
    },
    action: {
      kind,
      capability,
      toolGoal,
      targetReference: event.targetObject?.referenceText ?? null,
    },
    clarification: {
      needed: Boolean(event.needsClarification) || kind === "CLARIFY",
      reason: event.clarificationReason ?? null,
      suggestedQuestion:
        kind === "CLARIFY"
          ? "לא בטוח שהבנתי — אפשר לנסח שוב בקצרה?"
          : null,
    },
    telemetryHint: {
      relation: event.relation,
      questionAbout: event.questionAbout ?? null,
    },
    confidence:
      event.confidence?.overall === "high"
        ? 0.9
        : event.confidence?.overall === "medium"
          ? 0.65
          : 0.35,
    source: event.source === "deterministic" ? "deterministic" : "fallback",
  };
}

/**
 * Conversation Brain — one primary structured AI call per meaningful free-text turn.
 * Proposes WHAT SHOULD HAPPEN. Policy + domain services own authority.
 */
export async function planConversationTurn(params: {
  message: string;
  userId?: string;
  conversation?: ConversationState;
  inventoryMode?: boolean;
}): Promise<AgentTurnPlan> {
  const fallback = planTurnFallback(params);
  const m = params.message.trim();

  // Unambiguous machine CTAs — skip AI
  if (
    (isConfirmation(m) || isRejection(m) || isSkipAnswer(m)) &&
    fallback.source === "deterministic"
  ) {
    await logAiOperation({
      operation: "turn_plan",
      promptVersion: AI_PROMPT_VERSIONS.turnPlanner,
      success: true,
      userId: params.userId,
      usageJson: {
        source: "deterministic",
        kind: fallback.action.kind,
        agentVersion: AGENT_VERSION,
      },
    });
    return fallback;
  }

  if (!isOpenAIConfigured()) {
    await logAiOperation({
      operation: "turn_plan",
      promptVersion: AI_PROMPT_VERSIONS.turnPlanner,
      success: true,
      userId: params.userId,
      usageJson: {
        source: "fallback",
        kind: fallback.action.kind,
        agentVersion: AGENT_VERSION,
      },
    });
    return { ...fallback, source: "fallback" };
  }

  try {
    const draft = params.conversation?.pendingInventoryDraft;
    const mutation = params.conversation?.pendingInventoryMutation;
    const ctx = {
      message: params.message,
      inventoryMode: Boolean(params.inventoryMode),
      lastAgentQuestion: params.conversation?.lastAgentQuestion ?? null,
      pendingDraft: draft
        ? { status: draft.status, fields: draft.fields }
        : null,
      pendingMutation: mutation
        ? { type: mutation.type, status: mutation.status, label: mutation.label }
        : null,
      suspended: params.conversation?.suspendedContext
        ? { kind: params.conversation.suspendedContext.kind }
        : null,
      heuristicHint: {
        kind: fallback.action.kind,
        relation: fallback.telemetryHint.relation,
        facts: fallback.facts,
      },
    };

    const { data } = await callOpenAIStructured<Omit<AgentTurnPlan, "source">>({
      operation: "turn_plan",
      promptVersion: AI_PROMPT_VERSIONS.turnPlanner,
      model: AI_MODELS.turnPlanner,
      systemPrompt: `You are the Conversation Brain for the REMATCHER Exchange Agent (v3).

YOUR ROLE:
- Understand free Hebrew dealer speech freely (GPT-like conversation).
- Propose WHAT SHOULD HAPPEN NEXT as a structured turn plan.
- You do NOT invent matches, network inventory, or other dealers' data.
- You do NOT authorize mutations — you only propose.

RULES:
1. CURRENT MESSAGE > PENDING WORKFLOW. Pending draft is context, not a prison.
2. If the dealer asks a question (advice, template, what's missing, why), set action.kind=ANSWER_ONLY and responseNeed.shouldAnswerNow=true. Keep the draft.
3. Workflow help / input template ("טמפלייט", "כמה רכבים ביחד") → ANSWER_ONLY, telemetryHint.questionAbout=INPUT_FORMAT. Never treat as network fishing.
4. Topic switch to matches/searches while draft open → SUSPEND_AND_READ + toolGoal.
5. Corrections → facts.correct + keepCurrentTask.
6. Explicit confirm of pending save → CONFIRM_PENDING_MUTATION.
7. Explicit cancel → CANCEL_PENDING_MUTATION.
8. Mixed turns: capture ALL facts AND set answer/read needs.
9. UNKNOWN / unclear → CLARIFY — never force next inventory gap.
10. Matching questions: propose READ get_my_matches — never invent match counts.
11. Never invent year/mileage/price/model.

Return JSON matching the schema exactly. All required fields present (null for optional).`,
      userContent: JSON.stringify(ctx),
      schemaName: "agent_turn_plan",
      schema: TURN_PLAN_SCHEMA as unknown as Record<string, unknown>,
      userId: params.userId,
    });

    return { ...data, source: "ai" };
  } catch (err: unknown) {
    const errMsg =
      err instanceof Error ? err.message : typeof err === "string" ? err : "unknown";
    const errClass = errMsg.includes("400")
      ? "schema_400"
      : errMsg.includes("401") || errMsg.includes("403")
        ? "auth_error"
        : errMsg.includes("429")
          ? "rate_limit"
          : errMsg.includes("timeout") || errMsg.includes("ETIMEDOUT")
            ? "timeout"
            : "other";

    await logAiOperation({
      operation: "turn_plan",
      promptVersion: AI_PROMPT_VERSIONS.turnPlanner,
      success: false,
      userId: params.userId,
      errorMessage: errMsg.slice(0, 300),
      usageJson: {
        fallback: true,
        errClass,
        agentVersion: AGENT_VERSION,
        kind: fallback.action.kind,
      },
    });
    return { ...fallback, source: "fallback" };
  }
}

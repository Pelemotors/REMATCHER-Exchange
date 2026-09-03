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
                plan.action.capability === "inventory" &&
                (plan.facts.add.length > 0 || plan.facts.correct.length > 0)
              ? plan.facts.add.some((f) => f.field === "status")
                ? "mark_sold"
                : "create_inventory"
              : plan.telemetryHint.relation === "ADVISORY_QUESTION" ||
                  plan.action.kind === "ANSWER_ONLY"
                ? "help"
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
  const capMap: Record<string, string> = {
    inventory: "INVENTORY",
    matches: "MATCHES",
    searches: "SEARCHES",
    demand: "SEARCHES",
    broker: "GENERAL",
    unknown: "GENERAL",
  };
  let capability: string | null =
    event.targetCapability && event.targetCapability !== "unknown"
      ? capMap[event.targetCapability] ?? event.targetCapability.toUpperCase()
      : null;

  if (event.relation === "CONFIRMATION") kind = "CONFIRM_PENDING_MUTATION";
  else if (event.relation === "CANCEL") kind = "CANCEL_PENDING_MUTATION";
  else if (event.relation === "RESUME") kind = "RESUME";
  else if (event.relation === "TOPIC_SWITCH") {
    kind = "SUSPEND_AND_READ";
    toolGoal =
      event.intent === "read_matches" ? "get_my_matches" : "get_my_state";
    capability = event.intent === "read_matches" ? "MATCHES" : capability;
  } else if (
    event.relation === "ADVISORY_QUESTION" ||
    event.relation === "CONTEXT_QUESTION" ||
    isWorkflowHelpRequest(params.message)
  ) {
    const about = event.questionAbout;
    const productHowTo =
      about === "INPUT_FORMAT" ||
      about === "LISTING_GUIDANCE" ||
      about === "MATCHING_TIPS" ||
      about === "WHY_NEEDED" ||
      about === "REQUIREMENT" ||
      isWorkflowHelpRequest(params.message);
    if (event.relation === "CONTEXT_QUESTION" || productHowTo) {
      kind = "ANSWER_ONLY";
      capability = "HELP";
    } else {
      kind = "READ";
      capability = "GENERAL";
      toolGoal = "get_dealer_attention";
    }
  } else if (event.intent === "read_matches") {
    kind = "READ";
    capability = "MATCHES";
    toolGoal = "get_my_matches";
  } else if (event.intent === "read_state") {
    kind = "READ";
    capability = "GENERAL";
    toolGoal = "get_my_state";
  } else if (event.relation === "UNKNOWN" && event.needsClarification) {
    kind = "CLARIFY";
    capability = null;
  } else if (add.length || correct.length) {
    kind = "PROPOSE_MUTATION";
    capability = params.inventoryMode ? "INVENTORY" : "INVENTORY";
  } else if (event.needsClarification) {
    kind = "CLARIFY";
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
      queuedFollowUp: null,
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
      operation:
        kind === "READ" || kind === "SUSPEND_AND_READ"
          ? "READ"
          : kind === "ANSWER_ONLY"
            ? "HELP"
            : add.length || correct.length
              ? "CREATE"
              : null,
      scope: null,
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
      lastList: (params.conversation?.lastList ?? []).slice(0, 8).map((item) => ({
        type: item.type,
        title: item.title,
      })),
      lastAuthorizedSnapshot: params.conversation?.lastAuthorizedSnapshot ?? null,
      pendingConfirmation: params.conversation?.pendingConfirmation
        ? {
            action: params.conversation.pendingConfirmation.action,
            label: params.conversation.pendingConfirmation.label,
            capability: params.conversation.pendingConfirmation.payload.capability ?? null,
            operation: params.conversation.pendingConfirmation.payload.operation ?? null,
            scope: params.conversation.pendingConfirmation.payload.scope ?? null,
            targetCount: params.conversation.pendingConfirmation.payload.targetCount ??
              (Array.isArray(params.conversation.pendingConfirmation.payload.demandIds)
                ? (params.conversation.pendingConfirmation.payload.demandIds as string[]).length
                : null),
            targetSummary: params.conversation.pendingConfirmation.payload.targetSummary ?? null,
          }
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
      systemPrompt: `You are the Conversation Brain for the REMATCHER Exchange Agent (v3.1).

YOUR ROLE:
- Understand free Hebrew dealer speech freely (GPT-like conversation).
- Propose WHAT SHOULD HAPPEN NEXT as a structured turn plan.
- You do NOT invent matches, network inventory, or other dealers' data.
- You do NOT authorize mutations — you only propose.

RULES:
1. CURRENT MESSAGE > PENDING WORKFLOW. Pending draft is context, not a prison.
2. HELP is product how-to (how Exchange works, templates, why a field exists). HELP never reads dealer state.
3. JUDGMENT is different: "ממה כדאי להתחיל?", "מה הכי דחוף?", "בהינתן הנתונים שלי...", "מה כדאי לעשות עכשיו?", "יש משהו שאני מפספס?" → capability=GENERAL, kind=READ, operation=READ, toolGoal=get_dealer_attention. NEVER HELP. NEVER ANSWER_ONLY. NEVER a capability menu.
4. Workflow help / input template → ANSWER_ONLY, questionAbout=INPUT_FORMAT.
5. Topic switch to matches/searches while draft open → SUSPEND_AND_READ + toolGoal.
6. Corrections → facts.correct + keepCurrentTask.
7. If pendingConfirmation exists and the user affirms THAT pending action (including natural phrasing that confirms it), set kind=CONFIRM_PENDING_MUTATION. Do NOT emit another PROPOSE_MUTATION for the same close/update.
8. If pendingConfirmation exists and the user rejects it, set CANCEL_PENDING_MUTATION.
9. If the user changes scope of a pending mutation (only some of the targets), set PROPOSE_MUTATION with the NEW scope (ONE/MANY/REFERENCED_SET). Do NOT CONFIRM the original ALL_AUTHORIZED set.
10. If pendingConfirmation exists and the user asks a different question, READ that question and keepCurrentTask=true (do not confirm or cancel).
11. Mixed turns: capture ALL facts AND set answer/read needs.
12. UNKNOWN / unclear → CLARIFY — never force next inventory gap.
13. Matching questions: propose READ get_my_matches — never invent match counts.
14. Never invent year/mileage/price/model.
15. Inventory page / inventoryMode is only a HINT. It does NOT mean this message is a vehicle.
16. capability MUST be one of: GENERAL, INVENTORY, SEARCHES, MATCHES, OPPORTUNITIES, REVEALS, OUTCOMES, ACTIVITY, VALIDATIONS, COMMERCIAL, HELP.
17. For mutations set action.operation explicitly: CREATE, UPDATE, CLOSE, RENEW, MARK_SOLD.
18. "תפתח חיפוש" → SEARCHES, PROPOSE_MUTATION, CREATE.
19. "תבטל את כל החיפושים" → SEARCHES, PROPOSE_MUTATION, CLOSE, ALL_AUTHORIZED — unless a matching pendingConfirmation already exists, then CONFIRM_PENDING_MUTATION.
20. Reads: use matching toolGoal including get_dealer_attention, get_my_reveals, get_my_outcomes.
21. Mixed clauses: conversation.queuedFollowUp.
22. Do not invent IDs. targetReference is human language only.
23. HELP questions never start inventory or search drafts.

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

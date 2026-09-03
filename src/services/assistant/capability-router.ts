import "server-only";
import type { AgentTurnPlan } from "@/services/assistant/agent-turn-plan";
import type { ConversationState, AssistantCard } from "@/services/assistant/conversation-state";
import type { AssistantResponse } from "@/services/assistant/orchestrator";
import type { AgentMeta } from "@/services/assistant/tools/registry";
import type { ReadToolName } from "@/services/assistant/tools/registry";
import {
  normalizeCapability,
  normalizeOperation,
  normalizeScope,
  type AgentCapability,
} from "@/services/assistant/capability-model";
import { toolGoalToReadTools, inventoryOwnsTurn, isJudgmentPlan, isProductHelpPlan, pendingSearchCloseMatchesPlan, isSearchCloseAmendment } from "@/services/assistant/turn-policy";
import { productHelpAnswer } from "@/services/assistant/help-responses";
import {
  executeSearchMutation,
  handleSearchCapability,
} from "@/services/assistant/search-capability";
import { handleInventoryIngestTurn } from "@/services/assistant/inventory-ingest";
import { handleInventoryManageTurn } from "@/services/assistant/inventory-manage";
import { executeToolsParallel } from "@/services/assistant/tools/read-tools";
import { synthesizeResponse } from "@/services/assistant/synthesizer";
import {
  resumeSuspendedInventory,
  suspendInventoryDraft,
} from "@/services/assistant/turn-reconcile";
import { turnPlanToEvent } from "@/services/assistant/turn-planner";
import {
  executeConfirmValidation,
  markMyVehicleSold,
} from "@/services/assistant/tools/action-tools";
import {
  assertDemandOwned,
  assertRevealOwned,
  assertVehicleOwned,
} from "@/services/assistant/target-resolution";

type TurnResponse = AssistantResponse & {
  conversation?: ConversationState;
  meta?: AgentMeta;
  cards?: AssistantCard[];
};

function defaultToolGoal(cap: AgentCapability | null): AgentTurnPlan["action"]["toolGoal"] {
  switch (cap) {
    case "MATCHES":
      return "get_my_matches";
    case "SEARCHES":
      return "get_my_searches";
    case "OPPORTUNITIES":
      return "get_my_opportunities";
    case "REVEALS":
      return "get_my_reveals";
    case "OUTCOMES":
      return "get_my_outcomes";
    case "ACTIVITY":
    case "GENERAL":
      return "get_dealer_attention";
    case "VALIDATIONS":
      return "get_my_validations";
    case "COMMERCIAL":
      return "get_my_commercial";
    case "INVENTORY":
      return "get_my_inventory_attention";
    default:
      return "get_my_state";
  }
}

async function runRead(params: {
  dealerId: string;
  userId: string;
  message: string;
  plan: AgentTurnPlan;
  conversation?: ConversationState;
  meta: AgentMeta;
}): Promise<TurnResponse> {
  const cap = normalizeCapability(params.plan.action.capability);
  const mapped = toolGoalToReadTools(params.plan.action.toolGoal);
  const tools: ReadToolName[] = unique(
    mapped.length ? mapped : toolGoalToReadTools(defaultToolGoal(cap))
  );
  params.meta.tools = [...params.meta.tools, ...tools];
  params.meta.executor =
    params.plan.action.toolGoal === "get_dealer_attention"
      ? "dealer_attention"
      : "read_tools";
  const { results, durations, errors } = await executeToolsParallel(
    tools,
    params.dealerId
  );
  params.meta.toolDurations = durations;

  const ref =
    params.plan.action.targetReference ??
    params.plan.understanding.targetReference;
  if (Array.isArray(results.getMyAuthorizedMatches) && ref) {
    const needle = ref.toLowerCase();
    const filtered = (
      results.getMyAuthorizedMatches as Array<{
        demandTitle?: string;
        vehicle?: { make?: string; model?: string };
      }>
    ).filter((m) => {
      const hay = `${m.demandTitle ?? ""} ${m.vehicle?.make ?? ""} ${m.vehicle?.model ?? ""}`.toLowerCase();
      return hay.includes(needle) || needle.includes((m.vehicle?.model ?? "").toLowerCase());
    });
    results.getMyAuthorizedMatches = filtered;
  }

  const synth = await synthesizeResponse({
    userMessage: params.message,
    toolResults: results,
    toolErrors: errors,
    userId: params.userId,
    goal:
      params.plan.action.toolGoal === "get_dealer_attention"
        ? "dealer_next_best_action"
        : params.plan.understanding.userGoal,
    sessionContext: params.conversation?.sessionContext,
  });
  params.meta.synthesizerUsed = synth.synthesizerUsed;
  params.meta.synthesisDurationMs = synth.durationMs;
  if (synth.model) params.meta.model = synth.model;
  params.meta.responseType = "state_answer";

  const demands = (results.getMyActiveDemands ?? []) as Array<{
    id: string;
    title: string;
  }>;
  return {
    intent: "PENDING_ACTIONS",
    message: synth.response.message,
    suggestions: synth.response.suggestions,
    cards: synth.response.cards,
    conversation: {
      lastList: synth.response.lastList,
      lastAuthorizedSnapshot: {
        ...params.conversation?.lastAuthorizedSnapshot,
        activeDemandCount: demands.length || synth.response.lastList.filter((i) => i.type === "demand").length,
        activeDemandIds: demands.length
          ? demands.map((d) => d.id)
          : synth.response.lastList.filter((i) => i.type === "demand").map((i) => i.id),
        activeDemandTitles: demands.length
          ? demands.map((d) => d.title)
          : synth.response.lastList.filter((i) => i.type === "demand").map((i) => i.title),
        matchCount: Array.isArray(results.getMyAuthorizedMatches)
          ? (results.getMyAuthorizedMatches as unknown[]).length
          : params.conversation?.lastAuthorizedSnapshot?.matchCount,
      },
      pendingInventoryDraft: params.conversation?.pendingInventoryDraft,
      pendingSearchDraft: params.conversation?.pendingSearchDraft,
      pendingConfirmation: params.conversation?.pendingConfirmation,
      sessionContext: params.conversation?.sessionContext,
      suspendedContext: params.conversation?.suspendedContext,
      queuedFollowUp: params.plan.conversation.queuedFollowUp ?? undefined,
    },
    meta: params.meta,
  };
}

function unique(tools: ReadToolName[]): ReadToolName[] {
  return [...new Set(tools)];
}

export async function routeTurnPlan(params: {
  dealerId: string;
  userId: string;
  message: string;
  plan: AgentTurnPlan;
  conversation?: ConversationState;
  contextRoute?: string;
  entityType?: string;
  entityId?: string;
  meta: AgentMeta;
}): Promise<TurnResponse> {
  const { plan, meta } = params;
  let conversation = params.conversation;
  const cap = normalizeCapability(plan.action.capability);
  const op = normalizeOperation(plan.action.operation);
  const scope = normalizeScope(plan.action.scope);
  meta.capability = cap;
  meta.operation = op;
  meta.scope = scope;
  meta.legacyPlannerUsed = false;

  const turn = turnPlanToEvent(plan);

  if (plan.action.kind === "RESUME") {
    conversation = resumeSuspendedInventory(conversation ?? {});
    meta.executor = "resume";
  }

  if (
    conversation?.pendingInventoryDraft &&
    turn.relation === "CONTEXT_QUESTION"
  ) {
    const inventoryTurn = await handleInventoryIngestTurn({
      dealerId: params.dealerId,
      userId: params.userId,
      message: params.message,
      conversation,
      meta,
      turn,
      forceStart: false,
    });
    if (inventoryTurn) {
      meta.executor = "inventory_ingest_context";
      return inventoryTurn;
    }
  }

  if (isJudgmentPlan(plan)) {
    return runRead({
      dealerId: params.dealerId,
      userId: params.userId,
      message: params.message,
      plan: {
        ...plan,
        action: {
          ...plan.action,
          kind: plan.action.kind === "ANSWER_ONLY" ? "READ" : plan.action.kind,
          capability: "GENERAL",
          operation: "READ",
          toolGoal: "get_dealer_attention",
        },
      },
      conversation,
      meta,
    });
  }

  if (isProductHelpPlan(plan) || plan.action.kind === "ANSWER_ONLY") {
    meta.executor = "help";
    meta.responseType = "help";
    return {
      intent: "UNKNOWN",
      message: productHelpAnswer(plan.responseNeed.answerGoal, params.message),
      conversation: {
        ...conversation,
        pendingInventoryDraft: conversation?.pendingInventoryDraft,
        pendingSearchDraft: conversation?.pendingSearchDraft,
        pendingConfirmation: conversation?.pendingConfirmation,
      },
      meta,
    };
  }

  if (plan.action.kind === "CLARIFY") {
    meta.executor = "clarify";
    meta.responseType = "clarify";
    return {
      intent: "UNKNOWN",
      message:
        plan.clarification.suggestedQuestion ??
        "לא בטוח שהבנתי — אפשר לנסח שוב בקצרה?",
      conversation,
      meta,
    };
  }

  if (plan.action.kind === "CANCEL_PENDING_MUTATION") {
    meta.executor = "cancel_pending";
    meta.responseType = "cancelled";
    return {
      intent: "UNKNOWN",
      message: "בוטל. לא בוצעה פעולה.",
      conversation: {
        lastList: conversation?.lastList,
        pendingInventoryDraft: conversation?.pendingInventoryDraft,
        pendingSearchDraft: conversation?.pendingSearchDraft,
        sessionContext: conversation?.sessionContext,
        suspendedContext: conversation?.suspendedContext,
      },
      meta,
    };
  }

  if (
    plan.action.kind === "CONFIRM_PENDING_MUTATION" &&
    conversation?.pendingConfirmation
  ) {
    const pending = conversation.pendingConfirmation;
    const searchDone = await executeSearchMutation({
      dealerId: params.dealerId,
      pending,
      conversation,
      meta,
    });
    if (searchDone) {
      meta.executor = "search_mutation";
      return searchDone;
    }
    if (pending.action === "create_inventory") {
      meta.executor = "inventory_ingest";
      const inventoryTurn = await handleInventoryIngestTurn({
        dealerId: params.dealerId,
        userId: params.userId,
        message: params.message,
        conversation,
        meta,
        turn,
      });
      if (inventoryTurn) return inventoryTurn;
    }
    if (pending.action === "confirm_validation") {
      const validationId = pending.payload.validationId as string;
      await executeConfirmValidation(params.dealerId, validationId, true);
      meta.executor = "validation";
      meta.responseType = "mutation_validation";
      return {
        intent: "VALIDATION",
        message: "אישרת זמינות. Exchange ממשיך לבדוק התאמות.",
        meta,
      };
    }
    if (pending.action === "mark_sold") {
      const vehicleId = pending.payload.vehicleId as string;
      if (!(await assertVehicleOwned(params.dealerId, vehicleId))) {
        return { intent: "UPDATE_INVENTORY", message: "אין הרשאה לרכב הזה.", meta };
      }
      await markMyVehicleSold(params.dealerId, vehicleId);
      meta.executor = "mark_sold";
      return {
        intent: "UPDATE_INVENTORY",
        message: "הרכב הוסר מהמלאי הפעיל.",
        meta,
      };
    }
    if (pending.action === "update_inventory") {
      meta.executor = "inventory_manage";
      const manageTurn = await handleInventoryManageTurn({
        dealerId: params.dealerId,
        message: params.message,
        conversation,
        meta,
        turn,
      });
      if (manageTurn) return manageTurn;
    }
  }

  if (plan.action.kind === "SUSPEND_AND_READ" || plan.action.kind === "READ") {
    if (
      plan.action.kind === "SUSPEND_AND_READ" &&
      conversation?.pendingInventoryDraft
    ) {
      conversation = suspendInventoryDraft(conversation);
    }
    return runRead({
      dealerId: params.dealerId,
      userId: params.userId,
      message: params.message,
      plan,
      conversation,
      meta,
    });
  }

  if (
    conversation?.pendingConfirmation &&
    plan.action.kind === "PROPOSE_MUTATION" &&
    pendingSearchCloseMatchesPlan(conversation.pendingConfirmation, plan) &&
    !isSearchCloseAmendment(conversation.pendingConfirmation, plan)
  ) {
    const searchDone = await executeSearchMutation({
      dealerId: params.dealerId,
      pending: conversation.pendingConfirmation,
      conversation,
      meta,
    });
    if (searchDone) {
      meta.executor = "search_confirm_restated";
      meta.responseType = "mutation_close";
      return searchDone;
    }
  }

  if (cap === "SEARCHES" && op === "READ") {
    meta.executor = "searches";
    return handleSearchCapability({
      dealerId: params.dealerId,
      userId: params.userId,
      message: params.message,
      plan,
      operation: "READ",
      scope,
      conversation,
      meta,
    });
  }

  if (
    cap === "SEARCHES" &&
    plan.action.kind === "PROPOSE_MUTATION" &&
    (op === "CREATE" || op === "UPDATE" || op === "CLOSE" || op === "RENEW")
  ) {
    meta.executor = `searches_${op.toLowerCase()}`;
    return handleSearchCapability({
      dealerId: params.dealerId,
      userId: params.userId,
      message: params.message,
      plan,
      operation: op,
      scope,
      conversation,
      meta,
    });
  }

  if (
    inventoryOwnsTurn({ plan, conversation }) ||
    (cap === "INVENTORY" &&
      plan.action.kind === "PROPOSE_MUTATION" &&
      (op === "CREATE" || op === "UPDATE" || op === "MARK_SOLD"))
  ) {
    if (op === "UPDATE" || op === "MARK_SOLD") {
      meta.executor = "inventory_manage";
      const focusedId =
        conversation?.focusedObject?.type === "vehicle"
          ? conversation.focusedObject.id
          : params.entityType === "vehicle"
            ? params.entityId
            : undefined;
      if (focusedId && !(await assertVehicleOwned(params.dealerId, focusedId))) {
        return { intent: "UPDATE_INVENTORY", message: "אין הרשאה לרכב הזה.", meta };
      }
      const manageTurn = await handleInventoryManageTurn({
        dealerId: params.dealerId,
        message: params.message,
        conversation,
        meta,
        turn,
        focusedVehicleId: focusedId,
      });
      if (manageTurn) return manageTurn;
    }
    meta.executor = "inventory_ingest";
    const inventoryTurn = await handleInventoryIngestTurn({
      dealerId: params.dealerId,
      userId: params.userId,
      message: params.message,
      conversation,
      meta,
      turn,
      forceStart: false,
    });
    if (inventoryTurn) return inventoryTurn;
  }

  if (
    cap === "MATCHES" ||
    cap === "OPPORTUNITIES" ||
    cap === "REVEALS" ||
    cap === "OUTCOMES" ||
    cap === "ACTIVITY" ||
    cap === "VALIDATIONS" ||
    cap === "COMMERCIAL" ||
    cap === "GENERAL"
  ) {
    return runRead({
      dealerId: params.dealerId,
      userId: params.userId,
      message: params.message,
      plan: {
        ...plan,
        action: {
          ...plan.action,
          toolGoal: plan.action.toolGoal ?? defaultToolGoal(cap),
        },
      },
      conversation,
      meta,
    });
  }

  meta.executor = "clarify_unrouted";
  meta.responseType = "clarify";
  return {
    intent: "UNKNOWN",
    message: "לא בטוח איך להמשיך — חיפוש, מלאי, התאמות, או משהו אחר?",
    conversation,
    meta,
  };
}

export { assertDemandOwned, assertRevealOwned };

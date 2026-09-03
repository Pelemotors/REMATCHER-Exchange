import "server-only";
import { logAppEvent } from "@/services/notifications";
import {
  type AssistantCard,
  type ConversationState,
  isConfirmation,
  isRejection,
} from "@/services/assistant/conversation-state";
import { executeToolsParallel } from "@/services/assistant/tools/read-tools";
import { AGENT_VERSION, type AgentMeta } from "@/services/assistant/tools/registry";
import { planConversationTurn } from "@/services/assistant/turn-planner";
import { validateTurnPlan } from "@/services/assistant/turn-policy";
import { routeTurnPlan } from "@/services/assistant/capability-router";
import { executeSearchMutation } from "@/services/assistant/search-capability";
import { handleInventoryIngestTurn } from "@/services/assistant/inventory-ingest";
import { privacyBlockedMessage } from "@/services/assistant/privacy-gate";
import type {
  AssistantContext,
  AssistantResponse,
} from "@/services/assistant/orchestrator";

export interface AssistantV2Response extends AssistantResponse {
  cards?: AssistantCard[];
  conversation?: ConversationState;
  meta?: AgentMeta;
}

export async function runExchangeAssistantV2(params: {
  dealerId: string;
  userId: string;
  message: string;
  context: AssistantContext;
  conversation?: ConversationState;
}): Promise<AssistantV2Response> {
  const meta: AgentMeta = {
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

  if (params.context.mode === "inventory_management") {
    params.conversation = {
      ...params.conversation,
      sessionContext: {
        ...params.conversation?.sessionContext,
        operatingMode: "inventory_management",
      },
      focusedObject:
        params.conversation?.focusedObject ??
        (params.context.entityType === "vehicle" && params.context.entityId
          ? { type: "vehicle", id: params.context.entityId }
          : undefined),
    };
  }

  const pendingConf = params.conversation?.pendingConfirmation;
  const exactConfirm =
    pendingConf &&
    isConfirmation(params.message) &&
    /^(כן|אשר|מאשר|בצע|אישור|ok|yes|שמור|שמור במלאי|כן,?\s*נמכרה|עדכן|יאללה)$/i.test(
      params.message.trim()
    );
  const exactCancel =
    pendingConf &&
    isRejection(params.message) &&
    /^(לא|בטל|ביטול|cancel|no)$/i.test(params.message.trim());

  if (exactCancel && pendingConf) {
    meta.executor = "exact_cancel";
    return {
      intent: "UNKNOWN",
      message: "בוטל. לא בוצעה פעולה.",
      conversation: {
        lastList: params.conversation?.lastList,
        pendingInventoryDraft: params.conversation?.pendingInventoryDraft,
        pendingSearchDraft: params.conversation?.pendingSearchDraft,
        sessionContext: params.conversation?.sessionContext,
      },
      meta,
    };
  }

  if (exactConfirm && pendingConf) {
    const searchDone = await executeSearchMutation({
      dealerId: params.dealerId,
      pending: pendingConf,
      conversation: params.conversation,
      meta,
    });
    if (searchDone) {
      meta.executor = searchDone.meta?.executor ?? "search_confirm";
      meta.legacyPlannerUsed = false;
      return searchDone;
    }
    if (pendingConf.action === "create_inventory") {
      const inventoryTurn = await handleInventoryIngestTurn({
        dealerId: params.dealerId,
        userId: params.userId,
        message: params.message,
        conversation: params.conversation,
        meta,
      });
      if (inventoryTurn) return inventoryTurn;
    }
  }

  const planStarted = Date.now();
  const turnPlan = await planConversationTurn({
    message: params.message,
    userId: params.userId,
    conversation: params.conversation,
    inventoryMode:
      params.context.mode === "inventory_management" ||
      params.conversation?.sessionContext?.operatingMode ===
        "inventory_management",
  });
  meta.plannerDurationMs = Date.now() - planStarted;
  meta.plannerUsed = turnPlan.source === "ai";
  meta.tools = [...meta.tools, `turn_plan:${turnPlan.source}`];
  if (turnPlan.source === "fallback") {
    meta.fallbackReason = "turn_plan_fallback";
  }

  await logAppEvent({
    eventType: "agent_turn_planned",
    dealerId: params.dealerId,
    metadata: {
      agentVersion: AGENT_VERSION,
      kind: turnPlan.action.kind,
      source: turnPlan.source,
      relation: turnPlan.telemetryHint.relation,
      confidence: turnPlan.confidence,
      capability: turnPlan.action.capability,
      operation: turnPlan.action.operation,
      scope: turnPlan.action.scope,
      toolGoal: turnPlan.action.toolGoal,
      userGoal: turnPlan.understanding.userGoal?.slice(0, 120),
      legacyPlannerUsed: false,
    },
  });

  const policy = validateTurnPlan({
    message: params.message,
    plan: turnPlan,
    conversation: params.conversation,
  });
  meta.policyResult = policy.decision;

  if (policy.decision === "DENY") {
    await logAppEvent({
      eventType: "assistant_privacy_block",
      dealerId: params.dealerId,
      metadata: {
        reason: policy.reason,
        agentVersion: AGENT_VERSION,
        via: "turn_policy",
      },
    });
    meta.responseType = "privacy_blocked";
    return {
      intent: "FISHING_BLOCKED",
      privacyBlocked: true,
      message: policy.userMessage ?? privacyBlockedMessage("fishing"),
      suggestions: [],
      meta,
    };
  }

  if (policy.decision === "REQUIRE_CLARIFICATION" && turnPlan.action.kind === "CLARIFY") {
    meta.executor = "policy_clarify";
    return {
      intent: "UNKNOWN",
      message: policy.question,
      conversation: params.conversation,
      meta,
    };
  }

  const routed = await routeTurnPlan({
    dealerId: params.dealerId,
    userId: params.userId,
    message: params.message,
    plan: turnPlan,
    conversation: params.conversation,
    contextRoute: params.context.route,
    entityType: params.context.entityType,
    entityId: params.context.entityId,
    meta,
  });

  await logAppEvent({
    eventType: "agent_turn_routed",
    dealerId: params.dealerId,
    metadata: {
      agentVersion: AGENT_VERSION,
      executor: meta.executor,
      capability: meta.capability,
      operation: meta.operation,
      legacyPlannerUsed: false,
      responseType: meta.responseType,
    },
  });

  return routed;
}

type ExchangeStateSnapshot = {
  activeDemands?: number;
  expiringDemands?: number;
  pendingValidations?: number;
  authorizedMatches?: number;
  openOpportunities?: number;
};

/** Lightweight context — single cheap tool, no fan-out */
export async function getAssistantContext(dealerId: string) {
  const { results } = await executeToolsParallel(
    ["getMyExchangeState"],
    dealerId
  );

  const state = results.getMyExchangeState as ExchangeStateSnapshot | undefined;
  const suggestions: Array<{ label: string; href?: string }> = [];

  if (state?.expiringDemands) {
    suggestions.push({
      label: `${state.expiringDemands} חיפושים פגים בקרוב`,
    });
  }
  if (state?.pendingValidations) {
    suggestions.push({
      label: `${state.pendingValidations} אישורי זמינות`,
      href: "/validations",
    });
  }
  if (state?.authorizedMatches) {
    suggestions.push({
      label: `${state.authorizedMatches} התאמות לבדיקה`,
      href: "/matches",
    });
  }
  if (state?.openOpportunities) {
    suggestions.push({
      label: `${state.openOpportunities} הזדמנויות פתוחות`,
      href: "/opportunities",
    });
  }

  const pendingOutcomes = (state as { pendingOutcomes?: number } | undefined)
    ?.pendingOutcomes;
  if (pendingOutcomes) {
    suggestions.push({
      label: `${pendingOutcomes} חיבורים ממתינים לעדכון`,
      href: "/activity?filter=outcomes",
    });
  }

  const hasActionable = suggestions.length > 0;
  const activeDemands = state?.activeDemands ?? 0;

  if (hasActionable) {
    suggestions.push({ label: "תעשה לי סדר" });
  } else if (activeDemands === 0) {
    suggestions.push({ label: "פתח חיפוש", href: "/demand?new=1" });
  }

  return {
    agentVersion: AGENT_VERSION,
    suggestions,
    snapshot: state,
  };
}

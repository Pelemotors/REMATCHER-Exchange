/**
 * Exchange Assistant orchestrator — Agent 4.0 hybrid runtime.
 * READ/advice: bounded OpenAI tool loop (GPT chooses tools).
 * WRITE: Action Gateway (deterministic authorize → resolve → confirm → execute).
 * Turn Planner is NOT the mandatory conversational brain for reads.
 */
import "server-only";
import { logAppEvent } from "@/services/notifications";
import {
  type AssistantCard,
  type ConversationState,
  appendRecentTurns,
  isConfirmation,
  isRejection,
} from "@/services/assistant/conversation-state";
import { executeToolsParallel } from "@/services/assistant/tools/read-tools";
import { AGENT_VERSION, type AgentMeta } from "@/services/assistant/tools/registry";
import { runAgentToolLoop } from "@/services/assistant/agent-loop";
import { runActionGateway } from "@/services/assistant/action-gateway";
import { executeSearchMutation } from "@/services/assistant/search-capability";
import { handleInventoryIngestTurn } from "@/services/assistant/inventory-ingest";
import {
  checkPrivacyGate,
  privacyBlockedMessage,
} from "@/services/assistant/privacy-gate";
import { productHelpAnswer } from "@/services/assistant/help-responses";
import type {
  AssistantContext,
  AssistantResponse,
} from "@/services/assistant/orchestrator";

export interface AssistantV2Response extends AssistantResponse {
  cards?: AssistantCard[];
  conversation?: ConversationState;
  meta?: AgentMeta;
}

function withHistory(
  conversation: ConversationState | undefined,
  userMessage: string,
  assistantMessage: string
): ConversationState {
  return appendRecentTurns(conversation, userMessage, assistantMessage);
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
    modelCallCount: 0,
    toolRoundCount: 0,
    finalResponseSource: "agent_loop",
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

  // Narrow privacy gate — network fishing only
  const privacy = checkPrivacyGate(params.message);
  if (privacy.blocked && privacy.reason) {
    meta.responseType = "privacy_blocked";
    meta.finalResponseSource = "privacy";
    meta.policyResult = "DENY";
    await logAppEvent({
      eventType: "assistant_privacy_block",
      dealerId: params.dealerId,
      metadata: {
        reason: privacy.reason,
        agentVersion: AGENT_VERSION,
        via: "privacy_gate",
      },
    });
    const message = privacyBlockedMessage(privacy.reason);
    return {
      intent: "FISHING_BLOCKED",
      privacyBlocked: true,
      message,
      suggestions: [],
      conversation: withHistory(params.conversation, params.message, message),
      meta,
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
    meta.finalResponseSource = "exact_cta";
    const message = "בוטל. לא בוצעה פעולה.";
    return {
      intent: "UNKNOWN",
      message,
      conversation: withHistory(
        {
          lastList: params.conversation?.lastList,
          pendingInventoryDraft: params.conversation?.pendingInventoryDraft,
          pendingSearchDraft: params.conversation?.pendingSearchDraft,
          sessionContext: params.conversation?.sessionContext,
          recentTurns: params.conversation?.recentTurns,
        },
        params.message,
        message
      ),
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
      meta.finalResponseSource = "exact_cta";
      return {
        ...searchDone,
        conversation: withHistory(
          searchDone.conversation ?? params.conversation,
          params.message,
          searchDone.message
        ),
        meta,
      };
    }
    if (pendingConf.action === "create_inventory") {
      const inventoryTurn = await handleInventoryIngestTurn({
        dealerId: params.dealerId,
        userId: params.userId,
        message: params.message,
        conversation: params.conversation,
        meta,
      });
      if (inventoryTurn) {
        meta.finalResponseSource = "exact_cta";
        return {
          ...inventoryTurn,
          conversation: withHistory(
            inventoryTurn.conversation ?? params.conversation,
            params.message,
            inventoryTurn.message
          ),
          meta,
        };
      }
    }
  }

  // Forced inventory CTA from UI — domain workflow executor, not conversational owner
  if (
    params.conversation?.sessionContext?.forcedIntent === "create_inventory" &&
    !params.conversation.pendingConfirmation
  ) {
    const inventoryTurn = await handleInventoryIngestTurn({
      dealerId: params.dealerId,
      userId: params.userId,
      message: params.message,
      conversation: params.conversation,
      meta,
      forceStart: true,
    });
    if (inventoryTurn) {
      meta.executor = "inventory_ingest_forced";
      meta.finalResponseSource = "action_gateway";
      return {
        ...inventoryTurn,
        conversation: withHistory(
          inventoryTurn.conversation ?? params.conversation,
          params.message,
          inventoryTurn.message
        ),
        meta,
      };
    }
  }

  // ── Agent 4.0 primary path: tool-using GPT loop ──
  const loop = await runAgentToolLoop({
    dealerId: params.dealerId,
    userId: params.userId,
    message: params.message,
    conversation: params.conversation,
    route: params.context.route,
    inventoryMode:
      params.context.mode === "inventory_management" ||
      params.conversation?.sessionContext?.operatingMode ===
        "inventory_management",
  });

  meta.modelCallCount = loop.modelCallCount;
  meta.toolRoundCount = loop.toolRoundCount;
  meta.tools = [...meta.tools, ...loop.toolsUsed];
  meta.toolDurations = { ...meta.toolDurations, ...loop.toolDurations };
  meta.totalTokens = loop.totalTokens;
  meta.loopLatencyMs = loop.latencyMs;
  meta.model = loop.model;
  meta.legacyPlannerUsed = false;
  meta.plannerUsed = false;

  await logAppEvent({
    eventType: "agent_loop_turn",
    dealerId: params.dealerId,
    metadata: {
      agentVersion: AGENT_VERSION,
      success: loop.success,
      modelCallCount: loop.modelCallCount,
      toolRoundCount: loop.toolRoundCount,
      toolsUsed: loop.toolsUsed,
      totalTokens: loop.totalTokens,
      latencyMs: loop.latencyMs,
      hasProposal: Boolean(loop.proposal),
      proposalKind: loop.proposal?.kind ?? null,
      capability: loop.proposal?.capability ?? null,
      operation: loop.proposal?.operation ?? null,
      fallbackReason: loop.fallbackReason,
      legacyPlannerUsed: false,
    },
  });

  if (loop.proposal) {
    const gated = await runActionGateway({
      dealerId: params.dealerId,
      userId: params.userId,
      message: params.message,
      proposal: loop.proposal,
      conversation: params.conversation,
      meta,
      entityType: params.context.entityType,
      entityId: params.context.entityId,
    });
    meta.finalResponseSource = "action_gateway";
    await logAppEvent({
      eventType: "agent_action_gateway",
      dealerId: params.dealerId,
      metadata: {
        agentVersion: AGENT_VERSION,
        kind: loop.proposal.kind,
        capability: loop.proposal.capability,
        operation: loop.proposal.operation,
        scope: loop.proposal.scope,
        policyResult: meta.policyResult,
        executor: meta.executor,
        responseType: meta.responseType,
        legacyPlannerUsed: false,
      },
    });
    return {
      ...gated,
      conversation: withHistory(
        gated.conversation ?? params.conversation,
        params.message,
        gated.message
      ),
      meta,
    };
  }

  if (!loop.success) {
    meta.fallbackReason = loop.fallbackReason;
    meta.finalResponseSource = "fallback";
    meta.executor = "agent_loop_fallback";
    // Modest fallback — no second LLM planner, no unauthorized write
    const message =
      loop.message ||
      productHelpAnswer(null, params.message);
    return {
      intent: "UNKNOWN",
      message,
      conversation: withHistory(params.conversation, params.message, message),
      meta,
    };
  }

  meta.executor = "agent_loop";
  meta.finalResponseSource = "agent_loop";
  meta.responseType = "agent_answer";
  const message = loop.message;
  return {
    intent: "PENDING_ACTIONS",
    message,
    conversation: withHistory(params.conversation, params.message, message),
    meta,
  };
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

/**
 * Exchange Assistant orchestrator — Agent 4.0 hybrid runtime.
 *
 * Ordinary conversation always goes through the universal Agent. Deterministic
 * code remains authority for privacy, authorization, confirmation and execution.
 */
import "server-only";
import { logAppEvent } from "@/services/notifications";
import {
  type AssistantCard,
  type ConversationState,
  appendRecentTurns,
} from "@/services/assistant/conversation-state";
import { executeToolsParallel } from "@/services/assistant/tools/read-tools";
import {
  AGENT_VERSION,
  type AgentMeta,
} from "@/services/assistant/tools/registry";
import { runAgentToolLoop } from "@/services/assistant/agent-loop";
import { runActionGateway } from "@/services/assistant/action-gateway";
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

  // Privacy is a hard deterministic boundary and intentionally remains before AI.
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

  // No intent regex, no turn classifier, no inventory workflow interception here.
  // The universal Agent interprets the turn and chooses capabilities.
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

  const loopConversation = loop.conversation ?? params.conversation;

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
      conversation: loopConversation,
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
        gated.conversation ?? loopConversation,
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
    const message = loop.message || productHelpAnswer(null, params.message);
    return {
      intent: "UNKNOWN",
      message,
      conversation: withHistory(loopConversation, params.message, message),
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
    conversation: withHistory(loopConversation, params.message, message),
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
    suggestions.push({ label: `${state.expiringDemands} חיפושים פגים בקרוב` });
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

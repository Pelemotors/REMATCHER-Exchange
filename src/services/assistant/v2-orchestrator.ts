import "server-only";
import { logAppEvent } from "@/services/notifications";
import {
  checkPrivacyGate,
  privacyBlockedMessage,
} from "@/services/assistant/privacy-gate";
import {
  type AssistantCard,
  type ConversationState,
  isConfirmation,
  isRejection,
  resolveListReference,
} from "@/services/assistant/conversation-state";
import {
  executeToolsParallel,
  getDemandByIdForDealer,
} from "@/services/assistant/tools/read-tools";
import {
  AGENT_VERSION,
  type AgentMeta,
  type ReadToolName,
} from "@/services/assistant/tools/registry";
import {
  createDemandDraft,
  executeConfirmValidation,
  executeDemandClosure,
  executeDemandRenewal,
  markMyVehicleSold,
  prepareConfirmValidation,
  prepareDemandClosure,
  prepareDemandRenewal,
  prepareMarkSold,
} from "@/services/assistant/tools/action-tools";
import { planAgentTurn } from "@/services/assistant/planner";
import { mergeSessionContext } from "@/services/assistant/commercial-judgment";
import {
  helpOnlyResponse,
  synthesizeResponse,
} from "@/services/assistant/synthesizer";
import type {
  AssistantContext,
  AssistantIntent,
  AssistantResponse,
} from "@/services/assistant/orchestrator";

export interface AssistantV2Response extends AssistantResponse {
  cards?: AssistantCard[];
  conversation?: ConversationState;
  meta?: AgentMeta;
}

function uniqueTools(tools: ReadToolName[]): ReadToolName[] {
  return [...new Set(tools)];
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
  };

  const privacy = checkPrivacyGate(params.message);
  if (privacy.blocked && privacy.reason) {
    await logAppEvent({
      eventType: "assistant_privacy_block",
      dealerId: params.dealerId,
      metadata: { reason: privacy.reason, agentVersion: AGENT_VERSION },
    });
    meta.responseType = "privacy_blocked";
    return {
      intent: "FISHING_BLOCKED",
      privacyBlocked: true,
      message: privacyBlockedMessage(privacy.reason),
      suggestions: [],
      meta,
    };
  }

  // --- Confirmation flow ---
  if (params.conversation?.pendingConfirmation) {
    const pending = params.conversation.pendingConfirmation;
    if (isConfirmation(params.message)) {
      const demandId = pending.payload.demandId as string;
      if (pending.action === "renew_demand") {
        const result = await executeDemandRenewal(params.dealerId, demandId);
        meta.responseType = "mutation_renew";
        if (!result.ok) {
          return {
            intent: "UNKNOWN",
            message: "לא הצלחתי לחדש את החיפוש. נסה שוב מהמסך הרלוונטי.",
            meta,
          };
        }
        return {
          intent: "UPDATE_DEMAND",
          message: `חידשתי את "${result.demand?.title ?? "החיפוש"}". Exchange מחפש התאמות מחדש.`,
          cards: [
            {
              type: "result",
              title: "החיפוש חודש",
              body: result.demand?.title,
              demandId,
              href: `/demand?edit=${demandId}`,
            },
          ],
          conversation: { lastList: params.conversation.lastList },
          meta,
        };
      }
      if (pending.action === "close_demand") {
        const demand = await getDemandByIdForDealer(params.dealerId, demandId);
        const result = await executeDemandClosure(params.dealerId, demandId);
        meta.responseType = "mutation_close";
        if (!result.ok) {
          return {
            intent: "UNKNOWN",
            message: "לא הצלחתי לסגור את החיפוש.",
            meta,
          };
        }
        return {
          intent: "CLOSE_DEMAND",
          message: `סגרתי את החיפוש "${demand?.title ?? ""}".`,
          conversation: {},
          meta,
        };
      }
      if (pending.action === "confirm_validation") {
        const validationId = pending.payload.validationId as string;
        const result = await executeConfirmValidation(
          params.dealerId,
          validationId,
          true
        );
        meta.responseType = "mutation_validation";
        if (!result.ok) {
          return {
            intent: "UNKNOWN",
            message: "לא הצלחתי לאשר את הזמינות.",
            meta,
          };
        }
        return {
          intent: "VALIDATION",
          message: "אישרת זמינות. Exchange ממשיך לבדוק התאמות.",
          suggestions: [{ label: "לאימותים", href: "/validations" }],
          meta,
        };
      }
      if (pending.action === "mark_sold") {
        const vehicleId = pending.payload.vehicleId as string;
        const result = await markMyVehicleSold(params.dealerId, vehicleId);
        meta.responseType = "mutation_sold";
        if (!result.ok) {
          return {
            intent: "UNKNOWN",
            message: "לא הצלחתי לסמן את הרכב כנמכר.",
            meta,
          };
        }
        return {
          intent: "UPDATE_INVENTORY",
          message: "סימנתי את הרכב כנמכר.",
          suggestions: [{ label: "למלאי", href: "/inventory" }],
          meta,
        };
      }
    }
    if (isRejection(params.message)) {
      return {
        intent: "UNKNOWN",
        message: "בוטל. לא בוצעה פעולה.",
        conversation: { lastList: params.conversation.lastList },
        meta,
      };
    }
  }

  // --- Reference resolution (renew/close by name or position) ---
  const ref = resolveListReference(params.message, params.conversation);
  if (ref && /חדש|renew|תחדש/i.test(params.message)) {
    const prep = await prepareDemandRenewal(params.dealerId, ref.id);
    if (!prep.ok) {
      return { intent: "UNKNOWN", message: "לא מצאתי את החיפוש.", meta };
    }
    meta.responseType = "confirmation_renew";
    return {
      intent: "UPDATE_DEMAND",
      message: prep.label,
      requiresConfirmation: {
        action: prep.action,
        label: prep.label,
        payload: prep.payload,
      },
      cards: [{ type: "confirmation", title: prep.label, demandId: ref.id }],
      conversation: {
        lastList: params.conversation?.lastList,
        pendingConfirmation: {
          action: prep.action,
          label: prep.label,
          payload: prep.payload,
        },
      },
      meta,
    };
  }

  if (ref && /סגור|סיים|close/i.test(params.message)) {
    const prep = await prepareDemandClosure(params.dealerId, ref.id);
    if (!prep.ok) {
      return { intent: "UNKNOWN", message: "לא מצאתי את החיפוש.", meta };
    }
    meta.responseType = "confirmation_close";
    return {
      intent: "CLOSE_DEMAND",
      message: prep.label,
      requiresConfirmation: {
        action: prep.action,
        label: prep.label,
        payload: prep.payload,
      },
      conversation: {
        lastList: params.conversation?.lastList,
        pendingConfirmation: {
          action: prep.action,
          label: prep.label,
          payload: prep.payload,
        },
      },
      meta,
    };
  }

  const sessionContext = mergeSessionContext(
    params.conversation?.sessionContext,
    params.message
  );

  // --- Plan (demand-driven tool selection) ---
  const {
    plan,
    plannerUsed,
    model: plannerModel,
    durationMs: plannerDurationMs,
  } = await planAgentTurn(params.message, params.userId);
  meta.plannerUsed = plannerUsed;
  meta.plannerDurationMs = plannerDurationMs;
  meta.model = plannerModel;

  // --- Create demand action ---
  if (plan.actionIntent === "create_demand") {
    const draft = await createDemandDraft(
      params.dealerId,
      params.userId,
      params.message
    );
    meta.responseType = "create_demand";
    if (draft.duplicate && draft.existingDemandId) {
      return {
        intent: "CREATE_DEMAND_DRAFT",
        message: draft.message,
        suggestions: [
          {
            label: "עדכן חיפוש קיים",
            href: `/demand?edit=${draft.existingDemandId}`,
          },
          { label: "פתח חיפוש חדש", href: "/demand?new=1" },
        ],
        meta,
      };
    }
    return {
      intent: "CREATE_DEMAND_DRAFT",
      message: draft.message,
      suggestions: [{ label: "המשך לפתיחת חיפוש", href: draft.href }],
      meta,
    };
  }

  if (plan.actionIntent === "help") {
    const help = helpOnlyResponse();
    meta.responseType = "help";
    return {
      intent: "UNKNOWN",
      message: help.message,
      suggestions: help.suggestions,
      meta,
    };
  }

  if (plan.actionIntent === "confirm_validation" && plan.referencedObjectId) {
    const prep = await prepareConfirmValidation(
      params.dealerId,
      plan.referencedObjectId
    );
    if (!prep.ok) {
      return {
        intent: "VALIDATION",
        message: "לא מצאתי אימות ממתין. בדוק במסך האימותים.",
        suggestions: [{ label: "לאימותים", href: "/validations" }],
        meta,
      };
    }
    meta.responseType = "confirmation_validation";
    return {
      intent: "VALIDATION",
      message: prep.label,
      requiresConfirmation: {
        action: prep.action,
        label: prep.label,
        payload: prep.payload,
      },
      conversation: {
        pendingConfirmation: {
          action: prep.action,
          label: prep.label,
          payload: prep.payload,
        },
      },
      meta,
    };
  }

  if (plan.actionIntent === "mark_sold" && plan.referencedObjectId) {
    const prep = await prepareMarkSold(params.dealerId, plan.referencedObjectId);
    if (!prep.ok) {
      return {
        intent: "UPDATE_INVENTORY",
        message: "לא מצאתי את הרכב במלאי שלך.",
        suggestions: [{ label: "פתח מלאי", href: "/inventory" }],
        meta,
      };
    }
    meta.responseType = "confirmation_sold";
    return {
      intent: "UPDATE_INVENTORY",
      message: prep.label,
      requiresConfirmation: {
        action: prep.action,
        label: prep.label,
        payload: prep.payload,
      },
      conversation: {
        pendingConfirmation: {
          action: prep.action,
          label: prep.label,
          payload: prep.payload,
        },
      },
      meta,
    };
  }

  // --- Execute only planner-selected tools ---
  const tools = uniqueTools(
    plan.tools.length > 0 ? plan.tools : (["getMyExchangeState"] as ReadToolName[])
  );
  meta.tools = tools;

  const { results, durations, errors, partialFailure } = await executeToolsParallel(
    tools,
    params.dealerId
  );
  meta.toolDurations = durations;

  // --- Synthesize ---
  const {
    response,
    synthesizerUsed,
    model: synthModel,
    durationMs: synthesisDurationMs,
  } = await synthesizeResponse({
    userMessage: params.message,
    toolResults: results,
    toolErrors: errors,
    userId: params.userId,
    goal: plan.goal,
    sessionContext,
  });

  meta.synthesizerUsed = synthesizerUsed;
  meta.synthesisDurationMs = synthesisDurationMs;
  if (synthModel) meta.model = synthModel;
  if (!plannerUsed) meta.fallbackReason = "planner_heuristic";
  if (!synthesizerUsed) {
    meta.fallbackReason = meta.fallbackReason
      ? `${meta.fallbackReason};synthesizer_deterministic`
      : "synthesizer_deterministic";
  }
  meta.responseType = "state_answer";

  await logAppEvent({
    eventType: "assistant_v2_response",
    dealerId: params.dealerId,
    metadata: {
      agentVersion: AGENT_VERSION,
      tools,
      plannerUsed,
      synthesizerUsed,
      goal: plan.goal,
      cardCount: response.cards.length,
      partialToolFailure: partialFailure,
      toolErrors: Object.keys(errors),
    },
  });

  return {
    intent: "PENDING_ACTIONS" as AssistantIntent,
    message: response.message,
    cards: response.cards,
    suggestions: response.suggestions,
    conversation: {
      lastList: response.lastList,
      goal: plan.goal,
      sessionContext,
    },
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
  // Healthy active searches with no commercial action: no automatic CTA (G-41, G-42)

  return {
    agentVersion: AGENT_VERSION,
    suggestions,
    snapshot: state,
  };
}

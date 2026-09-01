import "server-only";
import {
  callOpenAIStructured,
  isOpenAIConfigured,
  AI_MODELS,
} from "@/services/ai/client";
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
  executeReadTool,
  getDemandByIdForDealer,
  type ReadToolName,
} from "@/services/assistant/tools/read-tools";
import {
  executeDemandClosure,
  executeDemandRenewal,
  prepareDemandClosure,
  prepareDemandRenewal,
} from "@/services/assistant/tools/action-tools";
import type {
  AssistantContext,
  AssistantIntent,
  AssistantResponse,
} from "@/services/assistant/orchestrator";

export interface AssistantV2Response extends AssistantResponse {
  cards?: AssistantCard[];
  conversation?: ConversationState;
}

const READ_TOOLS: ReadToolName[] = [
  "getMyExchangeState",
  "getMyActiveDemands",
  "getMyExpiringDemands",
  "getMyPendingActions",
  "getMyPendingValidations",
  "getMyCommercialStatus",
  "getMyOpportunities",
  "getMyAuthorizedMatches",
];

function planTools(message: string, state?: ConversationState): ReadToolName[] {
  const m = message.trim();

  if (
    /מה כדאי|מה לעשות|סדר פעולות|תעשה לי סדר|מה מחכה|מה צריך לטפל/i.test(m)
  ) {
    return [
      "getMyPendingActions",
      "getMyExpiringDemands",
      "getMyPendingValidations",
      "getMyAuthorizedMatches",
    ];
  }

  if (/פג|פוג|עומד.*להסתיים|expir/i.test(m)) {
    return ["getMyExpiringDemands"];
  }

  if (/חיפוש|מחפש|demand/i.test(m)) {
    return ["getMyActiveDemands", "getMyExpiringDemands"];
  }

  if (/אימות|זמינות|validation/i.test(m)) {
    return ["getMyPendingValidations"];
  }

  if (/התאמ|match/i.test(m)) {
    return ["getMyAuthorizedMatches"];
  }

  if (/חיבור|מסחרי|commercial|reveal/i.test(m)) {
    return ["getMyCommercialStatus"];
  }

  if (state?.goal === "renew_expiring") {
    return ["getMyExpiringDemands"];
  }

  return ["getMyExchangeState", "getMyPendingActions"];
}

async function planToolsWithAI(
  message: string,
  userId: string
): Promise<ReadToolName[]> {
  try {
    const { data } = await callOpenAIStructured<{
      tools: ReadToolName[];
      goal: string;
    }>({
      operation: "assistant_v2_plan",
      promptVersion: "v2.0",
      model: AI_MODELS.demandParser,
      systemPrompt: `You plan which REMATCHER Exchange read tools to call for a dealer assistant.
Available tools: ${READ_TOOLS.join(", ")}.
Return only authorized read tools. Never suggest network inventory counts.`,
      userContent: message,
      schemaName: "assistant_plan",
      schema: {
        type: "object",
        properties: {
          tools: {
            type: "array",
            items: { type: "string", enum: READ_TOOLS },
          },
          goal: { type: "string" },
        },
        required: ["tools", "goal"],
        additionalProperties: false,
      },
      userId,
    });
    return data.tools.length > 0 ? data.tools : planTools(message);
  } catch {
    return planTools(message);
  }
}

function formatPrioritizedResponse(
  toolResults: Record<string, unknown>
): { message: string; cards: AssistantCard[]; list: ConversationState["lastList"] } {
  const cards: AssistantCard[] = [];
  const list: NonNullable<ConversationState["lastList"]> = [];

  const pending = toolResults.getMyPendingActions as
    | {
        items: Array<{
          type: string;
          label: string;
          count: number;
          href: string;
          urgent?: boolean;
        }>;
        total: number;
      }
    | undefined;
  const expiring = toolResults.getMyExpiringDemands as
    | Array<{ id: string; title: string; daysLeft: number | null }>
    | undefined;
  const validations = toolResults.getMyPendingValidations as
    | Array<{ id: string; title: string }>
    | undefined;

  const actionLines: string[] = [];

  if (expiring?.length) {
    actionLines.push(
      `${expiring.length} חיפושים עומדים לפוג`
    );
    for (const d of expiring) {
      cards.push({
        type: "demand",
        title: d.title,
        body: d.daysLeft != null ? `נותרו ${d.daysLeft} ימים` : undefined,
        demandId: d.id,
        href: `/demand?edit=${d.id}`,
      });
      list.push({ id: d.id, title: d.title, type: "demand" });
    }
  }

  if (validations?.length) {
    actionLines.push(
      `${validations.length} רכבים דורשים אישור זמינות`
    );
    for (const v of validations) {
      cards.push({
        type: "pending_action",
        title: v.title,
        body: "נדרש אישור זמינות",
        href: "/validations",
      });
      list.push({ id: v.id, title: v.title, type: "validation" });
    }
  }

  if (pending?.items?.length) {
    for (const item of pending.items) {
      if (item.type === "demand_expiry" || item.type === "validation") continue;
      actionLines.push(`${item.count} ${item.label.toLowerCase()}`);
      cards.push({
        type: "pending_action",
        title: item.label,
        body: `${item.count} ממתינים`,
        href: item.href,
      });
    }
  }

  if (actionLines.length === 0) {
    return {
      message: "אין כרגע דברים דחופים שדורשים טיפול. Exchange עובד ברקע.",
      cards: [],
      list: [],
    };
  }

  return {
    message: `יש לך ${actionLines.length} דברים שדורשים טיפול: ${actionLines.join(", ")}.`,
    cards,
    list,
  };
}

export async function runExchangeAssistantV2(params: {
  dealerId: string;
  userId: string;
  message: string;
  context: AssistantContext;
  conversation?: ConversationState;
}): Promise<AssistantV2Response> {
  const privacy = checkPrivacyGate(params.message);
  if (privacy.blocked && privacy.reason) {
    await logAppEvent({
      eventType: "assistant_privacy_block",
      dealerId: params.dealerId,
      metadata: { reason: privacy.reason },
    });
    return {
      intent: "FISHING_BLOCKED",
      privacyBlocked: true,
      message: privacyBlockedMessage(privacy.reason),
      suggestions: [{ label: "פתח חיפוש", href: "/demand?new=1" }],
    };
  }

  if (params.conversation?.pendingConfirmation) {
    const pending = params.conversation.pendingConfirmation;
    if (isConfirmation(params.message)) {
      const demandId = pending.payload.demandId as string;
      if (pending.action === "renew_demand") {
        const result = await executeDemandRenewal(params.dealerId, demandId);
        if (!result.ok) {
          return {
            intent: "UNKNOWN",
            message: "לא הצלחתי לחדש את החיפוש. נסה שוב מהמסך הרלוונטי.",
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
        };
      }
      if (pending.action === "close_demand") {
        const demand = await getDemandByIdForDealer(params.dealerId, demandId);
        const result = await executeDemandClosure(params.dealerId, demandId);
        if (!result.ok) {
          return {
            intent: "UNKNOWN",
            message: "לא הצלחתי לסגור את החיפוש.",
          };
        }
        return {
          intent: "CLOSE_DEMAND",
          message: `סגרתי את החיפוש "${demand?.title ?? ""}".`,
          conversation: {},
        };
      }
    }

    if (isRejection(params.message)) {
      return {
        intent: "UNKNOWN",
        message: "בוטל. לא בוצעה פעולה.",
        conversation: { lastList: params.conversation.lastList },
      };
    }
  }

  const ref = resolveListReference(params.message, params.conversation);
  if (ref && /חדש|renew|תחדש/i.test(params.message)) {
    const prep = await prepareDemandRenewal(params.dealerId, ref.id);
    if (!prep.ok) {
      return { intent: "UNKNOWN", message: "לא מצאתי את החיפוש." };
    }
    return {
      intent: "UPDATE_DEMAND",
      message: prep.label,
      requiresConfirmation: {
        action: prep.action,
        label: prep.label,
        payload: prep.payload,
      },
      cards: [
        {
          type: "confirmation",
          title: prep.label,
          demandId: ref.id,
        },
      ],
      conversation: {
        lastList: params.conversation?.lastList,
        pendingConfirmation: {
          action: prep.action,
          label: prep.label,
          payload: prep.payload,
        },
        goal: "renew_expiring",
      },
    };
  }

  if (ref && /סגור|סיים|close/i.test(params.message)) {
    const prep = await prepareDemandClosure(params.dealerId, ref.id);
    if (!prep.ok) {
      return { intent: "UNKNOWN", message: "לא מצאתי את החיפוש." };
    }
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
    };
  }

  const tools = isOpenAIConfigured()
    ? await planToolsWithAI(params.message, params.userId)
    : planTools(params.message, params.conversation);

  const toolResults: Record<string, unknown> = {};
  await Promise.all(
    tools.map(async (tool) => {
      toolResults[tool] = await executeReadTool(tool, params.dealerId);
    })
  );

  const formatted = formatPrioritizedResponse(toolResults);

  const suggestions = (formatted.list ?? []).slice(0, 3).map((item) => ({
    label:
      item.type === "demand"
        ? `חדש: ${item.title}`
        : item.title,
    action: item.type === "demand" ? `renew:${item.id}` : undefined,
    href: item.type === "demand" ? undefined : item.type === "validation" ? "/validations" : undefined,
  }));

  if ((formatted.list ?? []).length === 0) {
    const state = toolResults.getMyExchangeState as
      | { activeDemands: number; pendingActions: number }
      | undefined;
    if (state) {
      return {
        intent: "PENDING_ACTIONS",
        message: `יש לך ${state.activeDemands} חיפושים פעילים. אין כרגע פעולות דחופות.`,
        suggestions: [
          { label: "החיפושים שלי", href: "/demand" },
          { label: "פתח חיפוש", href: "/demand?new=1" },
        ],
        conversation: { lastList: [] },
      };
    }
  }

  await logAppEvent({
    eventType: "assistant_v2_response",
    dealerId: params.dealerId,
    metadata: { tools, cardCount: formatted.cards.length },
  });

  return {
    intent: "PENDING_ACTIONS" as AssistantIntent,
    message: formatted.message,
    cards: formatted.cards,
    suggestions,
    conversation: {
      lastList: formatted.list,
      goal: /תעשה לי סדר|מה כדאי/i.test(params.message)
        ? "prioritize"
        : params.conversation?.goal,
    },
  };
}

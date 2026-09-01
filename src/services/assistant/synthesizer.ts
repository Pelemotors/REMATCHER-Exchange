import "server-only";
import {
  callOpenAIStructured,
  isOpenAIConfigured,
  AI_MODELS,
} from "@/services/ai/client";
import { SYNTHESIZER_PROMPT } from "@/services/assistant/agent-constitution";
import type { AssistantCard } from "@/services/assistant/conversation-state";
import type { ConversationListItem } from "@/services/assistant/conversation-state";

export interface SynthesizedResponse {
  message: string;
  suggestions: Array<{ label: string; href?: string }>;
  cards: AssistantCard[];
  lastList: ConversationListItem[];
}

function buildDeterministicResponse(
  toolResults: Record<string, unknown>,
  userMessage: string
): SynthesizedResponse {
  const items: Array<{ priority: number; text: string }> = [];
  const cards: AssistantCard[] = [];
  const lastList: ConversationListItem[] = [];

  const expiring = toolResults.getMyExpiringDemands as
    | Array<{ id: string; title: string; daysLeft: number | null }>
    | undefined;
  const validations = toolResults.getMyPendingValidations as
    | Array<{ id: string; title: string }>
    | undefined;
  const inventory = toolResults.getMyInventoryRequiringAttention as
    | Array<{ id: string; title: string; freshnessState: string }>
    | undefined;
  const state = toolResults.getMyExchangeState as
    | {
        activeDemands: number;
        authorizedMatches: number;
        openOpportunities: number;
      }
    | undefined;
  const activeDemands = toolResults.getMyActiveDemands as
    | Array<{ id: string; title: string; daysLeft: number | null }>
    | undefined;

  let priority = 1;

  if (expiring?.length) {
    const days = expiring[0]?.daysLeft;
    items.push({
      priority: priority++,
      text: `${expiring.length} חיפושים עומדים לפוג${days != null ? ` (הקרוב בעוד ${days} ימים)` : ""}.`,
    });
    for (const d of expiring) {
      cards.push({
        type: "demand",
        title: d.title,
        body: d.daysLeft != null ? `נותרו ${d.daysLeft} ימים` : undefined,
        demandId: d.id,
        href: `/demand?edit=${d.id}`,
      });
      lastList.push({ id: d.id, title: d.title, type: "demand" });
    }
  }

  if (validations?.length) {
    items.push({
      priority: priority++,
      text: `${validations.length} רכבים דורשים אישור זמינות.`,
    });
    for (const v of validations) {
      cards.push({
        type: "pending_action",
        title: v.title,
        body: "נדרש אישור זמינות",
        href: "/validations",
      });
      lastList.push({ id: v.id, title: v.title, type: "validation" });
    }
  }

  if (inventory?.length) {
    items.push({
      priority: priority++,
      text: `${inventory.length} רכבים במלאי דורשים עדכון/אישור.`,
    });
  }

  if (state?.authorizedMatches && state.authorizedMatches > 0) {
    items.push({
      priority: priority++,
      text: `${state.authorizedMatches} התאמות מאומתות ממתינות לבדיקה.`,
    });
  }

  if (state?.openOpportunities && state.openOpportunities > 0) {
    items.push({
      priority: priority++,
      text: `${state.openOpportunities} הזדמנויות פתוחות — יש עניין ברכבים שלך.`,
    });
  }

  if (/כמה חיפוש/i.test(userMessage) && state) {
    return {
      message: `יש לך ${state.activeDemands} חיפושים פעילים.`,
      suggestions: [{ label: "החיפושים שלי", href: "/demand" }],
      cards: [],
      lastList:
        activeDemands?.map((d) => ({
          id: d.id,
          title: d.title,
          type: "demand" as const,
        })) ?? [],
    };
  }

  if (items.length === 0) {
    const active = state?.activeDemands ?? 0;
    return {
      message:
        active > 0
          ? `יש לך ${active} חיפושים פעילים. אין כרגע פעולות דחופות.`
          : "אין כרגע פעולות דחופות. Exchange עובד ברקע.",
      suggestions: [{ label: "פתח חיפוש", href: "/demand?new=1" }],
      cards: [],
      lastList: [],
    };
  }

  const numbered = items
    .map((i) => `${i.priority}. ${i.text}`)
    .join("\n");

  const suggestions = lastList.slice(0, 3).map((item) => ({
    label: item.type === "demand" ? `חדש: ${item.title}` : item.title,
    href: item.type === "validation" ? "/validations" : undefined,
  }));

  return {
    message: `יש לך ${items.length} דברים שכדאי לטפל בהם:\n${numbered}`,
    suggestions,
    cards,
    lastList,
  };
}

export async function synthesizeResponse(params: {
  userMessage: string;
  toolResults: Record<string, unknown>;
  userId: string;
  goal: string;
}): Promise<{
  response: SynthesizedResponse;
  synthesizerUsed: boolean;
  model: string | null;
  durationMs: number;
}> {
  const start = Date.now();
  const fallback = buildDeterministicResponse(
    params.toolResults,
    params.userMessage
  );

  if (!isOpenAIConfigured()) {
    return {
      response: fallback,
      synthesizerUsed: false,
      model: null,
      durationMs: Date.now() - start,
    };
  }

  try {
    const { data } = await callOpenAIStructured<{
      message: string;
      suggestions: Array<{ label: string; href?: string | null }>;
      listItems: Array<{
        id: string;
        title: string;
        type: "demand" | "validation" | "match" | "opportunity";
      }>;
    }>({
      operation: "assistant_v2_synthesize",
      promptVersion: "2.1",
      model: AI_MODELS.demandParser,
      systemPrompt: SYNTHESIZER_PROMPT,
      userContent: JSON.stringify({
        userMessage: params.userMessage,
        goal: params.goal,
        toolResults: params.toolResults,
      }),
      schemaName: "agent_response",
      schema: {
        type: "object",
        properties: {
          message: { type: "string" },
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                href: { type: ["string", "null"] },
              },
              required: ["label", "href"],
              additionalProperties: false,
            },
          },
          listItems: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                type: {
                  type: "string",
                  enum: ["demand", "validation", "match", "opportunity"],
                },
              },
              required: ["id", "title", "type"],
              additionalProperties: false,
            },
          },
        },
        required: ["message", "suggestions", "listItems"],
        additionalProperties: false,
      },
      userId: params.userId,
    });

    const cards: AssistantCard[] = data.listItems.map((item) => ({
      type: item.type === "demand" ? "demand" : "pending_action",
      title: item.title,
      demandId: item.type === "demand" ? item.id : undefined,
      href:
        item.type === "demand"
          ? `/demand?edit=${item.id}`
          : item.type === "validation"
            ? "/validations"
            : item.type === "match"
              ? "/matches"
              : "/opportunities",
    }));

    return {
      response: {
        message: data.message,
        suggestions: data.suggestions
          .filter((s) => s.label)
          .map((s) => ({ label: s.label, href: s.href ?? undefined })),
        cards,
        lastList: data.listItems,
      },
      synthesizerUsed: true,
      model: AI_MODELS.demandParser,
      durationMs: Date.now() - start,
    };
  } catch {
    return {
      response: fallback,
      synthesizerUsed: false,
      model: AI_MODELS.demandParser,
      durationMs: Date.now() - start,
    };
  }
}

/** Minimal help text — only for explicit help intent */
export function helpOnlyResponse(): SynthesizedResponse {
  return {
    message:
      "אפשר לשאול מה דורש טיפול, אילו חיפושים עומדים לפוג, לחדש או לסגור חיפוש, או לפתוח חיפוש חדש.",
    suggestions: [
      { label: "מה כדאי לטפל בו עכשיו?" },
      { label: "פתח חיפוש", href: "/demand?new=1" },
    ],
    cards: [],
    lastList: [],
  };
}

export { buildDeterministicResponse };

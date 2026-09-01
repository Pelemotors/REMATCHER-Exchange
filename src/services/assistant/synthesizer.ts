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

export interface BuildResponseOptions {
  goal?: string;
  toolErrors?: Record<string, string>;
}

type ActionItem = {
  text: string;
  card?: AssistantCard;
  listItem?: ConversationListItem;
};

const METRIC_DUMP_PATTERNS = [
  /דרישות פעילות/i,
  /אימותים ממתינים/i,
  /התאמות מאושרות/i,
  /הזדמנויות פתוחות/i,
  /פעולות ממתינות\s*:/i,
  /Exchange Assistant/i,
  /נסה לשאול/i,
];

const DETERMINISTIC_GOALS = new Set([
  "prioritize_actions",
  "count_active_demands",
  "list_active_demands",
  "list_expiring_demands",
  "list_matches",
  "list_pending_validations",
  "inventory_attention",
  "commercial_status",
  "general_inquiry",
]);

function isMetricDump(message: string): boolean {
  return METRIC_DUMP_PATTERNS.some((p) => p.test(message));
}

function displayShortName(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(1).join(" ");
  }
  return title;
}

function detectResponseIntent(userMessage: string, goal?: string): string {
  if (
    /הגיע.*על|משהו על|על ה-/i.test(userMessage) &&
    /cx|חיפוש|מרצדס|טוסון|ספורטאז/i.test(userMessage)
  ) {
    return "match_inquiry";
  }
  if (/הגיע משהו|הגיעה התאמה/i.test(userMessage)) return "arrived";
  if (/חם|דחוף|דחיפ|שווה טיפול/i.test(userMessage)) return "hot";
  if (/כמה חיפוש/i.test(userMessage)) return "count_demands";
  if (/מה כדאי|תעשה לי סדר|מה מפספס|מה לעשות|מה צריך/i.test(userMessage)) {
    return "prioritize";
  }
  return goal ?? "general";
}

function allToolsFailed(
  toolResults: Record<string, unknown>,
  toolErrors?: Record<string, string>
): boolean {
  if (!toolErrors || Object.keys(toolErrors).length === 0) return false;
  const keys = Object.keys(toolResults);
  if (keys.length === 0) return true;
  return keys.every((k) => toolResults[k] == null);
}

function buildActionItems(toolResults: Record<string, unknown>): ActionItem[] {
  const items: ActionItem[] = [];

  const opportunities = toolResults.getMyOpportunities as
    | { count: number; href?: string }
    | undefined;
  const state = toolResults.getMyExchangeState as
    | { openOpportunities?: number; authorizedMatches?: number }
    | undefined;
  const oppCount = opportunities?.count ?? state?.openOpportunities ?? 0;
  if (oppCount > 0) {
    items.push({
      text: "יש עניין חדש ברכב שלך שכדאי לבדוק.",
      card: { type: "pending_action", title: "יש עניין ברכב שלך", href: "/opportunities" },
    });
  }

  const validations = toolResults.getMyPendingValidations as
    | Array<{ id: string; title: string }>
    | undefined;
  if (validations?.length) {
    for (const v of validations) {
      const name = displayShortName(v.title);
      items.push({
        text: `צריך לאשר שה${name} עדיין במלאי.`,
        card: {
          type: "pending_action",
          title: v.title,
          body: "נדרש אישור זמינות",
          href: "/validations",
        },
        listItem: { id: v.id, title: v.title, type: "validation" },
      });
    }
  }

  const matchCount =
    (toolResults.getMyAuthorizedMatches as { count?: number } | undefined)?.count ??
    state?.authorizedMatches ??
    0;
  if (matchCount > 0 && !items.some((i) => i.text.includes("התאמה"))) {
    items.push({
      text: "נמצאה התאמה שכדאי לבדוק.",
      card: { type: "pending_action", title: "התאמות לבדיקה", href: "/matches" },
    });
  }

  const expiring = toolResults.getMyExpiringDemands as
    | Array<{ id: string; title: string; daysLeft: number | null }>
    | undefined;
  if (expiring?.length) {
    for (const d of expiring) {
      const name = displayShortName(d.title);
      const when =
        d.daysLeft === 1
          ? "מחר"
          : d.daysLeft != null
            ? `בעוד ${d.daysLeft} ימים`
            : "בקרוב";
      items.push({
        text: `החיפוש של ${name} מסתיים ${when}.`,
        card: {
          type: "demand",
          title: d.title,
          body: d.daysLeft != null ? `נותרו ${d.daysLeft} ימים` : undefined,
          demandId: d.id,
          href: `/demand?edit=${d.id}`,
        },
        listItem: { id: d.id, title: d.title, type: "demand" },
      });
    }
  }

  const inventory = toolResults.getMyInventoryRequiringAttention as
    | Array<{ id: string; title: string; freshnessState: string }>
    | undefined;
  if (inventory?.length) {
    for (const v of inventory) {
      const name = displayShortName(v.title);
      items.push({
        text: `צריך לאשר שה${name} עדיין במלאי.`,
        listItem: { id: v.id, title: v.title, type: "validation" },
      });
    }
  }

  return items;
}

function emptyStateMessage(activeDemands: number, intent: string): string {
  if (intent === "hot" || intent === "arrived") {
    return "כרגע אין משהו חדש שדורש פעולה.";
  }
  if (activeDemands > 0) {
    return `יש לך ${activeDemands} חיפושים פעילים, אבל כרגע אין משהו חדש שדורש פעולה.`;
  }
  return "כרגע אין משהו דחוף שמחכה לך.";
}

function formatActionResponse(
  actions: ActionItem[],
  activeDemands: number,
  intent: string
): SynthesizedResponse {
  const cards = actions.map((a) => a.card).filter(Boolean) as AssistantCard[];
  const lastList = actions
    .map((a) => a.listItem)
    .filter(Boolean) as ConversationListItem[];

  if (actions.length === 0) {
    const message = emptyStateMessage(activeDemands, intent);
    const suggestions =
      activeDemands > 0 && intent === "prioritize"
        ? [
            { label: "החיפושים שלי", href: "/demand" },
            { label: "פתח חיפוש", href: "/demand?new=1" },
          ]
        : [{ label: "פתח חיפוש", href: "/demand?new=1" }];
    return { message, suggestions, cards: [], lastList: [] };
  }

  if (actions.length === 1) {
    const action = actions[0]!;
    const renewHint =
      action.listItem?.type === "demand" ? " לחדש אותו?" : "";
    return {
      message: `יש דבר אחד שכדאי לטפל בו עכשיו — ${action.text.replace(/\.$/, "")}${renewHint}`,
      suggestions: lastList.slice(0, 2).map((item) => ({
        label: item.type === "demand" ? `חדש: ${item.title}` : item.title,
        href: item.type === "demand" ? `/demand?edit=${item.id}` : "/validations",
      })),
      cards,
      lastList,
    };
  }

  const numbered = actions
    .map((a, i) => `${i + 1}. ${a.text}`)
    .join("\n");

  const countLabel =
    actions.length === 2
      ? "שני"
      : actions.length === 3
        ? "שלושה"
        : String(actions.length);

  return {
    message: `יש ${countLabel} דברים ששווים טיפול עכשיו:\n${numbered}`,
    suggestions: lastList.slice(0, 3).map((item) => ({
      label: item.type === "demand" ? `חדש: ${item.title}` : item.title,
      href: item.type === "demand" ? `/demand?edit=${item.id}` : "/validations",
    })),
    cards,
    lastList,
  };
}

function buildDeterministicResponse(
  toolResults: Record<string, unknown>,
  userMessage: string,
  options: BuildResponseOptions = {}
): SynthesizedResponse {
  const { goal, toolErrors } = options;

  if (allToolsFailed(toolResults, toolErrors)) {
    return {
      message: "אני לא מצליח כרגע לטעון את המידע שלך. נסה שוב בעוד רגע.",
      suggestions: [{ label: "נסה שוב" }],
      cards: [],
      lastList: [],
    };
  }

  const intent = detectResponseIntent(userMessage, goal);
  const state = toolResults.getMyExchangeState as
    | {
        activeDemands?: number;
        authorizedMatches?: number;
        openOpportunities?: number;
      }
    | undefined;
  const activeDemands = state?.activeDemands ?? 0;
  const activeDemandsList = toolResults.getMyActiveDemands as
    | Array<{ id: string; title: string; daysLeft: number | null }>
    | undefined;

  if (intent === "count_demands" && state) {
    return {
      message: `יש לך ${state.activeDemands ?? 0} חיפושים פעילים.`,
      suggestions: [{ label: "החיפושים שלי", href: "/demand" }],
      cards: [],
      lastList:
        activeDemandsList?.map((d) => ({
          id: d.id,
          title: d.title,
          type: "demand" as const,
        })) ?? [],
    };
  }

  if (intent === "match_inquiry") {
    const matchCount =
      (toolResults.getMyAuthorizedMatches as { count?: number } | undefined)?.count ??
      state?.authorizedMatches ??
      0;
    if (matchCount === 0) {
      return {
        message: "כרגע אין התאמה מאומתת שעומדת בתנאים להצגה.",
        suggestions: [{ label: "החיפושים שלי", href: "/demand" }],
        cards: [],
        lastList: [],
      };
    }
  }

  const actions = buildActionItems(toolResults);

  if (
    actions.length === 0 &&
    intent === "prioritize" &&
    activeDemands > 0 &&
    (state?.authorizedMatches ?? 0) === 0 &&
    (state?.openOpportunities ?? 0) === 0
  ) {
    if (/מה כדאי/i.test(userMessage)) {
      return {
        message: `כרגע אין משהו דחוף שמחכה לך. יש לך ${activeDemands} חיפושים פעילים, אבל עדיין לא נוצרה התאמה ששווה פעולה.`,
        suggestions: [
          { label: "החיפושים שלי", href: "/demand" },
          { label: "פתח חיפוש", href: "/demand?new=1" },
        ],
        cards: [],
        lastList: [],
      };
    }
  }

  return formatActionResponse(actions, activeDemands, intent);
}

function shouldPreferDeterministic(userMessage: string, goal?: string): boolean {
  if (goal && DETERMINISTIC_GOALS.has(goal)) return true;
  const intent = detectResponseIntent(userMessage, goal);
  return ["prioritize", "count_demands", "hot", "arrived", "match_inquiry"].includes(
    intent
  );
}

export async function synthesizeResponse(params: {
  userMessage: string;
  toolResults: Record<string, unknown>;
  toolErrors?: Record<string, string>;
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
    params.userMessage,
    { goal: params.goal, toolErrors: params.toolErrors }
  );

  if (shouldPreferDeterministic(params.userMessage, params.goal)) {
    return {
      response: fallback,
      synthesizerUsed: false,
      model: null,
      durationMs: Date.now() - start,
    };
  }

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
      promptVersion: "2.3",
      model: AI_MODELS.demandParser,
      systemPrompt: SYNTHESIZER_PROMPT,
      userContent: JSON.stringify({
        userMessage: params.userMessage,
        goal: params.goal,
        toolResults: params.toolResults,
        toolErrors: params.toolErrors ?? {},
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

    if (isMetricDump(data.message)) {
      return {
        response: fallback,
        synthesizerUsed: false,
        model: AI_MODELS.demandParser,
        durationMs: Date.now() - start,
      };
    }

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

export { buildDeterministicResponse, isMetricDump, detectResponseIntent };

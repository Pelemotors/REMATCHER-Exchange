import "server-only";
import {
  callOpenAIStructured,
  isOpenAIConfigured,
  AI_MODELS,
} from "@/services/ai/client";
import { SYNTHESIZER_PROMPT } from "@/services/assistant/legacy-prompts";
import type { AssistantCard } from "@/services/assistant/conversation-state";
import type { ConversationListItem, SessionContext } from "@/services/assistant/conversation-state";
import {
  applyCommercialJudgment,
  buildBrokerOnlyMessage,
  buildBrokerOnlySuggestions,
  buildIdleSuggestions,
  isBrokerNoInventoryDisclosure,
  isBrokerOnlyMode,
  isZeroCategoryNarration,
  type CommercialJudgmentInput,
} from "@/services/assistant/commercial-judgment";

export interface SynthesizedResponse {
  message: string;
  suggestions: Array<{ label: string; href?: string }>;
  cards: AssistantCard[];
  lastList: ConversationListItem[];
}

export interface BuildResponseOptions {
  goal?: string;
  toolErrors?: Record<string, string>;
  sessionContext?: SessionContext;
}

type ActionItem = {
  text: string;
  card?: AssistantCard;
  listItem?: ConversationListItem;
};

function authorizedMatchCount(toolResults: Record<string, unknown>): number {
  const raw = toolResults.getMyAuthorizedMatches;
  if (Array.isArray(raw)) return raw.length;
  if (raw && typeof raw === "object" && "count" in raw) {
    return Number((raw as { count?: number }).count ?? 0);
  }
  return 0;
}

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
]);

function isMetricDump(message: string): boolean {
  return METRIC_DUMP_PATTERNS.some((p) => p.test(message)) || isZeroCategoryNarration(message);
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

function buildActionItems(
  toolResults: Record<string, unknown>,
  options: { skipInventory?: boolean } = {}
): ActionItem[] {
  const items: ActionItem[] = [];

  const opportunities = toolResults.getMyOpportunities as
    | { count: number; href?: string }
    | undefined;
  const state = toolResults.getMyExchangeState as
    | { openOpportunities?: number; authorizedMatches?: number }
    | undefined;
  const oppCount = Array.isArray(opportunities)
    ? opportunities.length
    : opportunities?.count ?? state?.openOpportunities ?? 0;
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
    authorizedMatchCount(toolResults) || state?.authorizedMatches || 0;
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
  if (!options.skipInventory && inventory?.length) {
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
  return "כרגע אין משהו דחוף שמחכה לטיפול. אם תרצה, אפשר לעבור על המלאי או לפתוח חיפוש חדש.";
}

function judgmentInput(
  userMessage: string,
  options: BuildResponseOptions,
  intent: string,
  activeDemands: number,
  hasActionableItems: boolean,
  commercialActionRequired?: boolean
): CommercialJudgmentInput {
  return {
    userMessage,
    goal: options.goal,
    activeDemands,
    hasActionableItems,
    commercialActionRequired,
    sessionContext: options.sessionContext,
    intent,
  };
}

function formatActionResponse(
  actions: ActionItem[],
  activeDemands: number,
  intent: string,
  judgment: CommercialJudgmentInput
): SynthesizedResponse {
  const cards = actions.map((a) => a.card).filter(Boolean) as AssistantCard[];
  const lastList = actions
    .map((a) => a.listItem)
    .filter(Boolean) as ConversationListItem[];

  if (actions.length === 0) {
    const message = emptyStateMessage(activeDemands, intent);
    const suggestions = buildIdleSuggestions(judgment);
    const judged = applyCommercialJudgment({ message, suggestions }, judgment);
    return { ...judged, cards: [], lastList: [] };
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
  const { goal, toolErrors, sessionContext } = options;

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
        connectionsRemaining?: number;
      }
    | undefined;
  const activeDemands = state?.activeDemands ?? 0;
  const commercial = toolResults.getMyCommercialStatus as
    | { actionRequired?: boolean }
    | undefined;
  const commercialActionRequired =
    commercial?.actionRequired === true;
  const skipInventory = isBrokerOnlyMode(sessionContext);
  const judgment = judgmentInput(
    userMessage,
    options,
    intent,
    activeDemands,
    false,
    commercialActionRequired
  );

  if (isBrokerNoInventoryDisclosure(userMessage)) {
    const brokerMessage = buildBrokerOnlyMessage(activeDemands);
    const brokerSuggestions = buildBrokerOnlySuggestions(activeDemands, judgment);
    const judged = applyCommercialJudgment(
      { message: brokerMessage, suggestions: brokerSuggestions },
      judgment
    );
    return { ...judged, cards: [], lastList: [] };
  }

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
      authorizedMatchCount(toolResults) || state?.authorizedMatches || 0;
    if (matchCount === 0) {
      return {
        message: "כרגע אין התאמה מאומתת שעומדת בתנאים להצגה.",
        suggestions: [{ label: "החיפושים שלי", href: "/demand" }],
        cards: [],
        lastList: [],
      };
    }
    const listed = toolResults.getMyAuthorizedMatches;
    if (Array.isArray(listed) && listed.length) {
      const lines = listed.slice(0, 8).map((m: { demandTitle?: string; scoreBand?: string }, i: number) => {
        const title = m.demandTitle ?? "התאמה";
        const band = m.scoreBand ? ` · ${m.scoreBand}` : "";
        return `${i + 1}. ${title}${band}`;
      });
      return {
        message: `יש לך ${listed.length} התאמות מאושרות:\n${lines.join("\n")}`,
        suggestions: [{ label: "התאמות", href: "/matches" }],
        cards: [],
        lastList: listed.slice(0, 8).map((m: { id?: string; demandTitle?: string }) => ({
          id: String(m.id ?? ""),
          title: m.demandTitle ?? "התאמה",
          type: "match" as const,
        })),
      };
    }
    return {
      message: `יש לך ${matchCount} התאמות מאושרות לבדיקה.`,
      suggestions: [{ label: "התאמות", href: "/matches" }],
      cards: [],
      lastList: [],
    };
  }

  const actions = buildActionItems(toolResults, { skipInventory });
  judgment.hasActionableItems = actions.length > 0;

  if (
    actions.length === 0 &&
    intent === "prioritize" &&
    activeDemands > 0 &&
    (state?.authorizedMatches ?? 0) === 0 &&
    (state?.openOpportunities ?? 0) === 0
  ) {
    if (/מה כדאי/i.test(userMessage)) {
      const message = `כרגע אין משהו דחוף שמחכה לך. יש לך ${activeDemands} חיפושים פעילים, אבל עדיין לא נוצרה התאמה ששווה פעולה.`;
      const judged = applyCommercialJudgment(
        { message, suggestions: buildIdleSuggestions(judgment) },
        judgment
      );
      return { ...judged, cards: [], lastList: [] };
    }
  }

  return formatActionResponse(actions, activeDemands, intent, judgment);
}

function shouldPreferDeterministic(userMessage: string, goal?: string): boolean {
  if (goal === "dealer_next_best_action") return false;
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
  sessionContext?: SessionContext;
}): Promise<{
  response: SynthesizedResponse;
  synthesizerUsed: boolean;
  model: string | null;
  durationMs: number;
}> {
  const start = Date.now();
  const buildOpts = {
    goal: params.goal,
    toolErrors: params.toolErrors,
    sessionContext: params.sessionContext,
  };
  const fallback = buildDeterministicResponse(
    params.toolResults,
    params.userMessage,
    buildOpts
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

    const state = params.toolResults.getMyExchangeState as
      | { activeDemands?: number }
      | undefined;
    const commercial = params.toolResults.getMyCommercialStatus as
      | { actionRequired?: boolean }
      | undefined;
    const intent = detectResponseIntent(params.userMessage, params.goal);
    const judgment = judgmentInput(
      params.userMessage,
      buildOpts,
      intent,
      state?.activeDemands ?? 0,
      data.listItems.length > 0,
      commercial?.actionRequired === true
    );

    const judged = applyCommercialJudgment(
      {
        message: data.message,
        suggestions: data.suggestions
          .filter((s) => s.label)
          .map((s) => ({ label: s.label, href: s.href ?? undefined })),
      },
      judgment
    );

    return {
      response: {
        message: judged.message,
        suggestions: judged.suggestions,
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
    suggestions: [{ label: "מה כדאי לטפל בו עכשיו?" }],
    cards: [],
    lastList: [],
  };
}

export { buildDeterministicResponse, isMetricDump, detectResponseIntent };

/**
 * Commercial Judgment — when to recommend, suggest, or stay silent.
 * See docs/agent/AGENT_PLAYBOOK.md §5, GOLDEN_CONVERSATIONS G-41–G-45.
 */

export type OperatingMode = "broker_only";

export interface SessionContext {
  operatingMode?: OperatingMode;
}

export interface CommercialJudgmentInput {
  userMessage: string;
  goal?: string;
  activeDemands?: number;
  hasActionableItems: boolean;
  commercialActionRequired?: boolean;
  sessionContext?: SessionContext;
  intent?: string;
}

const CREATE_SEARCH_SUGGESTION = /פתח חיפוש|ליצור חיפוש/i;

const FORBIDDEN_IDLE_SUGGESTION_PATTERNS = [
  /להגביר פעילות/i,
  /לנצל חיבורים/i,
  /ליצור חיפוש/i,
  CREATE_SEARCH_SUGGESTION,
];

const ALLOWANCE_NARRATION_PATTERNS = [
  /נשארו לך \d+ חיבורים/i,
  /חיבורים בחבילה/i,
  /מכסת חיבורים/i,
  /ניצלת את החיבורים/i,
];

const ZERO_CATEGORY_PATTERNS = [
  /אימותים?\s*[:：]\s*0/i,
  /התאמות?\s*[:：]\s*0/i,
  /הזדמנויות?\s*[:：]\s*0/i,
  /0\s+אימות/i,
  /0\s+התאמ/i,
  /0\s+הזדמנ/i,
  /אין אימותים ממתינים/i,
  /אין התאמות מאושרות/i,
  /אין הזדמנויות פתוחות/i,
];

export function hasExplicitCreateSearchIntent(message: string): boolean {
  return /פתח|תחפש|חיפוש ל|חיפוש חדש|תפתח לי חיפוש|ליצור חיפוש|לפתוח חיפוש/i.test(
    message
  );
}

export function isExplicitCommercialInquiry(message: string): boolean {
  return /חיבור|מסחרי|מכסה|allowance|reveal|חבילה|נשארו.*חיבור/i.test(message);
}

export function isBrokerNoInventoryDisclosure(message: string): boolean {
  return /אין לי בכלל מלאי|אין מלאי|מתווך|מתווכ/i.test(message);
}

export function mergeSessionContext(
  existing?: SessionContext,
  message: string
): SessionContext {
  if (isBrokerNoInventoryDisclosure(message)) {
    return { operatingMode: "broker_only" };
  }
  return existing ?? {};
}

export function isBrokerOnlyMode(sessionContext?: SessionContext): boolean {
  return sessionContext?.operatingMode === "broker_only";
}

/** When idle state may auto-suggest opening a new search */
export function shouldSuggestNewSearch(input: CommercialJudgmentInput): boolean {
  if (hasExplicitCreateSearchIntent(input.userMessage)) return true;
  if ((input.activeDemands ?? 0) === 0) return true;
  return false;
}

export function isZeroCategoryNarration(message: string): boolean {
  return ZERO_CATEGORY_PATTERNS.some((p) => p.test(message));
}

export function filterSuggestions(
  suggestions: Array<{ label: string; href?: string }>,
  input: CommercialJudgmentInput
): Array<{ label: string; href?: string }> {
  let filtered = suggestions.filter((s) => s.label?.trim());

  if (!input.hasActionableItems) {
    filtered = filtered.filter(
      (s) => !/להגביר פעילות|לנצל חיבורים/i.test(s.label)
    );
    if (!shouldSuggestNewSearch(input)) {
      filtered = filtered.filter(
        (s) => CREATE_SEARCH_SUGGESTION.test(s.label) || /ליצור חיפוש/i.test(s.label)
      );
    }
  }

  return filtered;
}

export function buildIdleSuggestions(
  input: CommercialJudgmentInput
): Array<{ label: string; href?: string }> {
  if (input.hasActionableItems) return [];

  if (shouldSuggestNewSearch(input)) {
    return [{ label: "פתח חיפוש", href: "/demand?new=1" }];
  }

  // G-42: no action is a valid recommendation — empty suggestions OK
  return [];
}

export function buildBrokerOnlyMessage(activeDemands: number): string {
  if (activeDemands > 0) {
    return `מבין — אתה עובד כמתווך בלי מלאי משלך. יש לך ${activeDemands} חיפושים פעילים; כשיתעדכן משהו שדורש פעולה, אעדכן. אין צורך לעדכן מלאי ב-Exchange.`;
  }
  return "מבין — אתה עובד כמתווך בלי מלאי משלך. ב-Exchange העבודה היא מהצד של חיפושים: פתיחת חיפוש ללקוח, מעקב על התאמות, והגיבה כשיש עניין. אין צורך לעדכן מלאי.";
}

export function buildBrokerOnlySuggestions(
  activeDemands: number,
  input: CommercialJudgmentInput
): Array<{ label: string; href?: string }> {
  if (activeDemands > 0) {
    return [{ label: "החיפושים שלי", href: "/demand" }];
  }
  if (shouldSuggestNewSearch(input)) {
    return [{ label: "פתח חיפוש", href: "/demand?new=1" }];
  }
  return [];
}

export function applyCommercialJudgment(
  response: { message: string; suggestions: Array<{ label: string; href?: string }> },
  input: CommercialJudgmentInput
): { message: string; suggestions: Array<{ label: string; href?: string }> } {
  let { message, suggestions } = response;

  // G-43: allowance must not appear in broad prioritization unless asked
  if (
    input.intent === "prioritize" &&
    !isExplicitCommercialInquiry(input.userMessage) &&
    !input.commercialActionRequired
  ) {
    if (ALLOWANCE_NARRATION_PATTERNS.some((p) => p.test(message))) {
      message = emptyStateMessage(input.activeDemands ?? 0, input.intent);
    }
  }

  suggestions = filterSuggestions(suggestions, input);

  return { message, suggestions };
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

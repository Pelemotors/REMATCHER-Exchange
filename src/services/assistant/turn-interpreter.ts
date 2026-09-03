import "server-only";
import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import {
  callOpenAIStructured,
  isOpenAIConfigured,
  logAiOperation,
} from "@/services/ai/client";
import type { ConversationState } from "@/services/assistant/conversation-state";
import {
  isConfirmation,
  isRejection,
} from "@/services/assistant/conversation-state";
import { isSkipAnswer } from "@/services/assistant/inventory-draft";
import type {
  QuestionAbout,
  StructuredTurnEvent,
  TurnCapability,
  TurnInventoryFacts,
  TurnRelation,
} from "@/services/assistant/turn-event";
import {
  applyShorthandToFields,
  parseDealerPriceFromText,
  parseMileageFromText,
  parseYearFromText,
} from "@/services/assistant/vehicle-shorthand";
import { parseOwnershipAnswer } from "@/services/assistant/inventory-draft";

// Schema imported from shared file to allow testing without server-only deps
import { TURN_SCHEMA_FOR_TEST as TURN_SCHEMA } from "@/services/assistant/turn-interpreter-schema";

function extractFactsDeterministic(message: string): TurnInventoryFacts {
  const applied = applyShorthandToFields(message, {
    make: null,
    model: null,
    year: null,
    mileage: null,
    b2bPrice: null,
  });
  const ownership = parseOwnershipAnswer(message);
  const facts: TurnInventoryFacts = {
    make: applied.make,
    model: applied.model,
    year: applied.year ?? parseYearFromText(message),
    mileage: applied.mileage ?? parseMileageFromText(message),
    b2bPrice: applied.b2bPrice ?? parseDealerPriceFromText(message),
  };

  if (!facts.b2bPrice) {
    const price = message.match(/\b(\d{5,7})\b/);
    if (price && /מחיר/i.test(message) && !/לסוחר|b2b/i.test(message)) {
      // Prefer dealer price when in inventory context wording "מחיר"
      facts.b2bPrice = parseInt(price[1], 10);
    } else if (price && !/ק.?מ|קילומטר/i.test(message)) {
      facts.retailPrice = parseInt(price[1], 10);
    }
  }

  if (ownership && ownership !== "skip") {
    if (ownership.ownershipHand != null) {
      facts.ownershipHand = ownership.ownershipHand;
    }
    if (ownership.ownershipType) facts.ownershipType = ownership.ownershipType;
  }

  const color = message.match(/צבע\s+([^\s,]+)/i);
  if (color) facts.color = color[1];
  else if (/שחור|לבן|אפור|כסף|אדום|כחול/i.test(message)) {
    const c = message.match(/(שחור|לבן|אפור|כסף|אדום|כחול)/i);
    if (c) facts.color = c[1];
  }

  const exclusions: string[] = [];
  if (/לא\s*קרוס|לא\s*cross/i.test(message)) exclusions.push("Corolla Cross");
  if (/לא\s*היבריד|לא\s*הייבריד|לא\s*hybrid/i.test(message)) {
    exclusions.push("hybrid");
  }
  if (/בלי\s*גג/i.test(message)) exclusions.push("panoramic_roof");
  if (/לא\s*ליסינג/i.test(message)) exclusions.push("leasing");
  if (/לא\s*יד\s*2/i.test(message)) exclusions.push("hand_2");
  if (exclusions.length) facts.exclusions = exclusions;

  // "לא קרוס" with קורולה → keep Corolla, reject Cross
  if (/קורולה/i.test(message) && /לא\s*קרוס/i.test(message)) {
    facts.model = "Corolla";
    facts.make = facts.make ?? "Toyota";
  }

  return facts;
}

function hasAnyFact(f?: TurnInventoryFacts): boolean {
  if (!f) return false;
  return Object.entries(f).some(([k, v]) => {
    if (k === "exclusions" || k === "notes") return false;
    return v != null && v !== "";
  });
}

/**
 * Detect if a message is a context question about the active work.
 * Returns the QuestionAbout category or null if not a context question.
 *
 * IMPORTANT: "לא חסר?" is a QUESTION (Hebrew rhetorical form), NOT rejection.
 * Patterns are conservative — when in doubt, return null and let AI classify.
 */
function detectContextQuestion(m: string): QuestionAbout | null {
  // CAN_PROCEED: "אפשר לשמור ככה?" / "אפשר להמשיך?" / "נוכל לשמור?"
  if (/אפשר\s*(לשמור|להמשיך|לסגור|לאשר)|נוכל\s*לשמור/i.test(m)) {
    return "CAN_PROCEED";
  }

  // COMPLETENESS: "לא חסר מידע?" / "זה מספיק?" / "יש מספיק?" / "מספיק מה שנתתי?"
  if (
    /(?:לא\s*)?חסר\s*מידע\??|זה\s*מספיק\??|יש\s*מספיק\??|מספיק\s*מה\s*ש|האם\s*מספיק|מספיק\s*(?:ככה|כך)\??/i.test(
      m
    )
  ) {
    return "COMPLETENESS";
  }

  // MISSING_FIELDS: "מה עוד חסר?" / "מה חסר ברכב?" / "מה אתה צריך עוד?"
  if (
    /מה\s*עוד\s*(?:חסר|צריך)|מה\s*אתה\s*צריך\s*עוד|עוד\s*מה\s*חסר|מה\s*חסר\s*עוד|מה\s*חסר(?:\s*ברכב|\s*פה)?\??/i.test(
      m
    )
  ) {
    return "MISSING_FIELDS";
  }

  // CURRENT_STATE: "מה כבר רשמת?" / "מה אמרתי לך עד עכשיו?" / "מה יש לך עד עכשיו?"
  if (
    /מה\s*כבר\s*רשמת|מה\s*(?:אמרתי|נתתי)\s*לך|מה\s*יש\s*לך\s*עד\s*עכשיו|מה\s*יודע\s*על\s*הרכב/i.test(
      m
    )
  ) {
    return "CURRENT_STATE";
  }

  // SPECIFIC_FIELD: "איזה מחיר רשמת?" / "רשמתי לך קילומטר?" / "מה המחיר שנתתי?"
  if (
    /(?:איזה|מה|כמה)\s+(?:מחיר|קילומטר|ק.?מ|שנה|צבע|גימור|בעלות)\s*(?:רשמת|כתבת|יש לך|אמרתי|נתתי)\??|רשמתי\s*לך\s*(?:קילומטר|מחיר|שנה|צבע)/i.test(
      m
    )
  ) {
    return "SPECIFIC_FIELD";
  }

  // REQUIREMENT: "חייב מחיר?" / "חובה קילומטר?" / "האם חייב לכתוב?"
  if (/חייב\s+(?:מחיר|קילומטר|ק.?מ|שנה|צבע|גימור)\??|חובה\s+(?:לכתוב|להכניס|לרשום|מחיר|קילומטר)\??/i.test(m)) {
    return "REQUIREMENT";
  }

  // WHY_NEEDED: "למה צריך מחיר לסוחר?" / "למה אתה צריך את זה?"
  if (/למה\s*(?:צריך|אתה\s*צריך|נצרך|חשוב)\s*(?:את\s*זה|מחיר|קילומטר|הגימור|הצבע|הבעלות)/i.test(m)) {
    return "WHY_NEEDED";
  }

  return null;
}

/**
 * Detect general advisory / knowledge questions about listing or matching.
 * NOT about the specific current draft state — use CONTEXT_QUESTION for those.
 * Runs when inventory workspace is active; may coexist with an open draft.
 */
function detectAdvisoryQuestion(m: string): QuestionAbout | null {
  // LISTING_GUIDANCE: "מה הכי חשוב בפרטי מודעה?" / "מה חשוב לרשום?"
  if (
    /מה\s*(?:ה)?כי\s*חשוב|מה\s*חשוב\s*(?:ל)?(?:רשום|במודעה|בפרטי)|איך\s*כדאי\s*ל(?:תאר|רשום)|מה\s*לרשום\s*במודעה/i.test(
      m
    )
  ) {
    return "LISTING_GUIDANCE";
  }

  // MATCHING_TIPS: "איזה פרטים עוזרים להתאמה?" / "מה משפר התאמות?"
  if (
    /(?:איזה|מה)\s*פרטים\s*(?:ה)?כי\s*עוזר|מה\s*(?:משפר|מגדיל|מעלה)\s*(?:את\s*)?(?:ה)?התאמ|כדאי\s*להוסיף\s*(?:מחיר|קילומטר|גימור)/i.test(
      m
    )
  ) {
    return "MATCHING_TIPS";
  }

  // General "why is X important" without referencing current draft
  if (
    /למה\s*(?:חשוב|כדאי|שווה)\s*(?:ל)?(?:רשום|להוסיף|לכתוב)/i.test(m) &&
    !/רשמת|יש\s*לך|אמרתי/i.test(m)
  ) {
    return "GENERAL_ADVISORY";
  }

  // Ends with ? and asks for advice/guidance (not a field value)
  if (
    /\?\s*$/.test(m) &&
    /(?:מה|איך|למה|כדאי|חשוב|מומלץ|עוזר|הכרחי)/i.test(m) &&
    !/(?:רשמת|כתבת|יש\s*לך|אמרתי|נתתי)/i.test(m) &&
    !/\b(טויוטה|יונדאי|מאזדה|קורולה|אודי|BMW|מרcedes|הונדה|נissan|פולקס|סקודה|קיה|רenault)\b/i.test(m) &&
    !/\b(20\d{2}|\d{2})\b/.test(m) &&
    !/\d{4,}/.test(m)
  ) {
    return "GENERAL_ADVISORY";
  }

  return null;
}

/** Deterministic / fallback interpretation — never invents. */
export function interpretTurnFallback(params: {
  message: string;
  conversation?: ConversationState;
  inventoryMode?: boolean;
}): StructuredTurnEvent {
  const m = params.message.trim();
  const pendingDraft = params.conversation?.pendingInventoryDraft;
  const pendingMutation = params.conversation?.pendingInventoryMutation;
  const suspended = params.conversation?.suspendedContext;
  const lastQ = params.conversation?.lastAgentQuestion;

  if (isConfirmation(m)) {
    return {
      relation: "CONFIRMATION",
      intent: "continue_current",
      targetCapability: pendingDraft || pendingMutation ? "inventory" : "unknown",
      confirms: true,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
  }

  if (isRejection(m) || /^(בטל|ביטול)$/i.test(m)) {
    return {
      relation: "CANCEL",
      intent: "continue_current",
      targetCapability: pendingDraft || pendingMutation ? "inventory" : "unknown",
      confirms: false,
      cancels: true,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
  }

  if (isSkipAnswer(m)) {
    return {
      relation: "SKIP",
      intent: "continue_current",
      targetCapability: "inventory",
      confirms: false,
      cancels: false,
      skipRequested: true,
      resumeRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
  }

  // Wording correction about year phrasing
  if (
    /מאיזו\s*שנה|איזו\s*שנה/i.test(m) &&
    /לא|תגיד|אלא|שאלה|הגיונ/i.test(m) &&
    !/\b(20\d{2}|\d{2})\b/.test(m)
  ) {
    return {
      relation: "WORDING_CORRECTION",
      intent: "continue_current",
      targetCapability: "inventory",
      preferredWording: "איזו שנה?",
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
  }

  // Mode correction: not a search, inventory upload
  if (
    /לא\s*חיפוש|זה\s*לא\s*חיפוש|מעלה\s*מלאי|העלאת\s*מלאי|זה\s*מלאי/i.test(m)
  ) {
    return {
      relation: "CORRECTION",
      intent: "create_inventory",
      targetCapability: "inventory",
      rejectedInterpretations: ["search_demand"],
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
  }

  // Resume suspended inventory
  if (
    /תמשיך|חזור\s*למלאי|איפה\s*עצרנו|הרכב\s*הקודם|עם\s*הקורולה|המשך/i.test(m) &&
    (suspended || pendingDraft)
  ) {
    return {
      relation: "RESUME",
      intent: "continue_current",
      targetCapability: "inventory",
      resumeRequested: true,
      confirms: false,
      cancels: false,
      skipRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
  }

  // Topic switch to matches / state
  if (/כמה\s*התאמ|מה\s*ההתאמ|יש\s*התאמ|התאמות\s*יש/i.test(m)) {
    return {
      relation: pendingDraft || pendingMutation ? "TOPIC_SWITCH" : "NEW_REQUEST",
      intent: "read_matches",
      targetCapability: "matches",
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
  }

  if (/כמה.*מלאי|מה יש לי|דורש טיפול|המלאי שלי/i.test(m)) {
    return {
      relation: "NEW_REQUEST",
      intent: "read_state",
      targetCapability: "inventory",
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
  }

  // Sold rejection → unavailable
  if (
    pendingMutation?.type === "MARK_SOLD" &&
    /לא.*נמכר|רק\s*לא\s*זמינ|לא\s*זמינ/i.test(m)
  ) {
    return {
      relation: "REJECTION",
      intent: "mark_unavailable",
      targetCapability: "inventory",
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
  }

  // Correction of Cross → Corolla
  if (/לא\s*קרוס|לא\s*cross/i.test(m) && /קורולה|corolla|רגילה/i.test(m)) {
    const facts = extractFactsDeterministic(m);
    facts.model = "Corolla";
    facts.make = facts.make ?? "Toyota";
    return {
      relation: "CORRECTION",
      intent: "continue_current",
      targetCapability: "inventory",
      correctedFacts: facts,
      extractedFacts: facts,
      rejectedInterpretations: ["Corolla Cross", "Cross"],
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
  }

  // Context question detection — dealer asks about active work
  if (pendingDraft || pendingMutation) {
    const ctxQ = detectContextQuestion(m);
    if (ctxQ) {
      return {
        relation: "CONTEXT_QUESTION",
        intent: "continue_current",
        targetCapability: "inventory",
        questionAbout: ctxQ,
        confirms: false,
        cancels: false,
        skipRequested: false,
        resumeRequested: false,
        confidence: { overall: "medium" },
        source: "deterministic",
      };
    }
  }

  // Advisory question — general product/commercial knowledge (may coexist with draft)
  if (params.inventoryMode || pendingDraft) {
    const advisory = detectAdvisoryQuestion(m);
    if (advisory) {
      return {
        relation: "ADVISORY_QUESTION",
        intent: "help",
        targetCapability: "inventory",
        questionAbout: advisory,
        confirms: false,
        cancels: false,
        skipRequested: false,
        resumeRequested: false,
        confidence: { overall: "medium" },
        source: "deterministic",
      };
    }
  }

  const facts = extractFactsDeterministic(m);
  const selection = m.match(/^(\d+)$/);
  const selectionIndex = selection ? parseInt(selection[1], 10) : undefined;

  if (pendingMutation?.status === "WAITING_SELECTION" && selectionIndex) {
    return {
      relation: "ANSWER",
      intent: "continue_current",
      targetCapability: "inventory",
      extractedFacts: hasAnyFact(facts) ? facts : undefined,
      targetObject: { selectionIndex },
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
  }

  if (hasAnyFact(facts) || /לא\s*קרוס|לא\s*היבריד|בלי\s*גג/i.test(m)) {
    const relation: TurnRelation =
      pendingDraft || lastQ
        ? /לא\s|בלי\s|תקן|בעצם|רגילה/i.test(m)
          ? "CORRECTION"
          : "ADDITIONAL_INFO"
        : "NEW_REQUEST";
    return {
      relation,
      intent:
        params.inventoryMode || pendingDraft
          ? "create_inventory"
          : "continue_current",
      targetCapability: "inventory",
      extractedFacts: facts,
      correctedFacts: relation === "CORRECTION" ? facts : undefined,
      rejectedInterpretations: facts.exclusions,
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "medium" },
      source: "fallback",
    };
  }

  if (params.inventoryMode || pendingDraft) {
    // Question-shaped message in inventory workspace — do NOT assume create_inventory intent
    const looksLikeQuestion =
      /\?\s*$/.test(m) ||
      /^(?:מה|איך|למה|האם|כדאי|מומלץ)/i.test(m);
    return {
      relation: pendingDraft ? "UNKNOWN" : looksLikeQuestion ? "ADVISORY_QUESTION" : "NEW_REQUEST",
      intent: looksLikeQuestion ? "help" : "create_inventory",
      targetCapability: "inventory",
      questionAbout: looksLikeQuestion ? "GENERAL_ADVISORY" : null,
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "low" },
      needsClarification: true,
      clarificationReason: looksLikeQuestion
        ? "unparsed_advisory_question"
        : "unparsed_inventory_message",
      source: "fallback",
    };
  }

  return {
    relation: "NEW_REQUEST",
    intent: "unknown",
    targetCapability: "broker",
    confirms: false,
    cancels: false,
    skipRequested: false,
    resumeRequested: false,
    confidence: { overall: "low" },
    source: "fallback",
  };
}

function sanitizeFacts(raw: unknown): TurnInventoryFacts | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: TurnInventoryFacts = {};
  const str = (k: string) =>
    typeof o[k] === "string" ? (o[k] as string) : undefined;
  const num = (k: string) =>
    typeof o[k] === "number"
      ? (o[k] as number)
      : typeof o[k] === "string" && /^\d+$/.test(o[k] as string)
        ? parseInt(o[k] as string, 10)
        : undefined;
  if (str("make")) out.make = str("make")!;
  if (str("model")) out.model = str("model")!;
  if (str("trim")) out.trim = str("trim")!;
  if (num("year") != null) out.year = num("year");
  if (num("mileage") != null) out.mileage = num("mileage");
  if (str("color")) out.color = str("color")!;
  if (num("ownershipHand") != null) out.ownershipHand = num("ownershipHand");
  if (str("ownershipType")) out.ownershipType = str("ownershipType")!;
  if (num("retailPrice") != null) out.retailPrice = num("retailPrice");
  if (num("b2bPrice") != null) out.b2bPrice = num("b2bPrice");
  if (str("region")) out.region = str("region")!;
  if (str("notes")) out.notes = str("notes")!;
  if (Array.isArray(o.exclusions)) {
    out.exclusions = o.exclusions.filter((x) => typeof x === "string") as string[];
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Interpret current free-text turn BEFORE pending locks decide.
 * One structured AI call when configured; deterministic fallback otherwise.
 */
export async function interpretAgentTurn(params: {
  message: string;
  userId?: string;
  conversation?: ConversationState;
  inventoryMode?: boolean;
}): Promise<StructuredTurnEvent> {
  const fallback = interpretTurnFallback(params);

  // Unambiguous machine CTAs — skip AI
  if (
    fallback.source === "deterministic" &&
    (fallback.relation === "CONFIRMATION" ||
      fallback.relation === "CANCEL" ||
      fallback.relation === "SKIP" ||
      fallback.relation === "WORDING_CORRECTION" ||
      fallback.relation === "RESUME" ||
      (fallback.relation === "TOPIC_SWITCH" && fallback.intent === "read_matches") ||
      (fallback.relation === "CORRECTION" &&
        fallback.rejectedInterpretations?.includes("search_demand")))
  ) {
    await logAiOperation({
      operation: "turn_interpret",
      promptVersion: AI_PROMPT_VERSIONS.turnInterpreter,
      success: true,
      userId: params.userId,
      usageJson: { source: "deterministic", relation: fallback.relation },
    });
    return fallback;
  }

  if (!isOpenAIConfigured()) {
    await logAiOperation({
      operation: "turn_interpret",
      promptVersion: AI_PROMPT_VERSIONS.turnInterpreter,
      success: true,
      userId: params.userId,
      usageJson: { source: "fallback", relation: fallback.relation },
    });
    return { ...fallback, source: "fallback" };
  }

  try {
    const draft = params.conversation?.pendingInventoryDraft;
    const mutation = params.conversation?.pendingInventoryMutation;
    const ctx = {
      message: params.message,
      inventoryMode: Boolean(params.inventoryMode),
      lastAgentQuestion: params.conversation?.lastAgentQuestion ?? null,
      pendingDraft: draft
        ? {
            status: draft.status,
            fields: draft.fields,
            lastAskedGap: draft.lastAskedGap ?? null,
            rejected: draft.rejectedInterpretations ?? [],
          }
        : null,
      pendingMutation: mutation
        ? {
            type: mutation.type,
            status: mutation.status,
            label: mutation.label,
            candidates: mutation.candidates?.slice(0, 5),
          }
        : null,
      suspended: params.conversation?.suspendedContext
        ? { kind: params.conversation.suspendedContext.kind }
        : null,
      heuristicHint: {
        relation: fallback.relation,
        intent: fallback.intent,
        facts: fallback.extractedFacts ?? null,
      },
    };

    const { data } = await callOpenAIStructured<{
      relation: TurnRelation;
      intent: StructuredTurnEvent["intent"];
      targetCapability: TurnCapability;
      questionAbout: QuestionAbout;
      extractedFacts: unknown;
      correctedFacts: unknown;
      rejectedInterpretations: string[];
      confirms: boolean;
      cancels: boolean;
      skipRequested: boolean;
      resumeRequested: boolean;
      preferredWording: string | null;
      needsClarification: boolean;
      clarificationReason: string | null;
      confidenceOverall: "high" | "medium" | "low";
      selectionIndex: number | null;
      referenceText: string | null;
    }>({
      operation: "turn_interpret",
      promptVersion: AI_PROMPT_VERSIONS.turnInterpreter,
      model: AI_MODELS.turnInterpreter,
      systemPrompt: `You interpret ONE dealer message for the REMATCHER Exchange Agent.

RELATIONS:
- ANSWER: dealer answers Agent's question (e.g. provides year/mileage/price)
- CORRECTION: dealer corrects a field value or Agent interpretation
- WORDING_CORRECTION: dealer corrects Agent phrasing (not a field value)
- ADDITIONAL_INFO: dealer adds info without being asked
- CONTEXT_QUESTION: dealer asks a question about the active work/draft
- ADVISORY_QUESTION: dealer asks general product/commercial advice (NOT about current draft state)
- TOPIC_SWITCH: dealer switches to a different capability (matches, searches, etc.)
- CONFIRMATION: explicit yes/confirm/save
- CANCEL: explicit no/cancel
- SKIP: dealer skips a field
- RESUME: dealer asks to return to suspended work
- REJECTION: dealer rejects a proposed interpretation
- NEW_REQUEST: new independent request

CONTEXT_QUESTION examples (dealer asks about active inventory draft):
- "לא חסר מידע?" → CONTEXT_QUESTION, questionAbout: COMPLETENESS
- "זה מספיק?" → CONTEXT_QUESTION, questionAbout: COMPLETENESS
- "מה עוד חסר?" → CONTEXT_QUESTION, questionAbout: MISSING_FIELDS
- "מה אתה צריך עוד?" → CONTEXT_QUESTION, questionAbout: MISSING_FIELDS
- "מה כבר רשמת?" → CONTEXT_QUESTION, questionAbout: CURRENT_STATE
- "מה אמרתי לך עד עכשיו?" → CONTEXT_QUESTION, questionAbout: CURRENT_STATE
- "איזה מחיר רשמת?" → CONTEXT_QUESTION, questionAbout: SPECIFIC_FIELD
- "רשמתי לך קילומטר?" → CONTEXT_QUESTION, questionAbout: SPECIFIC_FIELD
- "חייב מחיר?" → CONTEXT_QUESTION, questionAbout: REQUIREMENT
- "חובה קילומטר?" → CONTEXT_QUESTION, questionAbout: REQUIREMENT
- "למה צריך מחיר לסוחר?" → CONTEXT_QUESTION, questionAbout: WHY_NEEDED
- "אפשר לשמור ככה?" → CONTEXT_QUESTION, questionAbout: CAN_PROCEED
- "אפשר להמשיך?" → CONTEXT_QUESTION, questionAbout: CAN_PROCEED

ADVISORY_QUESTION examples (general knowledge, NOT about current draft):
- "מה הכי חשוב בפרטי מודעה?" → ADVISORY_QUESTION, questionAbout: LISTING_GUIDANCE
- "איזה פרטים הכי עוזרים להתאמה?" → ADVISORY_QUESTION, questionAbout: MATCHING_TIPS
- "כדאי להוסיף מחיר לסוחר?" → ADVISORY_QUESTION, questionAbout: MATCHING_TIPS
- "איך כדאי לתאר את הרכב?" → ADVISORY_QUESTION, questionAbout: LISTING_GUIDANCE

DISTINCTION:
- "מה חסר?" / "מה רשמת?" → CONTEXT_QUESTION (about active draft)
- "מה הכי חשוב במודעה?" → ADVISORY_QUESTION (general advice)

IMPORTANT: "לא חסר מידע?" contains "לא" but is a QUESTION (CONTEXT_QUESTION), NOT a rejection.
Hebrew "לא" in question form ≠ cancellation.

Extract vehicle facts when present. Honor negations (לא קרוס = reject Cross, keep Corolla if stated).
Never invent year/mileage/price/model.
Prefer מחיר לסוחר for dealer price when context is inventory listing.
Return JSON matching schema exactly. All required fields must be present (use null for optional fields).`,
      userContent: JSON.stringify(ctx),
      schemaName: "agent_turn_event",
      schema: TURN_SCHEMA as unknown as Record<string, unknown>,
      userId: params.userId,
    });

    const extracted =
      sanitizeFacts(data.extractedFacts) ?? fallback.extractedFacts;
    const corrected =
      sanitizeFacts(data.correctedFacts) ??
      (data.relation === "CORRECTION" ? extracted : undefined);

    // Merge deterministic exclusions if AI missed them
    const det = extractFactsDeterministic(params.message);
    if (det.exclusions?.length) {
      const rej = new Set([
        ...(data.rejectedInterpretations ?? []),
        ...(corrected?.exclusions ?? []),
        ...det.exclusions,
      ]);
      if (corrected) corrected.exclusions = [...rej];
    }

    return {
      relation: data.relation,
      intent: data.intent,
      targetCapability: data.targetCapability,
      questionAbout: data.questionAbout ?? null,
      extractedFacts: extracted,
      correctedFacts: corrected,
      rejectedInterpretations: [
        ...(data.rejectedInterpretations ?? []),
        ...(det.exclusions ?? []),
      ],
      targetObject:
        data.selectionIndex != null || data.referenceText
          ? {
              selectionIndex: data.selectionIndex ?? undefined,
              referenceText: data.referenceText ?? undefined,
            }
          : fallback.targetObject,
      confirms: data.confirms,
      cancels: data.cancels,
      skipRequested: data.skipRequested,
      resumeRequested: data.resumeRequested,
      preferredWording: data.preferredWording ?? null,
      needsClarification: data.needsClarification,
      clarificationReason: data.clarificationReason ?? undefined,
      confidence: { overall: data.confidenceOverall },
      source: "ai",
    };
  } catch (err: unknown) {
    // Observability: capture error class to detect schema / auth / network failures
    const errMsg =
      err instanceof Error ? err.message : typeof err === "string" ? err : "unknown";
    // Classify error for diagnostics
    const errClass = errMsg.includes("400")
      ? "schema_400"
      : errMsg.includes("401") || errMsg.includes("403")
        ? "auth_error"
        : errMsg.includes("429")
          ? "rate_limit"
          : errMsg.includes("timeout") || errMsg.includes("ETIMEDOUT")
            ? "timeout"
            : "other";

    await logAiOperation({
      operation: "turn_interpret",
      promptVersion: AI_PROMPT_VERSIONS.turnInterpreter,
      success: false,
      userId: params.userId,
      errorMessage: errMsg.slice(0, 300),
      usageJson: {
        fallback: true,
        errClass,
        agentVersion: "2.7",
        relation: fallback.relation,
      },
    });
    return { ...fallback, source: "fallback" };
  }
}

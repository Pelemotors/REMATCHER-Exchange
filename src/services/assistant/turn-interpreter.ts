import "server-only";
import type { ConversationState } from "@/services/assistant/conversation-state";
import {
  isConfirmation,
  isRejection,
} from "@/services/assistant/conversation-state";
import { isSkipAnswer } from "@/services/assistant/inventory-draft";
import type {
  QuestionAbout,
  StructuredTurnEvent,
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
  // INPUT_FORMAT / workflow help: template, multi-vehicle input format
  if (
    /טמפלייט|תבנית|פורמט/i.test(m) ||
    /כמה\s*רכבים\s*(?:ביחד|יחד|בהודעה|לשלוח|לכתוב|אפשר)/i.test(m) ||
    /(?:לכתוב|לשלוח|להזין)\s*(?:לך\s*)?(?:כמה|מספר)?\s*רכבים/i.test(m) ||
    /איך\s*(?:לכתוב|לשלוח|להזין|נוח\s*לשלוח)/i.test(m) ||
    /פרטי\s*רכב\s*שצריך/i.test(m) ||
    /(?:תן|תכין|יכול)\s*(?:לי\s*)?(?:טמפלייט|תבנית|פורמט|דוגמ)/i.test(m)
  ) {
    return "INPUT_FORMAT";
  }

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
      relation: pendingDraft
        ? "UNKNOWN"
        : looksLikeQuestion
          ? "ADVISORY_QUESTION"
          : "UNKNOWN",
      intent: looksLikeQuestion ? "help" : "unknown",
      targetCapability: pendingDraft ? "inventory" : "unknown",
      questionAbout: looksLikeQuestion ? "GENERAL_ADVISORY" : null,
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "low" },
      needsClarification: true,
      clarificationReason: looksLikeQuestion
        ? "unparsed_advisory_question"
        : "unparsed_free_text",
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

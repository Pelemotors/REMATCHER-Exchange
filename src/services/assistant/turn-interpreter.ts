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
  resolveVehicleShorthand,
} from "@/services/assistant/vehicle-shorthand";
import { parseOwnershipAnswer } from "@/services/assistant/inventory-draft";

const TURN_SCHEMA = {
  type: "object",
  properties: {
    relation: {
      type: "string",
      enum: [
        "NEW_REQUEST",
        "ANSWER",
        "CORRECTION",
        "REJECTION",
        "ADDITIONAL_INFO",
        "TOPIC_SWITCH",
        "CONFIRMATION",
        "CANCEL",
        "SKIP",
        "WORDING_CORRECTION",
        "RESUME",
        "UNKNOWN",
      ],
    },
    intent: {
      type: "string",
      enum: [
        "continue_current",
        "create_inventory",
        "update_inventory",
        "mark_sold",
        "mark_unavailable",
        "create_demand",
        "read_matches",
        "read_state",
        "help",
        "unknown",
      ],
    },
    targetCapability: {
      type: "string",
      enum: [
        "inventory",
        "matches",
        "searches",
        "opportunities",
        "activity",
        "validations",
        "broker",
        "unknown",
      ],
    },
    extractedFacts: {
      type: "object",
      properties: {
        make: { type: ["string", "null"] },
        model: { type: ["string", "null"] },
        year: { type: ["number", "null"] },
        mileage: { type: ["number", "null"] },
        b2bPrice: { type: ["number", "null"] },
        retailPrice: { type: ["number", "null"] },
        color: { type: ["string", "null"] },
        trim: { type: ["string", "null"] },
        ownershipType: { type: ["string", "null"] },
        notes: { type: ["string", "null"] },
        exclusions: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    correctedFacts: {
      type: "object",
      properties: {
        make: { type: ["string", "null"] },
        model: { type: ["string", "null"] },
        year: { type: ["number", "null"] },
        mileage: { type: ["number", "null"] },
        b2bPrice: { type: ["number", "null"] },
        retailPrice: { type: ["number", "null"] },
        color: { type: ["string", "null"] },
        trim: { type: ["string", "null"] },
        ownershipType: { type: ["string", "null"] },
        notes: { type: ["string", "null"] },
        exclusions: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    rejectedInterpretations: {
      type: "array",
      items: { type: "string" },
    },
    confirms: { type: "boolean" },
    cancels: { type: "boolean" },
    skipRequested: { type: "boolean" },
    resumeRequested: { type: "boolean" },
    preferredWording: { type: ["string", "null"] },
    needsClarification: { type: "boolean" },
    clarificationReason: { type: ["string", "null"] },
    confidenceOverall: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    selectionIndex: { type: ["number", "null"] },
    referenceText: { type: ["string", "null"] },
  },
  required: [
    "relation",
    "intent",
    "targetCapability",
    "confirms",
    "cancels",
    "skipRequested",
    "resumeRequested",
    "confidenceOverall",
  ],
  additionalProperties: false,
} as const;

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
    return {
      relation: pendingDraft ? "UNKNOWN" : "NEW_REQUEST",
      intent: "create_inventory",
      targetCapability: "inventory",
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "low" },
      needsClarification: true,
      clarificationReason: "unparsed_inventory_message",
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
      extractedFacts?: unknown;
      correctedFacts?: unknown;
      rejectedInterpretations?: string[];
      confirms: boolean;
      cancels: boolean;
      skipRequested: boolean;
      resumeRequested: boolean;
      preferredWording?: string | null;
      needsClarification?: boolean;
      clarificationReason?: string | null;
      confidenceOverall: "high" | "medium" | "low";
      selectionIndex?: number | null;
      referenceText?: string | null;
    }>({
      operation: "turn_interpret",
      promptVersion: AI_PROMPT_VERSIONS.turnInterpreter,
      model: AI_MODELS.turnInterpreter,
      systemPrompt: `You interpret ONE dealer message for the REMATCHER Exchange Agent.
Classify relation to the previous Agent turn (ANSWER, CORRECTION, WORDING_CORRECTION, TOPIC_SWITCH, etc.).
Extract vehicle facts when present. Honor negations (לא קרוס = reject Cross, keep Corolla if stated).
Never invent year/mileage/price/model.
Prefer מחיר לסוחר for dealer price when context is inventory listing.
WORDING_CORRECTION = user corrects Agent phrasing, not a field value.
TOPIC_SWITCH = user asks about matches/searches while inventory draft may be open.
Return JSON only.`,
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
  } catch {
    await logAiOperation({
      operation: "turn_interpret",
      promptVersion: AI_PROMPT_VERSIONS.turnInterpreter,
      success: false,
      userId: params.userId,
      errorMessage: "turn_interpret_failed",
      usageJson: { fallback: true },
    });
    return { ...fallback, source: "fallback" };
  }
}

import "server-only";
import type {
  ConversationState,
  PendingInventoryDraft,
} from "@/services/assistant/conversation-state";
import type { AgentMeta } from "@/services/assistant/tools/registry";
import type { AssistantResponse } from "@/services/assistant/orchestrator";
import {
  applyFields,
  buildStructuredSummary,
  hasInventoryIdentity,
  identityPartialMessage,
  isCommerciallyComplete,
  nextGapToAsk,
  openCommercialGaps,
  parseAmendment,
  readyForConfirmation,
} from "@/services/assistant/inventory-draft";
import { decideInventoryClarification } from "@/services/assistant/inventory-clarify";
import {
  createInventoryDraftFromText,
  executeConfirmInventoryCreate,
} from "@/services/assistant/tools/action-tools";
import type { QuestionAbout, StructuredTurnEvent } from "@/services/assistant/turn-event";
import {
  applyTurnToConversationState,
  draftFromTurnFacts,
  mergeFactsIntoDraft,
  shouldPreventRepeatedQuestion,
} from "@/services/assistant/turn-reconcile";
import { logAppEvent } from "@/services/notifications";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";

type InventoryTurnResponse = AssistantResponse & {
  conversation?: ConversationState;
  meta?: AgentMeta;
  inventoryMutationResult?: {
    type: "created" | "updated" | "sold";
    vehicleId: string;
  };
};

function confirmPayload(draft: PendingInventoryDraft) {
  return {
    action: "create_inventory",
    label: "לשמור רכב במלאי?",
    payload: { draft },
  };
}

function withTurnMemory(
  conversation: ConversationState,
  turn: StructuredTurnEvent | undefined,
  question?: { kind: string; text: string }
): ConversationState {
  if (!turn) return conversation;
  return applyTurnToConversationState(conversation, turn, {
    agentQuestion: question,
  });
}

function confirmResponse(
  draft: PendingInventoryDraft,
  meta: AgentMeta,
  baseConversation: ConversationState,
  turn: StructuredTurnEvent | undefined,
  message?: string
): InventoryTurnResponse {
  const summary = buildStructuredSummary(draft);
  const confirmed: PendingInventoryDraft = {
    ...draft,
    status: "WAITING_CONFIRMATION",
  };
  const prep = confirmPayload(confirmed);
  meta.responseType = "confirmation_inventory";
  const optionalHint =
    !draft.fields.color && !draft.fields.trim
      ? "\nאם תרצה, אפשר להשלים אחר כך גם רמת גימור וצבע."
      : "";
  const conversation = withTurnMemory(
    {
      ...baseConversation,
      pendingInventoryDraft: confirmed,
      pendingConfirmation: prep,
      sessionContext: {
        ...baseConversation.sessionContext,
        forcedIntent: "create_inventory",
        operatingMode: "inventory_management",
      },
      repeatedQuestionCount: 0,
    },
    turn,
    { kind: "confirm_create", text: "לשמור במלאי?" }
  );
  return {
    intent: "UPDATE_INVENTORY",
    message:
      message ??
      `מעולה.\n${summary}${optionalHint}\n\nלשמור במלאי?`,
    requiresConfirmation: prep,
    suggestions: [{ label: "שמור במלאי" }, { label: "ערוך" }],
    conversation,
    meta,
  };
}

async function askNextClarification(
  draft: PendingInventoryDraft,
  meta: AgentMeta,
  userId: string,
  baseConversation: ConversationState,
  turn: StructuredTurnEvent | undefined,
  prefix?: string
): Promise<InventoryTurnResponse> {
  const gap = nextGapToAsk(draft);

  if (!gap) return confirmResponse(draft, meta, baseConversation, turn);

  const gapKind = `gap_${gap}`;
  if (turn && shouldPreventRepeatedQuestion(baseConversation, gapKind, turn)) {
    meta.responseType = "inventory_flexible_fallback";
    await logAppEvent({
      eventType: "agent_repeated_question_prevented",
      dealerId: undefined,
      metadata: {
        agentVersion: AGENT_VERSION,
        gap,
        relation: turn.relation,
        failure: "REPEATED_QUESTION",
      },
    });
    const conversation = withTurnMemory(
      {
        ...baseConversation,
        pendingInventoryDraft: draft,
        sessionContext: {
          ...baseConversation.sessionContext,
          forcedIntent: "create_inventory",
          operatingMode: "inventory_management",
        },
        repeatedQuestionCount: 0,
      },
      turn
    );
    return {
      intent: "UPDATE_INVENTORY",
      message:
        "לא הצלחתי להבין את התיקון. כתוב לי איך נכון להבין את הרכב, ואני אעדכן.",
      conversation,
      suggestions: [{ label: "דלג" }, { label: "ערוך" }],
      meta,
    };
  }

  let question: string;
  if (gap === "year") {
    question = identityPartialMessage(draft.fields);
    const preferred = baseConversation.preferredClarificationWording?.year;
    if (preferred) {
      question = question.replace(/איזו שנה\?/, preferred);
    }
    if (prefix) question = `${prefix}\n${question}`;
  } else {
    const decision = await decideInventoryClarification({ draft, userId });
    if (!decision.gap) {
      return confirmResponse(draft, meta, baseConversation, turn);
    }
    question = `${prefix ? prefix + "\n" : ""}${decision.question}`;
    if (decision.source === "ai") {
      meta.tools = [...meta.tools, "inventory_clarification"];
    }
  }

  meta.responseType = "inventory_ask_gap";
  const conversation = withTurnMemory(
    {
      ...baseConversation,
      pendingInventoryDraft: { ...draft, lastAskedGap: gap },
      sessionContext: {
        ...baseConversation.sessionContext,
        forcedIntent: "create_inventory",
        operatingMode: "inventory_management",
      },
    },
    turn,
    { kind: gapKind, text: question }
  );

  return {
    intent: "UPDATE_INVENTORY",
    message: question,
    conversation,
    suggestions: [{ label: "לא יודע" }, { label: "דלג" }],
    meta,
  };
}

function promoteQueued(
  draft: PendingInventoryDraft
): PendingInventoryDraft | undefined {
  const queued = draft.queuedDrafts ?? [];
  if (queued.length === 0) return undefined;
  const [next, ...rest] = queued;
  return { ...next, queuedDrafts: rest };
}

const GAP_LABELS: Record<string, string> = {
  mileage: "קילומטראז׳",
  dealer_price: "מחיר לסוחר",
  ownership: "מקור הרכב (פרטי/ליסינג/חברה)",
  trim: "רמת גימור",
  color: "צבע",
  make: "יצרן",
  model: "דגם",
  year: "שנת ייצור",
};

/**
 * Answer a dealer's context question about the active inventory draft.
 * Uses ONLY deterministic draft truth — never hallucinates.
 * Preserves draft without mutation.
 */
function answerInventoryContextQuestion(
  draft: PendingInventoryDraft,
  questionAbout: QuestionAbout,
  meta: AgentMeta,
  baseConversation: ConversationState,
  turn: StructuredTurnEvent | undefined
): InventoryTurnResponse {
  const f = draft.fields;
  const summary = buildStructuredSummary(draft);
  const canSave = hasInventoryIdentity(draft.fields);
  const isComplete = isCommerciallyComplete(draft);
  const openGaps = openCommercialGaps(draft);
  const optionalGaps = openGaps.filter((g) => g === "trim" || g === "color");
  const commercialGaps = openGaps.filter((g) => g !== "trim" && g !== "color");

  meta.responseType = "inventory_context_question";

  let message: string;

  switch (questionAbout) {
    case "CAN_PROCEED":
    case "COMPLETENESS": {
      if (!canSave) {
        message = `עוד לא ניתן לשמור — חסר מידע בסיסי (${commercialGaps.map((g) => GAP_LABELS[g] ?? g).join(", ")}).`;
      } else if (isComplete) {
        const optional = optionalGaps.length
          ? `\nאפשר להשלים גם ${optionalGaps.map((g) => GAP_LABELS[g] ?? g).join(" ו-")} — לא חובה.`
          : "";
        message = `יש מספיק כדי לשמור.\n${summary}${optional}\n\nלשמור ככה?`;
      } else {
        const missing = commercialGaps.map((g) => GAP_LABELS[g] ?? g).join(", ");
        message = `יש מספיק כדי לשמור, אבל כדאי להשלים ${missing}.\n${summary}\n\nלשמור ככה?`;
      }
      break;
    }

    case "MISSING_FIELDS": {
      if (openGaps.length === 0) {
        message = `לא חסר כלום — יש הכל.\n${summary}`;
      } else {
        const required = commercialGaps.map((g) => GAP_LABELS[g] ?? g);
        const optional = optionalGaps.map((g) => GAP_LABELS[g] ?? g);
        const parts: string[] = [];
        if (required.length) parts.push(`כדאי להשלים: ${required.join(", ")}`);
        if (optional.length) parts.push(`אופציונלי: ${optional.join(", ")}`);
        message = parts.join("\n");
      }
      break;
    }

    case "CURRENT_STATE": {
      message = `הנה מה שיש לי עד עכשיו:\n${summary}`;
      const remaining = openGaps.length
        ? `\nחסר עוד: ${openGaps.map((g) => GAP_LABELS[g] ?? g).join(", ")}`
        : "\nזה הכל.";
      message += remaining;
      break;
    }

    case "SPECIFIC_FIELD": {
      // Summarize all known field values
      const known: string[] = [];
      if (f.make) known.push(`יצרן: ${f.make}`);
      if (f.model) known.push(`דגם: ${f.model}`);
      if (f.year) known.push(`שנה: ${f.year}`);
      if (f.mileage != null) known.push(`ק״מ: ${f.mileage.toLocaleString()}`);
      if (f.b2bPrice != null) known.push(`מחיר לסוחר: ${f.b2bPrice.toLocaleString()} ₪`);
      if (f.retailPrice != null) known.push(`מחיר לקוח: ${f.retailPrice.toLocaleString()} ₪`);
      if (f.color) known.push(`צבע: ${f.color}`);
      if (f.trim) known.push(`גימור: ${f.trim}`);
      if (f.ownershipType) known.push(`מקור: ${f.ownershipType}`);
      message = known.length
        ? `הנה הפרטים שרשומים:\n${known.join("\n")}`
        : "עדיין לא רשמתי פרטים.";
      break;
    }

    case "REQUIREMENT": {
      const required = commercialGaps.map((g) => GAP_LABELS[g] ?? g);
      if (required.length) {
        message = `${required.join(" ו-")} — שווה להשלים, עוזר לדייק התאמות. לא חובה לשמור, אבל ממליץ.`;
      } else {
        message = "לא חסר שום דבר הכרחי — הכל כבר מולא.";
      }
      break;
    }

    case "WHY_NEEDED": {
      message =
        "מחיר לסוחר ומקור הרכב עוזרים לנו לדייק את ההתאמות — Exchange מציג הרכב לקונים שמחפשים בטווח המחיר הנכון.";
      break;
    }

    default: {
      // OTHER or null — give current state as generic answer
      message = `הנה מה שיש לי:\n${summary}`;
      if (openGaps.length) {
        message += `\n\nחסר עוד: ${openGaps.map((g) => GAP_LABELS[g] ?? g).join(", ")}`;
      }
    }
  }

  // Preserve the pending draft — no mutation, status unchanged
  const conversation = withTurnMemory(
    {
      ...baseConversation,
      pendingInventoryDraft: draft,
      pendingConfirmation:
        draft.status === "WAITING_CONFIRMATION" ? confirmPayload(draft) : baseConversation.pendingConfirmation,
      sessionContext: {
        ...baseConversation.sessionContext,
        forcedIntent: "create_inventory",
        operatingMode: "inventory_management",
      },
    },
    turn,
    { kind: "context_question", text: message }
  );

  return {
    intent: "UPDATE_INVENTORY",
    message,
    conversation,
    suggestions:
      canSave && isComplete
        ? [{ label: "שמור במלאי" }, { label: "ערוך" }]
        : [{ label: "המשך" }, { label: "ערוך" }],
    meta,
  };
}

/**
 * Inventory create accompaniment — facts-first, turn-event driven.
 * parseGapAnswer is NOT the turn owner.
 */
export async function handleInventoryIngestTurn(params: {
  dealerId: string;
  userId: string;
  message: string;
  conversation?: ConversationState;
  meta: AgentMeta;
  forceStart?: boolean;
  turn?: StructuredTurnEvent;
}): Promise<InventoryTurnResponse | null> {
  const { meta } = params;
  const turn = params.turn;
  let baseConversation: ConversationState = {
    ...params.conversation,
  };
  const existing = baseConversation.pendingInventoryDraft;

  // --- WORDING CORRECTION (no field mutation) ---
  if (turn?.relation === "WORDING_CORRECTION" && existing) {
    await logAppEvent({
      eventType: "agent_correction_detected",
      dealerId: params.dealerId,
      metadata: {
        agentVersion: AGENT_VERSION,
        relation: "WORDING_CORRECTION",
        pending: true,
      },
    });
    const wording = turn.preferredWording ?? "איזו שנה?";
    baseConversation = {
      ...baseConversation,
      preferredClarificationWording: {
        ...baseConversation.preferredClarificationWording,
        year: wording.includes("?") ? wording : `${wording}?`,
      },
    };
    return askNextClarification(
      existing,
      meta,
      params.userId,
      baseConversation,
      turn,
      "צודק."
    );
  }

  // --- Mode / search rejection while drafting ---
  if (
    turn?.relation === "CORRECTION" &&
    turn.rejectedInterpretations?.includes("search_demand") &&
    existing
  ) {
    await logAppEvent({
      eventType: "agent_correction_detected",
      dealerId: params.dealerId,
      metadata: {
        agentVersion: AGENT_VERSION,
        relation: "CORRECTION",
        rejected: "search_demand",
      },
    });
    return askNextClarification(
      existing,
      meta,
      params.userId,
      baseConversation,
      turn,
      "ברור — ממשיכים עם המלאי."
    );
  }

  // --- WAITING_CONFIRMATION ---
  if (existing?.status === "WAITING_CONFIRMATION") {
    if (turn?.confirms || turn?.relation === "CONFIRMATION") {
      const result = await executeConfirmInventoryCreate(
        params.dealerId,
        existing
      );
      meta.responseType = "mutation_inventory_create";
      if (!result.ok) {
        return {
          intent: "UPDATE_INVENTORY",
          message: result.message ?? "לא הצלחתי לשמור את הרכב.",
          conversation: withTurnMemory(
            { ...baseConversation, pendingInventoryDraft: existing },
            turn
          ),
          meta,
        };
      }
      const title =
        `${result.vehicle.make ?? ""} ${result.vehicle.model ?? ""} ${result.vehicle.year ?? ""}`.trim();
      const nextQueued = promoteQueued(existing);
      if (nextQueued) {
        if (
          readyForConfirmation(nextQueued) &&
          hasInventoryIdentity(nextQueued.fields)
        ) {
          return confirmResponse(
            nextQueued,
            meta,
            baseConversation,
            turn,
            `נשמר${title ? `: ${title}` : ""}.\nהבא:\n${buildStructuredSummary(nextQueued)}\n\nלשמור גם אותו?`
          );
        }
        return askNextClarification(
          nextQueued,
          meta,
          params.userId,
          baseConversation,
          turn,
          `נשמר${title ? `: ${title}` : ""}. ממשיכים לרכב הבא.`
        );
      }
      return {
        intent: "UPDATE_INVENTORY",
        message: `נשמר במלאי${title ? `: ${title}` : ""}. רוצה להוסיף עוד רכב?`,
        suggestions: [
          { label: "הוסף עוד רכב" },
          { label: "למלאי", href: "/inventory" },
        ],
        conversation: withTurnMemory(
          {
            sessionContext: {
              forcedIntent: "create_inventory",
              operatingMode: "inventory_management",
            },
          },
          turn
        ),
        inventoryMutationResult: {
          type: "created" as const,
          vehicleId: result.vehicle.id,
        },
        meta,
      };
    }

    if (turn?.cancels || turn?.relation === "CANCEL") {
      if (/^ערוך$/i.test(params.message.trim())) {
        return {
          intent: "UPDATE_INVENTORY",
          message:
            "מה לתקן? לדוגמה: ק״מ 62000, מחיר לסוחר 134000, יד 1, צבע לבן",
          conversation: withTurnMemory(
            {
              ...baseConversation,
              pendingInventoryDraft: existing,
              pendingConfirmation: confirmPayload(existing),
            },
            turn
          ),
          meta,
        };
      }
      return {
        intent: "UPDATE_INVENTORY",
        message: "בוטל. הרכב לא נשמר. אפשר לשלוח שוב מתי שתרצה.",
        conversation: withTurnMemory(
          {
            sessionContext: { operatingMode: "inventory_management" },
          },
          turn
        ),
        meta,
      };
    }

    // 3. CONTEXT_QUESTION — dealer asks about the active draft (never mutates)
    if (turn?.relation === "CONTEXT_QUESTION") {
      await logAppEvent({
        eventType: "agent_context_question",
        dealerId: params.dealerId,
        metadata: {
          agentVersion: AGENT_VERSION,
          questionAbout: turn.questionAbout ?? "unknown",
          draftStatus: "WAITING_CONFIRMATION",
        },
      });
      return answerInventoryContextQuestion(
        existing,
        turn.questionAbout ?? "OTHER",
        meta,
        baseConversation,
        turn
      );
    }

    // 4. Merge facts / amendments while confirming
    if (
      turn?.extractedFacts ||
      turn?.correctedFacts ||
      turn?.relation === "CORRECTION" ||
      turn?.relation === "ADDITIONAL_INFO"
    ) {
      const updated = mergeFactsIntoDraft(existing, turn);
      if (readyForConfirmation(updated)) {
        return confirmResponse(
          updated,
          meta,
          baseConversation,
          turn,
          `עדכנתי.\n${buildStructuredSummary(updated)}\n\nלשמור במלאי?`
        );
      }
      return askNextClarification(
        updated,
        meta,
        params.userId,
        baseConversation,
        turn,
        "עדכנתי."
      );
    }

    const amendment = parseAmendment(params.message);
    if (amendment) {
      const updated = applyFields(existing, amendment);
      if (readyForConfirmation(updated)) {
        return confirmResponse(
          updated,
          meta,
          baseConversation,
          turn,
          `עדכנתי.\n${buildStructuredSummary(updated)}\n\nלשמור במלאי?`
        );
      }
      return askNextClarification(
        updated,
        meta,
        params.userId,
        baseConversation,
        turn,
        "עדכנתי."
      );
    }

    // 5. UNKNOWN + needsClarification — clarify naturally, do NOT repeat confirmation
    if (turn?.relation === "UNKNOWN" || (turn?.needsClarification && !turn?.confirms)) {
      meta.responseType = "inventory_clarify_intent";
      const conversation = withTurnMemory(
        {
          ...baseConversation,
          pendingInventoryDraft: existing,
          pendingConfirmation: confirmPayload(existing),
          sessionContext: {
            ...baseConversation.sessionContext,
            forcedIntent: "create_inventory",
            operatingMode: "inventory_management",
          },
        },
        turn
      );
      return {
        intent: "UPDATE_INVENTORY",
        message:
          "לא בטוח שהבנתי. אתה רוצה לשנות משהו ברכב, לשאול עליו משהו, או לשמור אותו כמו שהוא?",
        conversation,
        suggestions: [{ label: "שמור במלאי" }, { label: "ערוך" }, { label: "שאל" }],
        meta,
      };
    }

    // 6. Fallback — re-present confirmation (only for genuinely ambiguous free text)
    return confirmResponse(existing, meta, baseConversation, turn);
  }

  // --- DRAFT: merge turn facts (any order) ---
  if (existing?.status === "DRAFT") {
    let draft = existing;

    if (
      turn &&
      (turn.extractedFacts ||
        turn.correctedFacts ||
        turn.skipRequested ||
        turn.relation === "CORRECTION" ||
        turn.relation === "ADDITIONAL_INFO" ||
        turn.relation === "ANSWER" ||
        turn.relation === "SKIP")
    ) {
      draft = mergeFactsIntoDraft(existing, turn);
      draft = {
        ...draft,
        sourceText: `${existing.sourceText}\n${params.message}`.trim(),
      };
    } else if (turn?.relation === "UNKNOWN" || !turn) {
      // Soft merge via create path helpers without wiping known facts
      const started = await createInventoryDraftFromText(
        params.userId,
        params.message
      );
      draft = mergeFactsIntoDraft(existing, {
        relation: "ADDITIONAL_INFO",
        intent: "continue_current",
        targetCapability: "inventory",
        extractedFacts: {
          make: started.draft.fields.make ?? undefined,
          model: started.draft.fields.model ?? undefined,
          year: started.draft.fields.year ?? undefined,
          mileage: started.draft.fields.mileage ?? undefined,
          b2bPrice: started.draft.fields.b2bPrice ?? undefined,
          retailPrice: started.draft.fields.retailPrice ?? undefined,
          color: started.draft.fields.color ?? undefined,
          ownershipHand: started.draft.fields.ownershipHand ?? undefined,
          ownershipType: started.draft.fields.ownershipType ?? undefined,
          trim: started.draft.fields.trim ?? undefined,
        },
        confirms: false,
        cancels: false,
        skipRequested: false,
        resumeRequested: false,
        source: "fallback",
      });
    }

    if (!hasInventoryIdentity(draft.fields)) {
      return askNextClarification(
        draft,
        meta,
        params.userId,
        baseConversation,
        turn
      );
    }
    if (readyForConfirmation(draft)) {
      return confirmResponse(draft, meta, baseConversation, turn);
    }
    const prefix =
      turn?.relation === "CORRECTION"
        ? "עדכנתי."
        : turn?.extractedFacts || turn?.correctedFacts
          ? "קיבלתי."
          : undefined;
    return askNextClarification(
      draft,
      meta,
      params.userId,
      baseConversation,
      turn,
      prefix
    );
  }

  // --- Start new draft ---
  if (
    params.forceStart ||
    baseConversation.sessionContext?.forcedIntent === "create_inventory" ||
    turn?.intent === "create_inventory" ||
    params.message === "הוסף עוד רכב"
  ) {
    if (
      params.message === "הוסף עוד רכב" ||
      /^(הוסף עם הסוכן|הוספת מלאי)$/i.test(params.message.trim())
    ) {
      meta.responseType = "inventory_prompt";
      return {
        intent: "UPDATE_INVENTORY",
        message:
          "כתוב לי את הרכב כמו שנוח לך — למשל: קורולה 22, 62 אלף, 134 לסוחר.",
        conversation: withTurnMemory(
          {
            sessionContext: { forcedIntent: "create_inventory" },
          },
          turn
        ),
        meta,
      };
    }

    // Prefer turn facts when rich enough; else full normalize path
    if (
      turn &&
      (turn.extractedFacts || turn.correctedFacts) &&
      (turn.extractedFacts?.make ||
        turn.extractedFacts?.model ||
        turn.correctedFacts?.make ||
        turn.correctedFacts?.model)
    ) {
      let draft = draftFromTurnFacts(params.message, turn);
      // Enrich via normalizer without losing turn exclusions
      const started = await createInventoryDraftFromText(
        params.userId,
        params.message
      );
      draft = mergeFactsIntoDraft(started.draft, turn);
      draft = {
        ...draft,
        queuedDrafts: started.draft.queuedDrafts,
        sourceText: params.message,
      };

      meta.responseType = hasInventoryIdentity(draft.fields)
        ? readyForConfirmation(draft)
          ? "inventory_confirm"
          : "inventory_ask_gap"
        : "inventory_need_identity";

      if (!hasInventoryIdentity(draft.fields)) {
        return askNextClarification(
          draft,
          meta,
          params.userId,
          baseConversation,
          turn
        );
      }
      if (readyForConfirmation(draft)) {
        return confirmResponse(draft, meta, baseConversation, turn);
      }
      return askNextClarification(
        draft,
        meta,
        params.userId,
        baseConversation,
        turn
      );
    }

    return startFromText(params, turn, baseConversation);
  }

  return null;
}

async function startFromText(
  params: {
    dealerId: string;
    userId: string;
    message: string;
    meta: AgentMeta;
  },
  turn: StructuredTurnEvent | undefined,
  baseConversation: ConversationState
): Promise<InventoryTurnResponse> {
  const started = await createInventoryDraftFromText(
    params.userId,
    params.message
  );
  params.meta.responseType = `inventory_${started.phase}`;

  let draft = started.draft;
  if (turn) {
    draft = mergeFactsIntoDraft(draft, turn);
  }

  if (!hasInventoryIdentity(draft.fields) || started.phase === "need_identity") {
    return askNextClarification(
      draft,
      params.meta,
      params.userId,
      baseConversation,
      turn
    );
  }

  if (!readyForConfirmation(draft) || started.phase === "ask_gap") {
    return askNextClarification(
      draft,
      params.meta,
      params.userId,
      {
        ...baseConversation,
        // Keep multi-vehicle queue from starter
        pendingInventoryDraft: draft,
      },
      turn
    );
  }

  return confirmResponse(
    { ...draft, status: "WAITING_CONFIRMATION" },
    params.meta,
    baseConversation,
    turn,
    started.message?.includes("איזו שנה") || started.message?.includes("מאיזו")
      ? undefined
      : started.message
  );
}

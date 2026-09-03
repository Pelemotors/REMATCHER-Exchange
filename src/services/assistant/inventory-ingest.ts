import "server-only";
import type {
  ConversationState,
  PendingInventoryDraft,
} from "@/services/assistant/conversation-state";
import type { AgentMeta } from "@/services/assistant/tools/registry";
import type { AssistantResponse } from "@/services/assistant/orchestrator";
import {
  advanceDraftAfterGap,
  applyFields,
  buildStructuredSummary,
  gapQuestion,
  nextGapToAsk,
  parseAmendment,
  parseGapAnswer,
  readyForConfirmation,
} from "@/services/assistant/inventory-draft";
import {
  createInventoryDraftFromText,
  executeConfirmInventoryCreate,
} from "@/services/assistant/tools/action-tools";
import { isConfirmation, isRejection } from "@/services/assistant/conversation-state";

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

function confirmResponse(
  draft: PendingInventoryDraft,
  meta: AgentMeta,
  message?: string
): InventoryTurnResponse {
  const summary = buildStructuredSummary(draft);
  const confirmed: PendingInventoryDraft = {
    ...draft,
    status: "WAITING_CONFIRMATION",
  };
  const prep = confirmPayload(confirmed);
  meta.responseType = "confirmation_inventory";
  return {
    intent: "UPDATE_INVENTORY",
    message: message ?? `הבנתי:\n${summary}\n\nלשמור במלאי?`,
    requiresConfirmation: prep,
    suggestions: [{ label: "שמור במלאי" }, { label: "ערוך" }],
    conversation: {
      pendingInventoryDraft: confirmed,
      pendingConfirmation: prep,
      sessionContext: { forcedIntent: "create_inventory", operatingMode: "inventory_management" },
    },
    meta,
  };
}

function askGapResponse(
  draft: PendingInventoryDraft,
  meta: AgentMeta,
  prefix?: string
): InventoryTurnResponse {
  const gap = nextGapToAsk(draft);
  if (!gap) return confirmResponse(draft, meta);
  meta.responseType = "inventory_ask_gap";
  return {
    intent: "UPDATE_INVENTORY",
    message: `${prefix ? prefix + " " : ""}${gapQuestion(gap)}`,
    conversation: {
      pendingInventoryDraft: draft,
      sessionContext: { forcedIntent: "create_inventory" },
    },
    suggestions: [
      { label: "לא יודע" },
      { label: "דלג" },
    ],
    meta,
  };
}

/** Continue or start inventory draft turn */
export async function handleInventoryIngestTurn(params: {
  dealerId: string;
  userId: string;
  message: string;
  conversation?: ConversationState;
  meta: AgentMeta;
  /** Fresh start even if message looks like demand */
  forceStart?: boolean;
}): Promise<InventoryTurnResponse | null> {
  const { meta } = params;
  const existing = params.conversation?.pendingInventoryDraft;

  // --- WAITING_CONFIRMATION ---
  if (existing?.status === "WAITING_CONFIRMATION") {
    if (isConfirmation(params.message)) {
      const result = await executeConfirmInventoryCreate(
        params.dealerId,
        existing
      );
      meta.responseType = "mutation_inventory_create";
      if (!result.ok) {
        return {
          intent: "UPDATE_INVENTORY",
          message: result.message ?? "לא הצלחתי לשמור את הרכב.",
          conversation: { pendingInventoryDraft: existing },
          meta,
        };
      }
      const title = `${result.vehicle.make ?? ""} ${result.vehicle.model ?? ""} ${result.vehicle.year ?? ""}`.trim();
      return {
        intent: "UPDATE_INVENTORY",
        message: `נשמר במלאי${title ? `: ${title}` : ""}. רוצה להוסיף עוד רכב?`,
        suggestions: [
          { label: "הוסף עוד רכב" },
          { label: "למלאי", href: "/inventory" },
        ],
        conversation: {
          sessionContext: {
            forcedIntent: "create_inventory",
            operatingMode: "inventory_management",
          },
        },
        inventoryMutationResult: {
          type: "created" as const,
          vehicleId: result.vehicle.id,
        },
        meta,
      };
    }

    if (isRejection(params.message) || /^ערוך$/i.test(params.message.trim())) {
      if (/^ערוך$/i.test(params.message.trim())) {
        return {
          intent: "UPDATE_INVENTORY",
          message:
            "מה לתקן? לדוגמה: ק״מ 62000 או B2B 134000",
          conversation: {
            pendingInventoryDraft: existing,
            pendingConfirmation: confirmPayload(existing),
            sessionContext: {
              forcedIntent: "create_inventory",
              operatingMode: "inventory_management",
            },
          },
          meta,
        };
      }
      return {
        intent: "UPDATE_INVENTORY",
        message: "בוטל. הרכב לא נשמר. אפשר לשלוח שוב פרטי רכב מתי שתרצה.",
        conversation: {
          sessionContext: { operatingMode: "inventory_management" },
        },
        meta,
      };
    }

    const amendment = parseAmendment(params.message);
    if (amendment) {
      const updated = applyFields(existing, amendment);
      if (readyForConfirmation(updated)) {
        return confirmResponse(updated, meta, `עדכנתי.\n${buildStructuredSummary(updated)}\n\nלשמור במלאי?`);
      }
      return askGapResponse(updated, meta, "עדכנתי.");
    }

    // Unclear — re-show summary
    return confirmResponse(existing, meta);
  }

  // --- DRAFT with open gap ---
  if (existing?.status === "DRAFT") {
    if (!existing.fields.make || !existing.fields.model || !existing.fields.year) {
      // Still collecting identity — treat message as new source text
      return startFromText(params);
    }

    const gap = nextGapToAsk(existing);
    if (gap) {
      const parsed = parseGapAnswer(gap, params.message);
      if (parsed === null) {
        return {
          intent: "UPDATE_INVENTORY",
          message: `לא הבנתי. ${gapQuestion(gap)}`,
          conversation: {
            pendingInventoryDraft: existing,
            sessionContext: { forcedIntent: "create_inventory" },
          },
          suggestions: [{ label: "לא יודע" }, { label: "דלג" }],
          meta,
        };
      }
      const advanced = advanceDraftAfterGap(existing, gap, parsed);
      if (readyForConfirmation(advanced)) {
        return confirmResponse(advanced, meta);
      }
      return askGapResponse(advanced, meta, "קיבלתי.");
    }

    return confirmResponse(existing, meta);
  }

  // --- Start new draft ---
  if (
    params.forceStart ||
    params.conversation?.sessionContext?.forcedIntent === "create_inventory" ||
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
          "שלח את פרטי הרכב בטקסט חופשי (לדוגמה: טויוטה קורולה 2022 62 אלף 139000).",
        conversation: {
          sessionContext: { forcedIntent: "create_inventory" },
        },
        meta,
      };
    }
    return startFromText(params);
  }

  return null;
}

async function startFromText(params: {
  dealerId: string;
  userId: string;
  message: string;
  meta: AgentMeta;
}): Promise<InventoryTurnResponse> {
  const started = await createInventoryDraftFromText(
    params.userId,
    params.message
  );
  params.meta.responseType = `inventory_${started.phase}`;

  if (started.phase === "need_identity") {
    return {
      intent: "UPDATE_INVENTORY",
      message: started.message,
      conversation: {
        pendingInventoryDraft: started.draft,
        sessionContext: { forcedIntent: "create_inventory" },
      },
      meta: params.meta,
    };
  }

  if (started.phase === "ask_gap") {
    return {
      intent: "UPDATE_INVENTORY",
      message: started.message,
      conversation: {
        pendingInventoryDraft: started.draft,
        sessionContext: { forcedIntent: "create_inventory" },
      },
      suggestions: [{ label: "לא יודע" }, { label: "דלג" }],
      meta: params.meta,
    };
  }

  return confirmResponse(started.draft, params.meta, started.message);
}

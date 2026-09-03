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
  hasInventoryIdentity,
  identityPartialMessage,
  nextGapToAsk,
  parseAmendment,
  parseGapAnswer,
  readyForConfirmation,
  type InventoryGapId,
} from "@/services/assistant/inventory-draft";
import { decideInventoryClarification } from "@/services/assistant/inventory-clarify";
import {
  createInventoryDraftFromText,
  executeConfirmInventoryCreate,
} from "@/services/assistant/tools/action-tools";
import { isConfirmation, isRejection } from "@/services/assistant/conversation-state";
import { normalizeVehicle } from "@/services/ai/inventory-normalizer";
import { fieldsFromNormalized } from "@/services/inventory/create-vehicle";

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
  const optionalHint =
    !draft.fields.color && !draft.fields.trim
      ? "\nאם תרצה, אפשר להשלים אחר כך גם רמת גימור וצבע."
      : "";
  return {
    intent: "UPDATE_INVENTORY",
    message:
      message ??
      `מעולה.\n${summary}${optionalHint}\n\nלשמור במלאי?`,
    requiresConfirmation: prep,
    suggestions: [{ label: "שמור במלאי" }, { label: "ערוך" }],
    conversation: {
      pendingInventoryDraft: confirmed,
      pendingConfirmation: prep,
      sessionContext: {
        forcedIntent: "create_inventory",
        operatingMode: "inventory_management",
      },
    },
    meta,
  };
}

async function askGapResponse(
  draft: PendingInventoryDraft,
  meta: AgentMeta,
  userId: string,
  prefix?: string
): Promise<InventoryTurnResponse> {
  const decision = await decideInventoryClarification({ draft, userId });
  if (!decision.gap) return confirmResponse(draft, meta);
  meta.responseType = "inventory_ask_gap";
  if (decision.source === "ai") {
    meta.tools = [...meta.tools, "inventory_clarification"];
  }
  return {
    intent: "UPDATE_INVENTORY",
    message: `${prefix ? prefix + "\n" : ""}${decision.question}`,
    conversation: {
      pendingInventoryDraft: { ...draft, lastAskedGap: decision.gap },
      sessionContext: { forcedIntent: "create_inventory" },
    },
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
      const title =
        `${result.vehicle.make ?? ""} ${result.vehicle.model ?? ""} ${result.vehicle.year ?? ""}`.trim();
      const nextQueued = promoteQueued(existing);
      if (nextQueued) {
        if (readyForConfirmation(nextQueued) && hasInventoryIdentity(nextQueued.fields)) {
          return confirmResponse(
            nextQueued,
            meta,
            `נשמר${title ? `: ${title}` : ""}.\nהבא:\n${buildStructuredSummary(nextQueued)}\n\nלשמור גם אותו?`
          );
        }
        return askGapResponse(
          nextQueued,
          meta,
          params.userId,
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
            "מה לתקן? לדוגמה: ק״מ 62000, מחיר לסוחר 134000, יד 1, צבע לבן",
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
        message: "בוטל. הרכב לא נשמר. אפשר לשלוח שוב מתי שתרצה.",
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
        return confirmResponse(
          updated,
          meta,
          `עדכנתי.\n${buildStructuredSummary(updated)}\n\nלשמור במלאי?`
        );
      }
      return askGapResponse(updated, meta, params.userId, "עדכנתי.");
    }

    return confirmResponse(existing, meta);
  }

  // --- DRAFT ---
  if (existing?.status === "DRAFT") {
    if (!hasInventoryIdentity(existing.fields)) {
      return mergeIdentityAnswer(params, existing);
    }

    const gap = nextGapToAsk(existing);
    if (gap) {
      const parsed = parseGapAnswer(gap, params.message);
      if (parsed === null) {
        const decision = await decideInventoryClarification({
          draft: existing,
          userId: params.userId,
        });
        return {
          intent: "UPDATE_INVENTORY",
          message: `לא תפסתי. ${decision.question}`,
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
      return askGapResponse(advanced, meta, params.userId, "קיבלתי.");
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
          "כתוב לי את הרכב כמו שנוח לך — למשל: קורולה 22, 62 אלף, 134 לסוחר.",
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

async function mergeIdentityAnswer(
  params: {
    dealerId: string;
    userId: string;
    message: string;
    meta: AgentMeta;
  },
  existing: PendingInventoryDraft
): Promise<InventoryTurnResponse> {
  const gap = nextGapToAsk(existing) as InventoryGapId | null;
  // Prefer answering the missing identity field from the short reply
  if (gap && (gap === "make" || gap === "model" || gap === "year")) {
    const parsed = parseGapAnswer(gap, params.message);
    if (parsed && parsed !== "skip") {
      const merged = applyFields(existing, parsed);
      if (!hasInventoryIdentity(merged.fields)) {
        return {
          intent: "UPDATE_INVENTORY",
          message: identityPartialMessage(merged.fields),
          conversation: {
            pendingInventoryDraft: merged,
            sessionContext: { forcedIntent: "create_inventory" },
          },
          meta: params.meta,
        };
      }
      if (readyForConfirmation(merged)) {
        return confirmResponse(merged, params.meta);
      }
      return askGapResponse(merged, params.meta, params.userId, "הבנתי.");
    }
  }

  // Merge full re-normalization onto existing known fields (no wipe)
  const normalized = await normalizeVehicle(params.message, params.userId);
  const mapped = fieldsFromNormalized(normalized);
  const patch: Partial<typeof existing.fields> = {};
  if (mapped.make && !existing.fields.make) patch.make = mapped.make;
  if (mapped.model && !existing.fields.model) patch.model = mapped.model;
  if (mapped.year && !existing.fields.year) patch.year = mapped.year;
  if (mapped.mileage != null && existing.fields.mileage == null) {
    patch.mileage = mapped.mileage;
  }
  if (mapped.b2bPrice != null && existing.fields.b2bPrice == null) {
    patch.b2bPrice = mapped.b2bPrice;
  }
  // Bare model answer when make+year known
  if (
    !mapped.model &&
    existing.fields.make &&
    !existing.fields.model &&
    params.message.trim().length < 40
  ) {
    patch.model = params.message.trim();
  }

  const merged = applyFields(existing, patch);
  merged.sourceText = `${existing.sourceText}\n${params.message}`.trim();

  if (!hasInventoryIdentity(merged.fields)) {
    return {
      intent: "UPDATE_INVENTORY",
      message: identityPartialMessage(merged.fields),
      conversation: {
        pendingInventoryDraft: merged,
        sessionContext: { forcedIntent: "create_inventory" },
      },
      meta: params.meta,
    };
  }
  if (readyForConfirmation(merged)) {
    return confirmResponse(merged, params.meta);
  }
  return askGapResponse(merged, params.meta, params.userId, "הבנתי.");
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

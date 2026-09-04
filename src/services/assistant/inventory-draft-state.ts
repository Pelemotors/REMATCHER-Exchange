import type { ConversationState } from "@/services/assistant/conversation-state";
import {
  emptyDraftFields,
  hasInventoryIdentity,
  type InventoryDraftFields,
  type PendingInventoryDraft,
} from "@/services/assistant/inventory-draft";

/**
 * Conversational inventory draft state for the universal Agent.
 *
 * This module deliberately does NOT interpret user language, classify intent,
 * choose the next question, or score commercial completeness. GPT owns those
 * decisions. REMATCHER only validates structured facts and stores draft state.
 */

export type InventoryDraftPatch = Partial<InventoryDraftFields>;

const FIELD_NAMES = [
  "make",
  "model",
  "trim",
  "year",
  "mileage",
  "color",
  "ownershipHand",
  "ownershipType",
  "retailPrice",
  "b2bPrice",
  "region",
] as const satisfies ReadonlyArray<keyof InventoryDraftFields>;

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

/** Accept only known typed fields. No text parsing, regex, inference, or heuristics. */
export function sanitizeInventoryDraftFacts(
  facts: Record<string, unknown> | null | undefined
): InventoryDraftPatch {
  if (!facts) return {};
  const patch: InventoryDraftPatch = {};

  for (const field of FIELD_NAMES) {
    if (!(field in facts)) continue;
    const value = facts[field];
    switch (field) {
      case "year":
      case "mileage":
      case "ownershipHand":
      case "retailPrice":
      case "b2bPrice": {
        const parsed = nullableNumber(value);
        if (parsed !== undefined) {
          (patch as Record<string, unknown>)[field] = parsed;
        }
        break;
      }
      default: {
        const parsed = nullableString(value);
        if (parsed !== undefined) {
          (patch as Record<string, unknown>)[field] = parsed;
        }
      }
    }
  }

  return patch;
}

function newDraft(sourceText = ""): PendingInventoryDraft {
  return {
    status: "DRAFT",
    sourceText,
    fields: emptyDraftFields(),
    askedGaps: [],
    skippedGaps: [],
  };
}

export function inventoryDraftSnapshot(draft: PendingInventoryDraft) {
  const missingIdentity: Array<"make" | "model" | "year"> = [];
  if (!draft.fields.make) missingIdentity.push("make");
  if (!draft.fields.model) missingIdentity.push("model");
  if (!draft.fields.year) missingIdentity.push("year");

  return {
    status: draft.status,
    fields: draft.fields,
    canSave: hasInventoryIdentity(draft.fields),
    missingIdentity,
  };
}

export function applyInventoryDraftFacts(params: {
  conversation?: ConversationState;
  facts: Record<string, unknown> | null | undefined;
  sourceText?: string;
}): {
  conversation: ConversationState;
  draft: PendingInventoryDraft;
  snapshot: ReturnType<typeof inventoryDraftSnapshot>;
  acceptedFields: string[];
} {
  const patch = sanitizeInventoryDraftFacts(params.facts);
  const existing = params.conversation?.pendingInventoryDraft ?? newDraft();
  const acceptedFields = Object.keys(patch);
  const sourceText = [existing.sourceText, params.sourceText]
    .filter(Boolean)
    .join("\n")
    .trim();

  const draft: PendingInventoryDraft = {
    ...existing,
    status: "DRAFT",
    sourceText,
    fields: {
      ...existing.fields,
      ...patch,
    },
  };

  const pendingConfirmation =
    params.conversation?.pendingConfirmation?.action === "create_inventory"
      ? undefined
      : params.conversation?.pendingConfirmation;

  const conversation: ConversationState = {
    ...params.conversation,
    pendingInventoryDraft: draft,
    pendingConfirmation,
    sessionContext: {
      ...params.conversation?.sessionContext,
      operatingMode: "inventory_management",
    },
  };

  return {
    conversation,
    draft,
    snapshot: inventoryDraftSnapshot(draft),
    acceptedFields,
  };
}

export function prepareInventoryDraftConfirmation(
  conversation: ConversationState
): ConversationState | null {
  const draft = conversation.pendingInventoryDraft;
  if (!draft || !hasInventoryIdentity(draft.fields)) return null;

  const confirmed: PendingInventoryDraft = {
    ...draft,
    status: "WAITING_CONFIRMATION",
  };

  return {
    ...conversation,
    pendingInventoryDraft: confirmed,
    pendingConfirmation: {
      action: "create_inventory",
      label: "לשמור רכב במלאי?",
      payload: { draft: confirmed },
    },
  };
}

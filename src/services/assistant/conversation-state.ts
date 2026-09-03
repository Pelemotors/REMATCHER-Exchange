export interface ConversationListItem {
  id: string;
  title: string;
  type: "demand" | "validation" | "match" | "opportunity";
}

export interface PendingConfirmation {
  action: string;
  label: string;
  payload: Record<string, unknown>;
}

export interface SessionContext {
  operatingMode?: "broker_only";
  /** Forced intent from UI CTA — e.g. inventory page "הוסף עם הסוכן" */
  forcedIntent?: "create_inventory";
}

export type InventoryGapId = "mileage" | "b2b_price";

export interface InventoryDraftFields {
  make: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  mileage: number | null;
  color: string | null;
  ownershipHand: number | null;
  retailPrice: number | null;
  b2bPrice: number | null;
  region: string | null;
}

/** Explicit structured draft — not free-form chat memory */
export interface PendingInventoryDraft {
  status: "DRAFT" | "WAITING_CONFIRMATION";
  sourceText: string;
  fields: InventoryDraftFields;
  askedGaps: InventoryGapId[];
  ambiguities?: string[];
}

export interface ConversationState {
  lastList?: ConversationListItem[];
  pendingConfirmation?: PendingConfirmation;
  pendingInventoryDraft?: PendingInventoryDraft;
  goal?: string;
  /** Short-lived turn context — not persisted to dealer profile */
  sessionContext?: SessionContext;
}

export interface AssistantCard {
  type: "demand" | "pending_action" | "confirmation" | "result";
  title: string;
  body?: string;
  meta?: Record<string, string>;
  demandId?: string;
  href?: string;
}

export function resolveListReference(
  message: string,
  state?: ConversationState
): ConversationListItem | null {
  if (!state?.lastList?.length) return null;
  const m = message.trim();

  if (/ראשון|ראשונה/i.test(m)) return state.lastList[0] ?? null;
  if (/שני|שניה/i.test(m)) return state.lastList[1] ?? null;
  if (/שלישי|שלישית/i.test(m)) return state.lastList[2] ?? null;

  const byTitle = state.lastList.find((item) =>
    m.toLowerCase().includes(item.title.toLowerCase().slice(0, 6))
  );
  return byTitle ?? null;
}

export function isConfirmation(message: string): boolean {
  return /^(כן|אשר|מאשר|בצע|אישור|ok|yes)$/i.test(message.trim());
}

export function isRejection(message: string): boolean {
  return /^(לא|בטל|ביטול|cancel|no)$/i.test(message.trim());
}

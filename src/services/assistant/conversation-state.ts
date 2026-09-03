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
  operatingMode?: "broker_only" | "inventory_management";
  /** Forced intent from UI CTA — e.g. inventory page "הוסף עם הסוכן" */
  forcedIntent?: "create_inventory";
}

export type {
  InventoryGapId,
  InventoryDraftFields,
  PendingInventoryDraft,
} from "@/services/assistant/inventory-draft";

export type ProposedVehicleChanges = {
  mileage?: number;
  retailPrice?: number;
  b2bPrice?: number;
  ownershipHand?: number;
  ownershipType?: string;
  trim?: string | null;
  color?: string | null;
  status?: "ACTIVE" | "SOLD" | "ARCHIVED";
};

export type PendingInventoryMutation = {
  type: "UPDATE" | "MARK_SOLD" | "MARK_UNAVAILABLE";
  vehicleId: string;
  proposedChanges?: ProposedVehicleChanges;
  status: "WAITING_CONFIRMATION" | "WAITING_SELECTION" | "WAITING_AVAILABILITY_CHOICE";
  candidates?: Array<{ id: string; label: string }>;
  label: string;
};

export interface ConversationState {
  lastList?: ConversationListItem[];
  pendingConfirmation?: PendingConfirmation;
  pendingInventoryDraft?: import("@/services/assistant/inventory-draft").PendingInventoryDraft;
  pendingInventoryMutation?: PendingInventoryMutation;
  goal?: string;
  /** Short-lived turn context — not persisted to dealer profile */
  sessionContext?: SessionContext;
  /** Explicit object focus from UI — prefer over text inference */
  focusedObject?: {
    type: "vehicle" | "demand" | "match";
    id: string;
  };
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
  return /^(כן|אשר|מאשר|בצע|אישור|ok|yes|שמור|שמור במלאי|כן,?\s*נמכרה|עדכן)$/i.test(
    message.trim()
  );
}

export function isRejection(message: string): boolean {
  return /^(לא|בטל|ביטול|cancel|no)$/i.test(message.trim());
}

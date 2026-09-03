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
  /** Last structured turn interpretation (turn memory) */
  lastInterpretation?: import("@/services/assistant/turn-event").StructuredTurnEvent;
  lastAgentQuestion?: import("@/services/assistant/turn-event").LastAgentQuestion;
  repeatedQuestionCount?: number;
  rejectedInterpretations?: string[];
  recentCorrections?: Array<{
    relation: string;
    rejected: string[];
    at: number;
  }>;
  suspendedContext?: import("@/services/assistant/turn-event").SuspendedContext;
  preferredClarificationWording?: Record<string, string>;
  /** Compact last authorized tool snapshot for references like "כל החיפושים" */
  lastAuthorizedSnapshot?: {
    activeDemandIds?: string[];
    activeDemandTitles?: string[];
    activeDemandCount?: number;
    matchCount?: number;
  };
  pendingSearchDraft?: {
    demandId: string;
    status: "PENDING_CONFIRMATION";
    sourceText: string;
    confirmed: import("@/lib/demand-display").DemandConfirmed;
  };
  queuedFollowUp?: string;
  /** Compact recent chat turns for Agent 4.0 tool loop — not authority */
  recentTurns?: Array<{ role: "user" | "assistant"; text: string }>;
}

export function appendRecentTurns(
  state: ConversationState | undefined,
  userText: string,
  assistantText: string,
  maxTurns = 12
): ConversationState {
  const prev = state?.recentTurns ?? [];
  const next = [
    ...prev,
    { role: "user" as const, text: userText.slice(0, 500) },
    { role: "assistant" as const, text: assistantText.slice(0, 800) },
  ];
  return {
    ...state,
    recentTurns: next.slice(-maxTurns),
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
  return /^(כן|אשר|מאשר|בצע|אישור|ok|yes|שמור|שמור במלאי|כן,?\s*נמכרה|עדכן|יאללה)$/i.test(
    message.trim()
  );
}

export function isRejection(message: string): boolean {
  return /^(לא|בטל|ביטול|cancel|no)$/i.test(message.trim());
}

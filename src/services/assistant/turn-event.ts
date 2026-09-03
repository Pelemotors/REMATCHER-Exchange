/**
 * Structured conversational turn event — capability of existing Agent (2.7).
 * Not a separate Agent. Classifies relation to previous turn + facts.
 */

export type TurnRelation =
  | "NEW_REQUEST"
  | "ANSWER"
  | "CORRECTION"
  | "REJECTION"
  | "ADDITIONAL_INFO"
  | "TOPIC_SWITCH"
  | "CONFIRMATION"
  | "CANCEL"
  | "SKIP"
  | "WORDING_CORRECTION"
  | "RESUME"
  | "CONTEXT_QUESTION"
  | "UNKNOWN";

/**
 * What the dealer is asking about when relation = CONTEXT_QUESTION.
 * - COMPLETENESS: "לא חסר מידע?" / "זה מספיק?"
 * - MISSING_FIELDS: "מה עוד חסר?" / "מה אתה צריך עוד?"
 * - CURRENT_STATE: "מה כבר רשמת?" / "מה אמרתי לך עד עכשיו?"
 * - SPECIFIC_FIELD: "איזה מחיר רשמת?" / "רשמתי לך קילומטר?"
 * - REQUIREMENT: "חייב מחיר?" / "חובה להכניס קילומטר?"
 * - WHY_NEEDED: "למה צריך מחיר לסוחר?"
 * - CAN_PROCEED: "אפשר לשמור ככה?" / "אפשר להמשיך?"
 * - OTHER: any other context question
 */
export type QuestionAbout =
  | "COMPLETENESS"
  | "MISSING_FIELDS"
  | "CURRENT_STATE"
  | "SPECIFIC_FIELD"
  | "REQUIREMENT"
  | "WHY_NEEDED"
  | "CAN_PROCEED"
  | "OTHER"
  | null;

export type TurnCapability =
  | "inventory"
  | "matches"
  | "searches"
  | "opportunities"
  | "activity"
  | "validations"
  | "broker"
  | "unknown";

export type ConfidenceBand = "high" | "medium" | "low";

/** Inventory-oriented facts extracted from free text (never invented by code). */
export type TurnInventoryFacts = {
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  year?: number | null;
  mileage?: number | null;
  color?: string | null;
  ownershipHand?: number | null;
  ownershipType?: string | null;
  retailPrice?: number | null;
  b2bPrice?: number | null;
  region?: string | null;
  /** Soft notes / exclusions not forced into schema */
  notes?: string | null;
  exclusions?: string[];
};

export type StructuredTurnEvent = {
  relation: TurnRelation;
  intent:
    | "continue_current"
    | "create_inventory"
    | "update_inventory"
    | "mark_sold"
    | "mark_unavailable"
    | "create_demand"
    | "read_matches"
    | "read_state"
    | "help"
    | "unknown";
  targetCapability: TurnCapability;
  /** What kind of context question the dealer is asking (only when relation=CONTEXT_QUESTION) */
  questionAbout?: QuestionAbout;
  extractedFacts?: TurnInventoryFacts;
  correctedFacts?: TurnInventoryFacts;
  rejectedInterpretations?: string[];
  targetObject?: {
    type?: string;
    id?: string;
    referenceText?: string;
    selectionIndex?: number;
  };
  confirms?: boolean;
  cancels?: boolean;
  skipRequested?: boolean;
  resumeRequested?: boolean;
  confidence?: {
    overall: ConfidenceBand;
    fields?: Record<string, ConfidenceBand>;
  };
  needsClarification?: boolean;
  clarificationReason?: string;
  preferredWording?: string | null;
  source: "ai" | "deterministic" | "fallback";
};

export type LastAgentQuestion = {
  kind: string;
  text: string;
  capability?: TurnCapability;
};

export type SuspendedContext = {
  kind: "inventory_draft" | "inventory_mutation";
  draft?: import("@/services/assistant/inventory-draft").PendingInventoryDraft;
  mutation?: import("@/services/assistant/conversation-state").PendingInventoryMutation;
  label?: string;
};

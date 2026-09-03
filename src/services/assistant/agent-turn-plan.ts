/**
 * Agent Conversation Core 3.0 — Turn Plan types.
 *
 * GPT proposes what should happen. REMATCHER validates authority.
 * TurnRelation enums remain telemetry/hints — not the universe of speech.
 */

export type FactChange = {
  field: string;
  value: string | number | boolean | null;
  confidence: "high" | "medium" | "low";
};

export type RejectedFact = {
  field?: string | null;
  value?: string | null;
  reason?: string | null;
};

export type TurnActionKind =
  | "NONE"
  | "READ"
  | "ANSWER_ONLY"
  | "PROPOSE_MUTATION"
  | "CONFIRM_PENDING_MUTATION"
  | "CANCEL_PENDING_MUTATION"
  | "CLARIFY"
  | "SUSPEND_AND_READ"
  | "RESUME";

export type ToolGoal =
  | "get_my_matches"
  | "get_my_searches"
  | "get_my_state"
  | "get_my_validations"
  | "get_my_opportunities"
  | "get_my_reveals"
  | "get_my_outcomes"
  | "get_my_activity"
  | "get_my_commercial"
  | "get_my_inventory_attention"
  | "get_dealer_attention"
  | "none"
  | null;

export type AgentTurnPlan = {
  understanding: {
    userGoal: string;
    messageMeaning: string;
    refersToCurrentTask: boolean;
    refersToActiveObject: boolean;
    targetReference: string | null;
  };
  responseNeed: {
    shouldAnswerNow: boolean;
    answerGoal: string | null;
  };
  conversation: {
        keepCurrentTask: boolean;
        suspendCurrentTask: boolean;
        resumeTaskReference: string | null;
        correctedUnderstanding: string | null;
        queuedFollowUp: string | null;
      };
  facts: {
    add: FactChange[];
    correct: FactChange[];
    reject: RejectedFact[];
  };
    action: {
      kind: TurnActionKind;
      capability: string | null;
      operation: string | null;
      scope: string | null;
      toolGoal: ToolGoal;
      targetReference: string | null;
    };
  clarification: {
    needed: boolean;
    reason: string | null;
    suggestedQuestion: string | null;
  };
  /** Coarse telemetry hint — not exhaustive speech taxonomy */
  telemetryHint: {
    relation:
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
      | "ADVISORY_QUESTION"
      | "UNKNOWN";
    questionAbout:
      | "COMPLETENESS"
      | "MISSING_FIELDS"
      | "CURRENT_STATE"
      | "SPECIFIC_FIELD"
      | "REQUIREMENT"
      | "WHY_NEEDED"
      | "CAN_PROCEED"
      | "LISTING_GUIDANCE"
      | "MATCHING_TIPS"
      | "INPUT_FORMAT"
      | "GENERAL_ADVISORY"
      | "OTHER"
      | null;
  };
  confidence: number;
  source: "ai" | "deterministic" | "fallback";
};

export type PolicyDecision =
  | { decision: "ALLOW" }
  | { decision: "DENY"; reason: string; userMessage: string }
  | { decision: "REQUIRE_CONFIRMATION"; reason: string }
  | { decision: "REQUIRE_CLARIFICATION"; reason: string; question: string };

/**
 * OpenAI Structured Outputs schema for AgentTurnPlan (Conversation Core 3.0).
 * Recursive strict rules: additionalProperties:false + required includes all keys.
 */

const FACT_CHANGE_SCHEMA = {
  type: "object",
  properties: {
    field: { type: "string" },
    value: { type: ["string", "number", "boolean", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["field", "value", "confidence"],
  additionalProperties: false,
} as const;

const REJECTED_FACT_SCHEMA = {
  type: "object",
  properties: {
    field: { type: ["string", "null"] },
    value: { type: ["string", "null"] },
    reason: { type: ["string", "null"] },
  },
  required: ["field", "value", "reason"],
  additionalProperties: false,
} as const;

export const TURN_PLAN_SCHEMA = {
  type: "object",
  properties: {
    understanding: {
      type: "object",
      properties: {
        userGoal: { type: "string" },
        messageMeaning: { type: "string" },
        refersToCurrentTask: { type: "boolean" },
        refersToActiveObject: { type: "boolean" },
        targetReference: { type: ["string", "null"] },
      },
      required: [
        "userGoal",
        "messageMeaning",
        "refersToCurrentTask",
        "refersToActiveObject",
        "targetReference",
      ],
      additionalProperties: false,
    },
    responseNeed: {
      type: "object",
      properties: {
        shouldAnswerNow: { type: "boolean" },
        answerGoal: { type: ["string", "null"] },
      },
      required: ["shouldAnswerNow", "answerGoal"],
      additionalProperties: false,
    },
    conversation: {
      type: "object",
      properties: {
        keepCurrentTask: { type: "boolean" },
        suspendCurrentTask: { type: "boolean" },
        resumeTaskReference: { type: ["string", "null"] },
        correctedUnderstanding: { type: ["string", "null"] },
        queuedFollowUp: { type: ["string", "null"] },
      },
      required: [
        "keepCurrentTask",
        "suspendCurrentTask",
        "resumeTaskReference",
        "correctedUnderstanding",
        "queuedFollowUp",
      ],
      additionalProperties: false,
    },
    facts: {
      type: "object",
      properties: {
        add: { type: "array", items: FACT_CHANGE_SCHEMA },
        correct: { type: "array", items: FACT_CHANGE_SCHEMA },
        reject: { type: "array", items: REJECTED_FACT_SCHEMA },
      },
      required: ["add", "correct", "reject"],
      additionalProperties: false,
    },
    action: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "NONE",
            "READ",
            "ANSWER_ONLY",
            "PROPOSE_MUTATION",
            "CONFIRM_PENDING_MUTATION",
            "CANCEL_PENDING_MUTATION",
            "CLARIFY",
            "SUSPEND_AND_READ",
            "RESUME",
          ],
        },
        capability: {
          type: ["string", "null"],
          enum: [
            "GENERAL",
            "INVENTORY",
            "SEARCHES",
            "MATCHES",
            "OPPORTUNITIES",
            "REVEALS",
            "OUTCOMES",
            "ACTIVITY",
            "VALIDATIONS",
            "COMMERCIAL",
            "HELP",
            null,
          ],
        },
        operation: {
          type: ["string", "null"],
          enum: [
            "READ",
            "CREATE",
            "UPDATE",
            "CLOSE",
            "RENEW",
            "MARK_SOLD",
            "CONFIRM_VALIDATION",
            "HELP",
            "NONE",
            null,
          ],
        },
        scope: {
          type: ["string", "null"],
          enum: [
            "ONE",
            "MANY",
            "ALL_AUTHORIZED",
            "REFERENCED_SET",
            "EXPIRED",
            null,
          ],
        },
        toolGoal: {
          type: ["string", "null"],
          enum: [
            "get_my_matches",
            "get_my_searches",
            "get_my_state",
            "get_my_validations",
            "get_my_opportunities",
            "get_my_reveals",
            "get_my_outcomes",
            "get_my_activity",
            "get_my_commercial",
            "get_my_inventory_attention",
            "none",
            null,
          ],
        },
        targetReference: { type: ["string", "null"] },
      },
      required: [
        "kind",
        "capability",
        "operation",
        "scope",
        "toolGoal",
        "targetReference",
      ],
      additionalProperties: false,
    },
    clarification: {
      type: "object",
      properties: {
        needed: { type: "boolean" },
        reason: { type: ["string", "null"] },
        suggestedQuestion: { type: ["string", "null"] },
      },
      required: ["needed", "reason", "suggestedQuestion"],
      additionalProperties: false,
    },
    telemetryHint: {
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
            "CONTEXT_QUESTION",
            "ADVISORY_QUESTION",
            "UNKNOWN",
          ],
        },
        questionAbout: {
          type: ["string", "null"],
          enum: [
            "COMPLETENESS",
            "MISSING_FIELDS",
            "CURRENT_STATE",
            "SPECIFIC_FIELD",
            "REQUIREMENT",
            "WHY_NEEDED",
            "CAN_PROCEED",
            "LISTING_GUIDANCE",
            "MATCHING_TIPS",
            "INPUT_FORMAT",
            "GENERAL_ADVISORY",
            "OTHER",
            null,
          ],
        },
      },
      required: ["relation", "questionAbout"],
      additionalProperties: false,
    },
    confidence: { type: "number" },
  },
  required: [
    "understanding",
    "responseNeed",
    "conversation",
    "facts",
    "action",
    "clarification",
    "telemetryHint",
    "confidence",
  ],
  additionalProperties: false,
} as const;

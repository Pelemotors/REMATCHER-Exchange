/**
 * TURN_SCHEMA exported separately for testing without server-only imports.
 *
 * OpenAI Structured Outputs strict mode rules (applied recursively):
 * 1. Every object must have additionalProperties: false
 * 2. Every object must have a required array
 * 3. required must include ALL keys listed in properties
 * 4. Optional fields must be nullable (type: ["x","null"]), NOT absent from required
 *
 * This schema is shared between turn-interpreter.ts (AI call) and tests.
 * Violations produce a 400 error that silently falls to fallback — 
 * making the Turn Interpreter effectively dead in production.
 */

/** Shared vehicle facts schema — reused for extractedFacts and correctedFacts */
export const FACTS_SCHEMA = {
  type: "object",
  properties: {
    make: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    year: { type: ["number", "null"] },
    mileage: { type: ["number", "null"] },
    b2bPrice: { type: ["number", "null"] },
    retailPrice: { type: ["number", "null"] },
    color: { type: ["string", "null"] },
    trim: { type: ["string", "null"] },
    ownershipType: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
    exclusions: { type: "array", items: { type: "string" } },
  },
  required: [
    "make",
    "model",
    "year",
    "mileage",
    "b2bPrice",
    "retailPrice",
    "color",
    "trim",
    "ownershipType",
    "notes",
    "exclusions",
  ],
  additionalProperties: false,
} as const;

export const TURN_SCHEMA_FOR_TEST = {
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
    intent: {
      type: "string",
      enum: [
        "continue_current",
        "create_inventory",
        "update_inventory",
        "mark_sold",
        "mark_unavailable",
        "create_demand",
        "read_matches",
        "read_state",
        "help",
        "unknown",
      ],
    },
    targetCapability: {
      type: "string",
      enum: [
        "inventory",
        "matches",
        "searches",
        "opportunities",
        "activity",
        "validations",
        "broker",
        "unknown",
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
        "GENERAL_ADVISORY",
        "OTHER",
        null,
      ],
    },
    extractedFacts: FACTS_SCHEMA,
    correctedFacts: FACTS_SCHEMA,
    rejectedInterpretations: {
      type: "array",
      items: { type: "string" },
    },
    confirms: { type: "boolean" },
    cancels: { type: "boolean" },
    skipRequested: { type: "boolean" },
    resumeRequested: { type: "boolean" },
    preferredWording: { type: ["string", "null"] },
    needsClarification: { type: "boolean" },
    clarificationReason: { type: ["string", "null"] },
    confidenceOverall: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    selectionIndex: { type: ["number", "null"] },
    referenceText: { type: ["string", "null"] },
  },
  required: [
    "relation",
    "intent",
    "targetCapability",
    "questionAbout",
    "extractedFacts",
    "correctedFacts",
    "rejectedInterpretations",
    "confirms",
    "cancels",
    "skipRequested",
    "resumeRequested",
    "preferredWording",
    "needsClarification",
    "clarificationReason",
    "confidenceOverall",
    "selectionIndex",
    "referenceText",
  ],
  additionalProperties: false,
} as const;

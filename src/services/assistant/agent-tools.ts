/**
 * Agent 4.0 — OpenAI tool definitions for authorized REMATCHER domain reads + write proposals.
 * GPT chooses tools. REMATCHER executes only authorized read services / Action Gateway for writes.
 */
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { ReadToolName } from "@/services/assistant/tools/registry";

/** OpenAI function name → internal ReadToolName */
export const OPENAI_READ_TOOL_MAP: Record<string, ReadToolName> = {
  get_my_exchange_state: "getMyExchangeState",
  get_my_inventory: "getMyInventory",
  get_my_inventory_attention: "getMyInventoryRequiringAttention",
  get_my_stale_inventory: "getMyStaleInventory",
  get_my_searches: "getMyActiveDemands",
  get_my_expiring_searches: "getMyExpiringDemands",
  get_my_matches: "getMyAuthorizedMatches",
  get_my_opportunities: "getMyOpportunities",
  get_my_reveals: "getMyReveals",
  get_my_pending_outcomes: "getMyPendingOutcomes",
  get_my_validations: "getMyPendingValidations",
  get_my_commercial_status: "getMyCommercialStatus",
  get_my_pending_actions: "getMyPendingActions",
};

export const CONTROL_TOOL_NAMES = [
  "propose_mutation",
  "confirm_pending_action",
  "cancel_pending_action",
] as const;

export const CONVERSATION_STATE_TOOL_NAMES = ["update_inventory_draft"] as const;

export const DEALER_MEMORY_TOOL_NAMES = [
  "remember_dealer_insight",
  "get_my_dealer_memory",
  "forget_dealer_insight",
  "correct_dealer_insight",
] as const;

export const SEARCH_INTENT_TOOL_NAMES = [
  "draft_search_intent",
  "inspect_search_intent",
  "clarify_search_intent",
  "summarize_search_intent",
  "report_business_event",
] as const;

export type ControlToolName = (typeof CONTROL_TOOL_NAMES)[number];
export type ConversationStateToolName =
  (typeof CONVERSATION_STATE_TOOL_NAMES)[number];
export type DealerMemoryToolName = (typeof DEALER_MEMORY_TOOL_NAMES)[number];
export type SearchIntentToolName = (typeof SEARCH_INTENT_TOOL_NAMES)[number];

function emptyParams() {
  return {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  };
}

function tool(
  name: string,
  description: string,
  parameters: Record<string, unknown> = emptyParams()
): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters,
    },
  };
}

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

export const AGENT_OPENAI_TOOLS: ChatCompletionTool[] = [
  tool(
    "get_my_exchange_state",
    "Compact authorized summary for THIS dealer only: active search count, expiring searches, pending validations, authorized matches, open opportunities, pending outcomes, remaining connections. Useful first glance before deeper reads. Does NOT return network inventory or other dealers' data. Zero counts mean none found for this dealer — not a market diagnosis."
  ),
  tool(
    "get_my_inventory",
    "THIS dealer's own active inventory vehicles (make, model, year, mileage, dealer price when present). Never returns other dealers' inventory or network browse. Does NOT prove market demand, fair price, or that missing optional fields block matching. If a freshness/status code appears, translate it to dealer language — never say FRESH/STALE to the user."
  ),
  tool(
    "get_my_inventory_attention",
    "THIS dealer's inventory items the system marks as requiring attention (e.g. stale / validation-required). Own inventory only. Does NOT invent commercial problems beyond system flags. Translate internal status codes to Hebrew dealer language."
  ),
  tool(
    "get_my_stale_inventory",
    "THIS dealer's vehicles marked stale by the system. Own inventory only. Stale is a freshness signal — it alone does NOT prove the price is wrong or that the car will not sell. Say 'ישן/דורש רענון' style language, not STALE/FRESH."
  ),
  tool(
    "get_my_searches",
    "THIS dealer's active/expiring searches (demands) with display titles and days left. Never returns other dealers' searches. Own searches vs network inventory is a buy-side path separate from own inventory vs network demand."
  ),
  tool(
    "get_my_expiring_searches",
    "THIS dealer's searches expiring within ~24h. Own searches only. Does NOT invent network supply for those searches."
  ),
  tool(
    "get_my_matches",
    "Authorized pre-reveal match cards for THIS dealer as buyer — privacy-safe vehicle summary only. Match existence comes only from stored deterministic matching; never invent matches. No seller identity before Reveal. Empty means no authorized matches."
  ),
  tool(
    "get_my_opportunities",
    "Open seller opportunities for THIS dealer's vehicles (buyer interest exists). Does NOT reveal buyer identity. Own opportunities only. Does not invent interest."
  ),
  tool(
    "get_my_reveals",
    "Recent mutual-interest Reveals for THIS dealer (post-reveal authorized contact summary). Only data already revealed."
  ),
  tool(
    "get_my_pending_outcomes",
    "Reveals awaiting outcome update for THIS dealer."
  ),
  tool(
    "get_my_validations",
    "Pending availability validations for THIS dealer's vehicles. Validation ≠ seller interest."
  ),
  tool(
    "get_my_commercial_status",
    "THIS dealer's commercial / reveal usage and plan limits. Pricing/entitlement truth from product config — do not invent entitlements."
  ),
  tool(
    "get_my_pending_actions",
    "Aggregated pending action counts for THIS dealer. Useful for urgency signals; does not by itself decide commercial priority."
  ),
  tool(
    "update_inventory_draft",
    "Update the CURRENT conversational inventory draft with structured vehicle facts you understood from the user's message. Conversation state only — does NOT write to the database and does NOT require confirmation. Use when describing/correcting an unsaved vehicle. Only include facts actually stated or clearly corrected. Do not invent model/year/mileage/price.",
    {
      type: "object",
      properties: {
        facts: {
          type: "object",
          properties: {
            make: nullableString,
            model: nullableString,
            trim: nullableString,
            year: nullableNumber,
            mileage: nullableNumber,
            color: nullableString,
            ownershipHand: nullableNumber,
            ownershipType: nullableString,
            retailPrice: nullableNumber,
            b2bPrice: nullableNumber,
            region: nullableString,
          },
          additionalProperties: false,
        },
      },
      required: ["facts"],
      additionalProperties: false,
    }
  ),
  tool(
    "remember_dealer_insight",
    "Persist a durable business insight about THIS dealer for future personalization (goals, preferences, business context). Requires a stable topicKey (e.g. preference.liquidity_vs_margin, goal.current_cashflow). Same topicKey supersedes the previous ACTIVE item. Do NOT store live REMATCHER snapshots (inventory counts, matches, pending actions). AGENT_INFERRED requires evidenceNote and stays low-confidence — do not build personality from a single anecdote. USER_STATED for explicit dealer statements.",
    {
      type: "object",
      properties: {
        topicKey: { type: "string" },
        kind: {
          type: "string",
          enum: [
            "PROFILE",
            "PREFERENCE",
            "GOAL",
            "BUSINESS_CONTEXT",
            "DECISION",
            "TEMPORARY",
          ],
        },
        provenance: {
          type: "string",
          enum: ["USER_STATED", "AGENT_INFERRED", "SYSTEM_DERIVED"],
        },
        summary: { type: "string" },
        confidence: nullableNumber,
        evidenceNote: nullableString,
        expiresAt: nullableString,
        details: { type: ["object", "null"], additionalProperties: true },
      },
      required: [
        "topicKey",
        "kind",
        "provenance",
        "summary",
        "confidence",
        "evidenceNote",
        "expiresAt",
        "details",
      ],
      additionalProperties: false,
    }
  ),
  tool(
    "get_my_dealer_memory",
    "List THIS dealer's ACTIVE long-term memories (topicKey, id, kind, provenance, summary). Use before forget/correct when you need an exact memoryId. Does not return other dealers' memories. Does not prove live system facts.",
    {
      type: "object",
      properties: {
        topicKey: nullableString,
        kind: {
          type: ["string", "null"],
          enum: [
            "PROFILE",
            "PREFERENCE",
            "GOAL",
            "BUSINESS_CONTEXT",
            "DECISION",
            "TEMPORARY",
            null,
          ],
        },
        limit: nullableNumber,
      },
      required: ["topicKey", "kind", "limit"],
      additionalProperties: false,
    }
  ),
  tool(
    "forget_dealer_insight",
    "Truly forget one memory by exact memoryId (status FORGOTTEN). No fuzzy text delete — resolve id via get_my_dealer_memory first.",
    {
      type: "object",
      properties: {
        memoryId: { type: "string" },
      },
      required: ["memoryId"],
      additionalProperties: false,
    }
  ),
  tool(
    "correct_dealer_insight",
    "Apply a structured correction to an existing memory. NLP already happened in your reasoning — pass memoryId plus replacement summary/fields. Supersedes the prior ACTIVE item on the same topicKey as USER_STATED.",
    {
      type: "object",
      properties: {
        memoryId: { type: "string" },
        summary: { type: "string" },
        kind: {
          type: ["string", "null"],
          enum: [
            "PROFILE",
            "PREFERENCE",
            "GOAL",
            "BUSINESS_CONTEXT",
            "DECISION",
            "TEMPORARY",
            null,
          ],
        },
        confidence: nullableNumber,
        expiresAt: nullableString,
        details: { type: ["object", "null"], additionalProperties: true },
        evidenceNote: nullableString,
      },
      required: [
        "memoryId",
        "summary",
        "kind",
        "confidence",
        "expiresAt",
        "details",
        "evidenceNote",
      ],
      additionalProperties: false,
    }
  ),
  tool(
    "draft_search_intent",
    "Write a DRAFT Search Intent version for an existing demand owned by THIS dealer. Translate commercial language into structured intent (target/boundary/importance/flexibility). Never ask the dealer for numeric weights or HARD/SOFT labels — YOU map language to structure. Does NOT activate the live search. Before activation, summarize in natural Hebrew.",
    {
      type: "object",
      properties: {
        demandId: { type: "string" },
        naturalLanguageSummary: nullableString,
        structuredIntent: { type: "object", additionalProperties: true },
      },
      required: ["demandId", "naturalLanguageSummary", "structuredIntent"],
      additionalProperties: false,
    }
  ),
  tool(
    "inspect_search_intent",
    "Read the current/active Search Intent (or lazily adapted legacy intent) for THIS dealer's demand.",
    {
      type: "object",
      properties: {
        demandId: { type: "string" },
      },
      required: ["demandId"],
      additionalProperties: false,
    }
  ),
  tool(
    "clarify_search_intent",
    "Update a DRAFT Search Intent after clarification (new version, not rewriting history). Activation still requires propose_mutation + confirmation.",
    {
      type: "object",
      properties: {
        demandId: { type: "string" },
        naturalLanguageSummary: nullableString,
        structuredIntent: { type: "object", additionalProperties: true },
        activate: { type: ["boolean", "null"] },
      },
      required: [
        "demandId",
        "naturalLanguageSummary",
        "structuredIntent",
        "activate",
      ],
      additionalProperties: false,
    }
  ),
  tool(
    "summarize_search_intent",
    "Return a short natural-language Hebrew summary of the demand's Search Intent for confirmation with the dealer.",
    {
      type: "object",
      properties: {
        demandId: { type: "string" },
      },
      required: ["demandId"],
      additionalProperties: false,
    }
  ),
  tool(
    "report_business_event",
    "Report an explicit dealer-stated business event (sold vehicle, external purchase, no-deal on a known match). Do NOT guess vehicle/match if ambiguous — ask. Never infer VEHICLE_SOLD from inventory removal alone.",
    {
      type: "object",
      properties: {
        eventType: {
          type: "string",
          enum: [
            "VEHICLE_SOLD",
            "EXTERNAL_PURCHASE_REPORTED",
            "EXTERNAL_DEAL_REPORTED",
            "MATCH_NO_DEAL",
            "MATCH_DEAL_CONFIRMED",
            "MATCH_STILL_ACTIVE",
            "INVENTORY_REMOVED",
          ],
        },
        vehicleId: nullableString,
        demandId: nullableString,
        candidateMatchId: nullableString,
        evidenceNote: nullableString,
        reason: nullableString,
        relevanceOutcome: {
          type: ["string", "null"],
          enum: ["RELEVANT", "IRRELEVANT", "UNKNOWN", null],
        },
        outcomeReasonCategory: {
          type: ["string", "null"],
          enum: [
            "PRICE",
            "VEHICLE_CONDITION",
            "SPEC_MISMATCH",
            "AVAILABILITY",
            "CUSTOMER_CHANGED_MIND",
            "FINANCING",
            "DEALER_DECISION",
            "TIMING",
            "SOLD_ELSEWHERE",
            "NO_RESPONSE",
            "OTHER",
            "UNKNOWN",
            null,
          ],
        },
        eventData: { type: ["object", "null"], additionalProperties: true },
      },
      required: [
        "eventType",
        "vehicleId",
        "demandId",
        "candidateMatchId",
        "evidenceNote",
        "reason",
        "relevanceOutcome",
        "outcomeReasonCategory",
        "eventData",
      ],
      additionalProperties: false,
    }
  ),
  tool(
    "propose_mutation",
    "Propose a DATABASE/DOMAIN write action. Does NOT execute. REMATCHER Action Gateway authorizes, resolves targets, and requires confirmation. Use for saving a prepared inventory draft, updating/selling an already-saved vehicle, create/update/close/renew searches, or validation confirmation. Do NOT use this merely to add facts to an unsaved inventory draft — use update_inventory_draft for that. Never invent database IDs; use human targetReference.",
    {
      type: "object",
      properties: {
        capability: {
          type: "string",
          enum: [
            "INVENTORY",
            "SEARCHES",
            "MATCHES",
            "OPPORTUNITIES",
            "REVEALS",
            "OUTCOMES",
            "VALIDATIONS",
            "GENERAL",
          ],
        },
        operation: {
          type: "string",
          enum: [
            "CREATE",
            "UPDATE",
            "CLOSE",
            "RENEW",
            "MARK_SOLD",
            "CONFIRM_VALIDATION",
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
        targetReference: {
          type: ["string", "null"],
          description:
            "Human language reference only (e.g. all active searches, the CX-5 search). Never invent IDs.",
        },
        reason: {
          type: ["string", "null"],
          description: "Short why this mutation is proposed",
        },
        facts: {
          type: ["object", "null"],
          description:
            "Optional structured facts for the database/domain mutation",
          additionalProperties: true,
        },
      },
      required: [
        "capability",
        "operation",
        "scope",
        "targetReference",
        "reason",
        "facts",
      ],
      additionalProperties: false,
    }
  ),
  tool(
    "confirm_pending_action",
    "Confirm the CURRENT pending confirmation shown to the dealer (same scope/targets). Use when the user clearly affirms that pending action. Do not use if they change scope."
  ),
  tool(
    "cancel_pending_action",
    "Cancel the CURRENT pending confirmation without executing. Use when the user rejects it."
  ),
];

export function isControlTool(name: string): name is ControlToolName {
  return (CONTROL_TOOL_NAMES as readonly string[]).includes(name);
}

export function isConversationStateTool(
  name: string
): name is ConversationStateToolName {
  return (CONVERSATION_STATE_TOOL_NAMES as readonly string[]).includes(name);
}

export function isDealerMemoryTool(
  name: string
): name is DealerMemoryToolName {
  return (DEALER_MEMORY_TOOL_NAMES as readonly string[]).includes(name);
}

export function isSearchIntentTool(
  name: string
): name is SearchIntentToolName {
  return (SEARCH_INTENT_TOOL_NAMES as readonly string[]).includes(name);
}

export function isReadOpenAiTool(name: string): boolean {
  return name in OPENAI_READ_TOOL_MAP;
}

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

export type ControlToolName = (typeof CONTROL_TOOL_NAMES)[number];
export type ConversationStateToolName =
  (typeof CONVERSATION_STATE_TOOL_NAMES)[number];

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

export function isReadOpenAiTool(name: string): boolean {
  return name in OPENAI_READ_TOOL_MAP;
}

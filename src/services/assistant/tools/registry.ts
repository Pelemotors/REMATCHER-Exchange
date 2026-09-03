import "server-only";

/** All authorized read tools — planner selects subset per turn */
export const ALL_READ_TOOLS = [
  "getMyExchangeState",
  "getMyInventory",
  "getMyActiveDemands",
  "getMyExpiringDemands",
  "getMyPendingActions",
  "getMyPendingValidations",
  "getMyAuthorizedMatches",
  "getMyOpportunities",
  "getMyInventoryRequiringAttention",
  "getMyStaleInventory",
  "getMyCommercialStatus",
  "getMyReveals",
  "getMyPendingOutcomes",
] as const;

export type ReadToolName = (typeof ALL_READ_TOOLS)[number];

/** Hybrid tool-using runtime — same Exchange Assistant, new conversational brain */
export const AGENT_VERSION = "4.0";

export type ActionIntent =
  | "read"
  | "create_demand"
  | "create_inventory"
  | "update_inventory"
  | "renew_demand"
  | "close_demand"
  | "update_demand"
  | "confirm_validation"
  | "mark_sold"
  | "help";

export interface AgentPlan {
  /** Tools to execute this turn — demand-driven, never unconditional fan-out */
  tools: ReadToolName[];
  actionIntent: ActionIntent;
  referencedObjectId: string | null;
  goal: string;
}

export interface AgentMeta {
  agentVersion: string;
  plannerUsed: boolean;
  synthesizerUsed: boolean;
  model: string | null;
  tools: string[];
  toolDurations: Record<string, number>;
  plannerDurationMs: number;
  synthesisDurationMs: number;
  fallbackReason: string | null;
  responseType: string;
  legacyPlannerUsed?: boolean;
  capability?: string | null;
  operation?: string | null;
  scope?: string | null;
  policyResult?: string;
  executor?: string;
  /** Agent 4.0 loop metrics */
  modelCallCount?: number;
  toolRoundCount?: number;
  totalTokens?: number;
  loopLatencyMs?: number;
  finalResponseSource?: "agent_loop" | "action_gateway" | "exact_cta" | "fallback" | "privacy";
}

/** Tool catalog for planner prompt */
export const TOOL_DESCRIPTIONS: Record<ReadToolName, string> = {
  getMyExchangeState:
    "Cheap summary: active demand count, pending action count, connections remaining",
  getMyInventory:
    "This dealer's own active inventory vehicles (make/model/year/mileage/prices). Never network inventory.",
  getMyActiveDemands: "List of active/expiring demands with titles and days left",
  getMyExpiringDemands: "Demands expiring within 24h",
  getMyPendingActions: "Aggregated pending action counts by type",
  getMyPendingValidations: "Vehicles awaiting availability confirmation",
  getMyAuthorizedMatches: "Validated matches awaiting buyer review",
  getMyOpportunities: "Open seller opportunities (buyer interest)",
  getMyInventoryRequiringAttention: "Stale/validation-required inventory items",
  getMyStaleInventory: "Inventory marked stale",
  getMyCommercialStatus: "Reveal usage and commercial plan state",
  getMyReveals: "Recent mutual-interest connections (Reveals) for this dealer",
  getMyPendingOutcomes: "Reveals awaiting outcome feedback",
};

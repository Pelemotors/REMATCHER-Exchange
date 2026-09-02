import "server-only";

/** All authorized read tools — planner selects subset per turn */
export const ALL_READ_TOOLS = [
  "getMyExchangeState",
  "getMyActiveDemands",
  "getMyExpiringDemands",
  "getMyPendingActions",
  "getMyPendingValidations",
  "getMyAuthorizedMatches",
  "getMyOpportunities",
  "getMyInventoryRequiringAttention",
  "getMyStaleInventory",
  "getMyCommercialStatus",
] as const;

export type ReadToolName = (typeof ALL_READ_TOOLS)[number];

export type ActionIntent =
  | "read"
  | "create_demand"
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
}

export const AGENT_VERSION = "2.3";

/** Tool catalog for planner prompt */
export const TOOL_DESCRIPTIONS: Record<ReadToolName, string> = {
  getMyExchangeState:
    "Cheap summary: active demand count, pending action count, connections remaining",
  getMyActiveDemands: "List of active/expiring demands with titles and days left",
  getMyExpiringDemands: "Demands expiring within 24h",
  getMyPendingActions: "Aggregated pending action counts by type",
  getMyPendingValidations: "Vehicles awaiting availability confirmation",
  getMyAuthorizedMatches: "Validated matches awaiting buyer review",
  getMyOpportunities: "Open seller opportunities (buyer interest)",
  getMyInventoryRequiringAttention: "Stale/validation-required inventory items",
  getMyStaleInventory: "Inventory marked stale",
  getMyCommercialStatus: "Reveal usage and commercial plan state",
};

/**
 * Universal capability model for the ONE Exchange Assistant.
 * Capability ≠ intent taxonomy. GPT proposes; REMATCHER authorizes.
 */

export const AGENT_CAPABILITIES = [
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
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export const AGENT_OPERATIONS = [
  "READ",
  "CREATE",
  "UPDATE",
  "CLOSE",
  "RENEW",
  "MARK_SOLD",
  "CONFIRM_VALIDATION",
  "HELP",
  "NONE",
] as const;

export type AgentOperation = (typeof AGENT_OPERATIONS)[number];

export const AGENT_SCOPES = [
  "ONE",
  "MANY",
  "ALL_AUTHORIZED",
  "REFERENCED_SET",
  "EXPIRED",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

const CAP_ALIASES: Record<string, AgentCapability> = {
  general: "GENERAL",
  inventory: "INVENTORY",
  searches: "SEARCHES",
  search: "SEARCHES",
  demands: "SEARCHES",
  demand: "SEARCHES",
  matches: "MATCHES",
  match: "MATCHES",
  opportunities: "OPPORTUNITIES",
  opportunity: "OPPORTUNITIES",
  reveals: "REVEALS",
  reveal: "REVEALS",
  outcomes: "OUTCOMES",
  outcome: "OUTCOMES",
  activity: "ACTIVITY",
  validations: "VALIDATIONS",
  validation: "VALIDATIONS",
  commercial: "COMMERCIAL",
  broker: "GENERAL",
  help: "HELP",
};

const OP_ALIASES: Record<string, AgentOperation> = {
  read: "READ",
  create: "CREATE",
  update: "UPDATE",
  close: "CLOSE",
  cancel: "CLOSE",
  renew: "RENEW",
  mark_sold: "MARK_SOLD",
  sold: "MARK_SOLD",
  confirm_validation: "CONFIRM_VALIDATION",
  help: "HELP",
  none: "NONE",
};

export function normalizeCapability(raw: string | null | undefined): AgentCapability | null {
  if (!raw) return null;
  const key = raw.trim();
  if ((AGENT_CAPABILITIES as readonly string[]).includes(key)) {
    return key as AgentCapability;
  }
  return CAP_ALIASES[key.toLowerCase()] ?? null;
}

export function normalizeOperation(raw: string | null | undefined): AgentOperation | null {
  if (!raw) return null;
  const key = raw.trim();
  if ((AGENT_OPERATIONS as readonly string[]).includes(key)) {
    return key as AgentOperation;
  }
  return OP_ALIASES[key.toLowerCase()] ?? null;
}

export function normalizeScope(raw: string | null | undefined): AgentScope | null {
  if (!raw) return null;
  const key = raw.trim();
  if ((AGENT_SCOPES as readonly string[]).includes(key)) {
    return key as AgentScope;
  }
  const map: Record<string, AgentScope> = {
    one: "ONE",
    many: "MANY",
    all: "ALL_AUTHORIZED",
    all_authorized: "ALL_AUTHORIZED",
    referenced_set: "REFERENCED_SET",
    referenced: "REFERENCED_SET",
    expired: "EXPIRED",
  };
  return map[key.toLowerCase()] ?? null;
}

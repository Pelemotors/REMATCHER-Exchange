/**
 * Structured write proposal from GPT → REMATCHER Action Gateway.
 * GPT proposes; REMATCHER authorizes, resolves, confirms, executes.
 */
import type { AgentCapability, AgentOperation, AgentScope } from "@/services/assistant/capability-model";
import {
  normalizeCapability,
  normalizeOperation,
  normalizeScope,
} from "@/services/assistant/capability-model";

export type ActionProposal = {
  capability: AgentCapability;
  operation: AgentOperation;
  scope: AgentScope | null;
  targetReference: string | null;
  reason: string | null;
  facts: Record<string, unknown> | null;
  /** Control path */
  kind: "PROPOSE" | "CONFIRM_PENDING" | "CANCEL_PENDING";
};

export function parseActionProposalFromTool(
  toolName: string,
  argsJson: string
): ActionProposal | null {
  if (toolName === "confirm_pending_action") {
    return {
      capability: "GENERAL",
      operation: "NONE",
      scope: null,
      targetReference: null,
      reason: null,
      facts: null,
      kind: "CONFIRM_PENDING",
    };
  }
  if (toolName === "cancel_pending_action") {
    return {
      capability: "GENERAL",
      operation: "NONE",
      scope: null,
      targetReference: null,
      reason: null,
      facts: null,
      kind: "CANCEL_PENDING",
    };
  }
  if (toolName !== "propose_mutation") return null;

  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return null;
  }

  const capability = normalizeCapability(String(raw.capability ?? ""));
  const operation = normalizeOperation(String(raw.operation ?? ""));
  if (!capability || !operation || operation === "READ" || operation === "HELP") {
    return null;
  }

  return {
    capability,
    operation,
    scope: normalizeScope(
      raw.scope == null ? null : String(raw.scope)
    ),
    targetReference:
      raw.targetReference == null ? null : String(raw.targetReference),
    reason: raw.reason == null ? null : String(raw.reason),
    facts:
      raw.facts && typeof raw.facts === "object"
        ? (raw.facts as Record<string, unknown>)
        : null,
    kind: "PROPOSE",
  };
}

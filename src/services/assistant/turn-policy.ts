/**
 * Policy / Authority layer — REMATCHER owns authorization.
 * GPT proposes (Turn Plan); this layer decides ALLOW / DENY / REQUIRE_*.
 */

import type {
  AgentTurnPlan,
  PolicyDecision,
} from "@/services/assistant/agent-turn-plan";
import type { ConversationState } from "@/services/assistant/conversation-state";
import {
  checkPrivacyGate,
  privacyBlockedMessage,
} from "@/services/assistant/privacy-gate";
import type { ReadToolName } from "@/services/assistant/tools/registry";
import {
  normalizeCapability,
  normalizeOperation,
  normalizeScope,
} from "@/services/assistant/capability-model";

/** Map approved tool goals → registry tools (model cannot invent endpoints). */
export function toolGoalToReadTools(
  toolGoal: AgentTurnPlan["action"]["toolGoal"]
): ReadToolName[] {
  switch (toolGoal) {
    case "get_my_matches":
      return ["getMyAuthorizedMatches", "getMyExchangeState"];
    case "get_my_searches":
      return ["getMyActiveDemands", "getMyExpiringDemands"];
    case "get_my_state":
      return ["getMyExchangeState", "getMyPendingActions"];
    case "get_my_validations":
      return ["getMyPendingValidations"];
    case "get_my_opportunities":
      return ["getMyOpportunities"];
    case "get_my_reveals":
      return ["getMyReveals"];
    case "get_my_outcomes":
      return ["getMyPendingOutcomes"];
    case "get_my_activity":
      return ["getMyPendingActions", "getMyExchangeState"];
    case "get_my_commercial":
      return ["getMyCommercialStatus"];
    case "get_my_inventory_attention":
      return ["getMyInventoryRequiringAttention", "getMyStaleInventory"];
    case "get_dealer_attention":
      return [
        "getMyExchangeState",
        "getMyExpiringDemands",
        "getMyPendingValidations",
        "getMyAuthorizedMatches",
        "getMyOpportunities",
        "getMyInventoryRequiringAttention",
        "getMyStaleInventory",
        "getMyPendingOutcomes",
      ];
    default:
      return [];
  }
}

/**
 * Validate Turn Plan against REMATCHER authority.
 * Narrow raw-text fishing still checked for high-confidence network probes.
 */
export function validateTurnPlan(params: {
  message: string;
  plan: AgentTurnPlan;
  conversation?: ConversationState;
}): PolicyDecision {
  const { message, plan, conversation } = params;

  // High-confidence network fishing — still blocked (narrow patterns only)
  const privacy = checkPrivacyGate(message);
  if (privacy.blocked && privacy.reason) {
    return {
      decision: "DENY",
      reason: `privacy_${privacy.reason}`,
      userMessage: privacyBlockedMessage(privacy.reason),
    };
  }

  // Model proposing network inventory read — deny
  if (
    /network|browse.?all|other.?dealer|רשת/i.test(
      `${plan.understanding.userGoal} ${plan.understanding.messageMeaning}`
    ) &&
    plan.action.kind === "READ" &&
    plan.action.toolGoal === null
  ) {
    return {
      decision: "DENY",
      reason: "network_inventory_denied",
      userMessage: privacyBlockedMessage("fishing"),
    };
  }

  // Confirm mutation only if concrete pending exists
  if (plan.action.kind === "CONFIRM_PENDING_MUTATION") {
    const hasPending =
      conversation?.pendingConfirmation ||
      conversation?.pendingInventoryDraft?.status === "WAITING_CONFIRMATION" ||
      conversation?.pendingInventoryMutation?.status === "WAITING_CONFIRMATION";
    if (!hasPending) {
      return {
        decision: "REQUIRE_CLARIFICATION",
        reason: "no_pending_mutation",
        question: "אין פעולה ממתינה לאישור. מה תרצה לעשות?",
      };
    }
    return { decision: "REQUIRE_CONFIRMATION", reason: "pending_mutation" };
  }

  if (plan.action.kind === "CLARIFY" || plan.clarification.needed) {
    return {
      decision: "REQUIRE_CLARIFICATION",
      reason: plan.clarification.reason ?? "unclear",
      question:
        plan.clarification.suggestedQuestion ??
        "לא בטוח שהבנתי — אפשר לנסח שוב בקצרה?",
    };
  }

  // Unknown tool goal — fail closed for READ
  if (
    (plan.action.kind === "READ" || plan.action.kind === "SUSPEND_AND_READ") &&
    plan.action.toolGoal &&
    plan.action.toolGoal !== "none" &&
    toolGoalToReadTools(plan.action.toolGoal).length === 0
  ) {
    return {
      decision: "REQUIRE_CLARIFICATION",
      reason: "unknown_tool_goal",
      question: "לא בטוח איזה מידע לבדוק — התאמות, חיפושים, או משהו אחר?",
    };
  }

  // Mutations without an explicit operation — do not guess CLOSE
  if (plan.action.kind === "PROPOSE_MUTATION") {
    const op = normalizeOperation(plan.action.operation);
    if (!op || op === "NONE") {
      return {
        decision: "REQUIRE_CLARIFICATION",
        reason: "missing_operation",
        question: "מה הפעולה — לקרוא, לפתוח, לעדכן או לסגור?",
      };
    }
  }

  return { decision: "ALLOW" };
}

export function planHasVehicleFacts(plan: AgentTurnPlan): boolean {
  const fields = ["make", "model", "year", "mileage", "b2bPrice", "retailPrice"];
  return (
    plan.facts.add.some((f) => fields.includes(f.field)) ||
    plan.facts.correct.some((f) => fields.includes(f.field))
  );
}

/** Inventory may execute this turn only when the plan actually targets inventory work. */
export function inventoryOwnsTurn(params: {
  plan: AgentTurnPlan;
  conversation?: ConversationState;
}): boolean {
  const { plan, conversation } = params;
  const cap = normalizeCapability(plan.action.capability);
  const op = normalizeOperation(plan.action.operation);
  if (cap && cap !== "INVENTORY") return false;
  if (
    plan.action.kind === "ANSWER_ONLY" ||
    plan.action.kind === "READ" ||
    plan.action.kind === "SUSPEND_AND_READ" ||
    plan.action.kind === "CLARIFY" ||
    plan.action.kind === "RESUME"
  ) {
    return false;
  }
  if (plan.action.toolGoal && plan.action.toolGoal !== "none") {
    return false;
  }
  const hasInventoryFacts = planHasVehicleFacts(plan);
  if (
    plan.action.kind === "CONFIRM_PENDING_MUTATION" ||
    plan.action.kind === "CANCEL_PENDING_MUTATION"
  ) {
    return Boolean(
      conversation?.pendingInventoryDraft ||
        conversation?.pendingInventoryMutation ||
        conversation?.pendingConfirmation?.action === "create_inventory"
    );
  }
  if (conversation?.pendingInventoryDraft && plan.conversation.keepCurrentTask) {
    return hasInventoryFacts || cap === "INVENTORY";
  }
  return (
    cap === "INVENTORY" &&
    (op === "CREATE" || op === "UPDATE" || op === "MARK_SOLD") &&
    (hasInventoryFacts || Boolean(conversation?.pendingInventoryDraft))
  );
}

export function searchesMutationProposed(plan: AgentTurnPlan): boolean {
  const cap = normalizeCapability(plan.action.capability);
  const op = normalizeOperation(plan.action.operation);
  if (plan.action.kind !== "PROPOSE_MUTATION") return false;
  return cap === "SEARCHES" && (op === "CLOSE" || op === "CREATE" || op === "UPDATE" || op === "RENEW");
}

/** Demand/search close — explicit CLOSE operation only. */
export function shouldProposeDemandClosure(params: {
  plan: AgentTurnPlan;
  conversation?: ConversationState;
}): boolean {
  const { plan } = params;
  if (inventoryOwnsTurn(params)) return false;
  if (plan.action.kind !== "PROPOSE_MUTATION") return false;
  return (
    normalizeCapability(plan.action.capability) === "SEARCHES" &&
    normalizeOperation(plan.action.operation) === "CLOSE"
  );
}

/** Data-grounded "what should I do now?" — not product HELP. */
export function isJudgmentPlan(plan: AgentTurnPlan): boolean {
  if (isExplicitProductHowTo(plan)) return false;
  const cap = normalizeCapability(plan.action.capability);
  const op = normalizeOperation(plan.action.operation);
  if (op === "HELP") return false;
  if (plan.action.toolGoal === "get_dealer_attention") return true;
  if (
    cap === "GENERAL" &&
    (plan.action.kind === "READ" || plan.action.kind === "SUSPEND_AND_READ")
  ) {
    return true;
  }
  if (plan.telemetryHint.relation === "CONTEXT_QUESTION") return false;
  return (
    plan.action.kind === "ANSWER_ONLY" &&
    cap !== "INVENTORY" &&
    op !== "CREATE" &&
    op !== "UPDATE" &&
    op !== "CLOSE"
  );
}

function isExplicitProductHowTo(plan: AgentTurnPlan): boolean {
  const about = plan.telemetryHint.questionAbout;
  return (
    about === "INPUT_FORMAT" ||
    about === "LISTING_GUIDANCE" ||
    about === "MATCHING_TIPS" ||
    about === "WHY_NEEDED" ||
    about === "REQUIREMENT"
  );
}

export function isProductHelpPlan(plan: AgentTurnPlan): boolean {
  if (isJudgmentPlan(plan)) return false;
  if (isExplicitProductHowTo(plan)) return true;
  const cap = normalizeCapability(plan.action.capability);
  const op = normalizeOperation(plan.action.operation);
  return cap === "HELP" || op === "HELP";
}

export function pendingSearchCloseMatchesPlan(
  pending: ConversationState["pendingConfirmation"],
  plan: AgentTurnPlan
): boolean {
  if (!pending) return false;
  if (
    pending.action !== "close_demands_bulk" &&
    pending.action !== "close_demand"
  ) {
    return false;
  }
  if (normalizeCapability(plan.action.capability) !== "SEARCHES") return false;
  if (normalizeOperation(plan.action.operation) !== "CLOSE") return false;
  const scope = normalizeScope(plan.action.scope);
  if (pending.action === "close_demands_bulk") {
    return scope === "ALL_AUTHORIZED" || scope == null;
  }
  return scope === "ONE" || scope == null;
}

export function isSearchCloseAmendment(
  pending: ConversationState["pendingConfirmation"],
  plan: AgentTurnPlan
): boolean {
  if (!pending || pending.action !== "close_demands_bulk") return false;
  if (normalizeCapability(plan.action.capability) !== "SEARCHES") return false;
  if (normalizeOperation(plan.action.operation) !== "CLOSE") return false;
  if (plan.action.kind !== "PROPOSE_MUTATION") return false;
  const scope = normalizeScope(plan.action.scope);
  return scope === "ONE" || scope === "MANY" || scope === "REFERENCED_SET";
}

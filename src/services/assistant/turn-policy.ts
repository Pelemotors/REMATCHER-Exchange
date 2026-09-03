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
      return ["getMyExchangeState"];
    case "get_my_validations":
      return ["getMyPendingValidations"];
    case "get_my_opportunities":
      return ["getMyOpportunities"];
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

  return { decision: "ALLOW" };
}

const SEARCH_CAPS = new Set(["searches", "search", "demands", "demand"]);
const OTHER_CAPS = new Set([
  "matches",
  "match",
  "opportunities",
  "activity",
  "validations",
  "broker",
  "commercial",
  "help",
]);

export function planHasVehicleFacts(plan: AgentTurnPlan): boolean {
  const fields = ["make", "model", "year", "mileage", "b2bPrice", "retailPrice"];
  return (
    plan.facts.add.some((f) => fields.includes(f.field)) ||
    plan.facts.correct.some((f) => fields.includes(f.field))
  );
}

function capabilityOf(plan: AgentTurnPlan): string {
  return (plan.action.capability ?? "").toLowerCase();
}

/** Inventory may execute this turn only when the plan actually targets inventory work. */
export function inventoryOwnsTurn(params: {
  plan: AgentTurnPlan;
  conversation?: ConversationState;
}): boolean {
  const { plan, conversation } = params;
  const cap = capabilityOf(plan);
  if (SEARCH_CAPS.has(cap) || OTHER_CAPS.has(cap)) return false;
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
  if (conversation?.pendingInventoryDraft) {
    return (
      plan.conversation.keepCurrentTask &&
      (hasInventoryFacts || cap === "inventory")
    );
  }
  return cap === "inventory" && hasInventoryFacts;
}

export function searchesMutationProposed(plan: AgentTurnPlan): boolean {
  const cap = capabilityOf(plan);
  if (plan.action.kind !== "PROPOSE_MUTATION") return false;
  if (SEARCH_CAPS.has(cap)) return true;
  if (plan.action.toolGoal === "get_my_searches") return true;
  return false;
}

/** Demand/search close — plan + authorized snapshot, not page route. */
export function shouldProposeDemandClosure(params: {
  plan: AgentTurnPlan;
  conversation?: ConversationState;
}): boolean {
  const { plan, conversation } = params;
  if (inventoryOwnsTurn(params)) return false;
  if (searchesMutationProposed(plan)) return true;
  if (plan.action.kind !== "PROPOSE_MUTATION") return false;
  const demandCount =
    conversation?.lastAuthorizedSnapshot?.activeDemandCount ??
    conversation?.lastList?.filter((i) => i.type === "demand").length ??
    0;
  return demandCount > 0 && !planHasVehicleFacts(plan);
}

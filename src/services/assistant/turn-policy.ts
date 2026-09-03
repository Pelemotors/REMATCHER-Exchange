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

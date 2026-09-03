/**
 * Action Gateway — deterministic write boundary for Agent 4.0.
 * GPT proposes ActionProposal; Gateway authorizes, resolves, confirms, executes.
 */
import "server-only";
import type { ActionProposal } from "@/services/assistant/action-proposal";
import type { ConversationState } from "@/services/assistant/conversation-state";
import type { AgentMeta } from "@/services/assistant/tools/registry";
import type { AssistantResponse } from "@/services/assistant/orchestrator";
import type { AgentTurnPlan } from "@/services/assistant/agent-turn-plan";
import {
  executeSearchMutation,
  handleSearchCapability,
} from "@/services/assistant/search-capability";
import { handleInventoryIngestTurn } from "@/services/assistant/inventory-ingest";
import { handleInventoryManageTurn } from "@/services/assistant/inventory-manage";
import { turnPlanToEvent } from "@/services/assistant/turn-planner";
import {
  assertVehicleOwned,
} from "@/services/assistant/target-resolution";
import {
  executeConfirmValidation,
  markMyVehicleSold,
} from "@/services/assistant/tools/action-tools";
import { pendingSearchCloseMatchesPlan } from "@/services/assistant/turn-policy";

type GatewayResponse = AssistantResponse & {
  conversation?: ConversationState;
  meta?: AgentMeta;
};

function proposalToPlan(
  proposal: ActionProposal,
  message: string
): AgentTurnPlan {
  const facts = Object.entries(proposal.facts ?? {}).map(([field, value]) => ({
    field,
    value:
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
        ? value
        : value === undefined
          ? null
          : String(value),
    confidence: "medium" as const,
  }));

  return {
    understanding: {
      userGoal: proposal.reason ?? `${proposal.operation} ${proposal.capability}`,
      messageMeaning: message.slice(0, 200),
      refersToCurrentTask: false,
      refersToActiveObject: false,
      targetReference: proposal.targetReference,
    },
    responseNeed: { shouldAnswerNow: true, answerGoal: null },
    conversation: {
      keepCurrentTask: false,
      suspendCurrentTask: false,
      resumeTaskReference: null,
      correctedUnderstanding: null,
      queuedFollowUp: null,
    },
    facts: { add: facts, correct: [], reject: [] },
    action: {
      kind: "PROPOSE_MUTATION",
      capability: proposal.capability,
      operation: proposal.operation,
      scope: proposal.scope,
      toolGoal: null,
      targetReference: proposal.targetReference,
    },
    clarification: { needed: false, reason: null, suggestedQuestion: null },
    telemetryHint: { relation: "NEW_REQUEST", questionAbout: null },
    confidence: 0.8,
    source: "ai",
  };
}

export async function runActionGateway(params: {
  dealerId: string;
  userId: string;
  message: string;
  proposal: ActionProposal;
  conversation?: ConversationState;
  meta: AgentMeta;
  entityType?: string;
  entityId?: string;
}): Promise<GatewayResponse> {
  const { proposal, conversation, meta, message } = params;
  meta.executor = "action_gateway";
  meta.capability = proposal.capability;
  meta.operation = proposal.operation;
  meta.scope = proposal.scope;
  meta.legacyPlannerUsed = false;

  if (proposal.kind === "CANCEL_PENDING") {
    meta.policyResult = "ALLOW";
    meta.responseType = "cancelled";
    return {
      intent: "UNKNOWN",
      message: "בוטל. לא בוצעה פעולה.",
      conversation: {
        lastList: conversation?.lastList,
        pendingInventoryDraft: conversation?.pendingInventoryDraft,
        pendingSearchDraft: conversation?.pendingSearchDraft,
        sessionContext: conversation?.sessionContext,
        suspendedContext: conversation?.suspendedContext,
        recentTurns: conversation?.recentTurns,
      },
      meta,
    };
  }

  if (proposal.kind === "CONFIRM_PENDING") {
    const pending = conversation?.pendingConfirmation;
    if (!pending) {
      meta.policyResult = "REQUIRE_CLARIFICATION";
      return {
        intent: "UNKNOWN",
        message: "אין פעולה ממתינה לאישור. מה תרצה לעשות?",
        conversation,
        meta,
      };
    }
    meta.policyResult = "REQUIRE_CONFIRMATION";
    const searchDone = await executeSearchMutation({
      dealerId: params.dealerId,
      pending,
      conversation,
      meta,
    });
    if (searchDone) {
      meta.executor = "action_gateway_confirm";
      return searchDone;
    }
    if (pending.action === "create_inventory") {
      const inventoryTurn = await handleInventoryIngestTurn({
        dealerId: params.dealerId,
        userId: params.userId,
        message,
        conversation,
        meta,
      });
      if (inventoryTurn) return inventoryTurn;
    }
    if (pending.action === "confirm_validation") {
      const validationId = pending.payload.validationId as string;
      await executeConfirmValidation(params.dealerId, validationId, true);
      meta.responseType = "mutation_validation";
      return {
        intent: "VALIDATION",
        message: "אישרת זמינות. Exchange ממשיך לבדוק התאמות.",
        meta,
      };
    }
    if (pending.action === "mark_sold") {
      const vehicleId = pending.payload.vehicleId as string;
      if (!(await assertVehicleOwned(params.dealerId, vehicleId))) {
        return {
          intent: "UPDATE_INVENTORY",
          message: "אין הרשאה לרכב הזה.",
          meta,
        };
      }
      await markMyVehicleSold(params.dealerId, vehicleId);
      return {
        intent: "UPDATE_INVENTORY",
        message: "הרכב הוסר מהמלאי הפעיל.",
        meta,
      };
    }
    if (pending.action === "update_inventory") {
      const manageTurn = await handleInventoryManageTurn({
        dealerId: params.dealerId,
        message,
        conversation,
        meta,
        turn: turnPlanToEvent(proposalToPlan(proposal, message)),
      });
      if (manageTurn) return manageTurn;
    }
    return {
      intent: "UNKNOWN",
      message: "לא הצלחתי לאשר את הפעולה הממתינה.",
      conversation,
      meta,
    };
  }

  // PROPOSE — if restating same pending close, execute instead of re-proposing
  if (
    conversation?.pendingConfirmation &&
    proposal.capability === "SEARCHES" &&
    proposal.operation === "CLOSE" &&
    pendingSearchCloseMatchesPlan(
      conversation.pendingConfirmation,
      proposalToPlan(proposal, message)
    ) &&
    proposal.scope !== "MANY" &&
    proposal.scope !== "ONE" &&
    proposal.scope !== "REFERENCED_SET"
  ) {
    const searchDone = await executeSearchMutation({
      dealerId: params.dealerId,
      pending: conversation.pendingConfirmation,
      conversation,
      meta,
    });
    if (searchDone) {
      meta.executor = "action_gateway_confirm_restated";
      meta.policyResult = "ALLOW";
      return searchDone;
    }
  }

  meta.policyResult = "REQUIRE_CONFIRMATION";
  const plan = proposalToPlan(proposal, message);
  const turn = turnPlanToEvent(plan);

  if (proposal.capability === "SEARCHES") {
    if (
      proposal.operation === "CREATE" ||
      proposal.operation === "UPDATE" ||
      proposal.operation === "CLOSE" ||
      proposal.operation === "RENEW"
    ) {
      return handleSearchCapability({
        dealerId: params.dealerId,
        userId: params.userId,
        message,
        plan,
        operation: proposal.operation,
        scope: proposal.scope,
        conversation,
        meta,
      });
    }
  }

  if (proposal.capability === "INVENTORY") {
    if (proposal.operation === "UPDATE" || proposal.operation === "MARK_SOLD") {
      const focusedId =
        conversation?.focusedObject?.type === "vehicle"
          ? conversation.focusedObject.id
          : params.entityType === "vehicle"
            ? params.entityId
            : undefined;
      if (focusedId && !(await assertVehicleOwned(params.dealerId, focusedId))) {
        return {
          intent: "UPDATE_INVENTORY",
          message: "אין הרשאה לרכב הזה.",
          meta,
        };
      }
      const manageTurn = await handleInventoryManageTurn({
        dealerId: params.dealerId,
        message,
        conversation,
        meta,
        turn,
        focusedVehicleId: focusedId,
      });
      if (manageTurn) return manageTurn;
    }
    if (proposal.operation === "CREATE" || proposal.operation === "UPDATE") {
      const inventoryTurn = await handleInventoryIngestTurn({
        dealerId: params.dealerId,
        userId: params.userId,
        message,
        conversation,
        meta,
        turn,
        forceStart: proposal.operation === "CREATE",
      });
      if (inventoryTurn) return inventoryTurn;
    }
  }

  if (
    proposal.capability === "VALIDATIONS" &&
    proposal.operation === "CONFIRM_VALIDATION"
  ) {
    return {
      intent: "VALIDATION",
      message: "כדי לאשר זמינות צריך לבחור אימות מאושר. עבור למסך האימותים או ציין איזה רכב.",
      suggestions: [{ label: "אימותים", href: "/validations" }],
      conversation,
      meta,
    };
  }

  return {
    intent: "UNKNOWN",
    message:
      "הפעולה הזו עדיין לא מחוברת בבטחה דרך הסוכן. אפשר לבצע אותה במסך המתאים, או לנסח שוב.",
    conversation,
    meta,
  };
}

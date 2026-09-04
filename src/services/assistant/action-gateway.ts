/**
 * Action Gateway — deterministic write boundary for Agent 4.0.
 * GPT understands the request; REMATCHER authorizes, resolves, confirms and executes.
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
import { handleInventoryManageTurn } from "@/services/assistant/inventory-manage";
import { turnPlanToEvent } from "@/services/assistant/turn-planner";
import { assertVehicleOwned } from "@/services/assistant/target-resolution";
import {
  executeConfirmInventoryCreate,
  executeConfirmValidation,
  markMyVehicleSold,
} from "@/services/assistant/tools/action-tools";
import {
  applyInventoryDraftFacts,
  inventoryDraftSnapshot,
  prepareInventoryDraftConfirmation,
} from "@/services/assistant/inventory-draft-state";
import { pendingSearchCloseMatchesPlan } from "@/services/assistant/turn-policy";

type GatewayResponse = AssistantResponse & {
  conversation?: ConversationState;
  meta?: AgentMeta;
  inventoryMutationResult?: {
    type: "created" | "updated" | "sold";
    vehicleId: string;
  };
};

/**
 * Legacy bridge kept only for domain executors that still consume AgentTurnPlan.
 * It is no longer used to understand conversational inventory drafts.
 */
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

function cancelPendingConversation(
  conversation: ConversationState | undefined
): ConversationState | undefined {
  if (!conversation) return conversation;
  const draft = conversation.pendingInventoryDraft;
  return {
    ...conversation,
    pendingConfirmation: undefined,
    pendingInventoryDraft:
      draft?.status === "WAITING_CONFIRMATION"
        ? { ...draft, status: "DRAFT" }
        : draft,
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
      conversation: cancelPendingConversation(conversation),
      meta,
    };
  }

  if (proposal.kind === "CONFIRM_PENDING") {
    const pending = conversation?.pendingConfirmation;
    if (!pending) {
      meta.policyResult = "REQUIRE_CLARIFICATION";
      return {
        intent: "UNKNOWN",
        message: "אין פעולה ממתינה לאישור.",
        conversation,
        meta,
      };
    }

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
      const draft = conversation?.pendingInventoryDraft;
      if (!draft) {
        meta.policyResult = "REQUIRE_CLARIFICATION";
        return {
          intent: "UPDATE_INVENTORY",
          message: "אין כרגע טיוטת רכב לשמירה.",
          conversation,
          meta,
        };
      }
      const snapshot = inventoryDraftSnapshot(draft);
      if (!snapshot.canSave) {
        meta.policyResult = "REQUIRE_CLARIFICATION";
        return {
          intent: "UPDATE_INVENTORY",
          message: "עדיין חסרים פרטי הזיהוי הבסיסיים של הרכב לפני שמירה.",
          conversation: {
            ...conversation,
            pendingConfirmation: undefined,
            pendingInventoryDraft: { ...draft, status: "DRAFT" },
          },
          meta,
        };
      }

      const result = await executeConfirmInventoryCreate(params.dealerId, draft);
      if (!result.ok) {
        meta.policyResult = "DENY";
        return {
          intent: "UPDATE_INVENTORY",
          message: result.message ?? "לא הצלחתי לשמור את הרכב.",
          conversation,
          meta,
        };
      }

      meta.policyResult = "ALLOW";
      meta.responseType = "mutation_inventory_create";
      return {
        intent: "UPDATE_INVENTORY",
        message: "הרכב נשמר במלאי.",
        conversation: {
          ...conversation,
          pendingInventoryDraft: undefined,
          pendingConfirmation: undefined,
        },
        inventoryMutationResult: {
          type: "created",
          vehicleId: result.vehicle.id,
        },
        meta,
      };
    }

    if (pending.action === "confirm_validation") {
      const validationId = pending.payload.validationId as string;
      await executeConfirmValidation(params.dealerId, validationId, true);
      meta.policyResult = "ALLOW";
      meta.responseType = "mutation_validation";
      return {
        intent: "VALIDATION",
        message: "אישרת זמינות. Exchange ממשיך לבדוק התאמות.",
        conversation: { ...conversation, pendingConfirmation: undefined },
        meta,
      };
    }

    if (pending.action === "mark_sold") {
      const vehicleId = pending.payload.vehicleId as string;
      if (!(await assertVehicleOwned(params.dealerId, vehicleId))) {
        meta.policyResult = "DENY";
        return {
          intent: "UPDATE_INVENTORY",
          message: "אין הרשאה לרכב הזה.",
          conversation,
          meta,
        };
      }
      await markMyVehicleSold(params.dealerId, vehicleId);
      meta.policyResult = "ALLOW";
      return {
        intent: "UPDATE_INVENTORY",
        message: "הרכב הוסר מהמלאי הפעיל.",
        conversation: { ...conversation, pendingConfirmation: undefined },
        inventoryMutationResult: { type: "sold", vehicleId },
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

  // Existing deterministic search safety is retained.
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

  if (proposal.capability === "SEARCHES") {
    if (
      proposal.operation === "CREATE" ||
      proposal.operation === "UPDATE" ||
      proposal.operation === "CLOSE" ||
      proposal.operation === "RENEW"
    ) {
      const plan = proposalToPlan(proposal, message);
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
    const focusedId =
      conversation?.focusedObject?.type === "vehicle"
        ? conversation.focusedObject.id
        : params.entityType === "vehicle"
          ? params.entityId
          : undefined;

    // Saving an unsaved conversational draft: no planner, no TurnEvent, no text parsing.
    if (proposal.operation === "CREATE") {
      let nextConversation = conversation ?? {};
      if (proposal.facts && Object.keys(proposal.facts).length > 0) {
        nextConversation = applyInventoryDraftFacts({
          conversation: nextConversation,
          facts: proposal.facts,
          sourceText: message,
        }).conversation;
      }

      const prepared = prepareInventoryDraftConfirmation(nextConversation);
      if (!prepared) {
        meta.policyResult = "REQUIRE_CLARIFICATION";
        return {
          intent: "UPDATE_INVENTORY",
          message: "לפני שמירה צריך לזהות לפחות יצרן, דגם ושנה.",
          conversation: nextConversation,
          meta,
        };
      }

      meta.responseType = "confirmation_inventory";
      return {
        intent: "UPDATE_INVENTORY",
        message: "לשמור את הרכב הזה במלאי?",
        requiresConfirmation: prepared.pendingConfirmation,
        suggestions: [{ label: "שמור במלאי" }, { label: "ביטול" }],
        conversation: prepared,
        meta,
      };
    }

    // Defensive fallback: if GPT proposed UPDATE for an unsaved draft, merge only
    // the structured facts. This is state handling, not language interpretation.
    if (
      proposal.operation === "UPDATE" &&
      conversation?.pendingInventoryDraft &&
      !focusedId
    ) {
      const updated = applyInventoryDraftFacts({
        conversation,
        facts: proposal.facts,
        sourceText: message,
      });
      meta.policyResult = "ALLOW";
      meta.responseType = "inventory_draft_state";
      return {
        intent: "UPDATE_INVENTORY",
        message: "עדכנתי את הטיוטה. עדיין לא נשמר דבר במלאי.",
        conversation: updated.conversation,
        meta,
      };
    }

    // Saved-vehicle mutations retain the existing deterministic executor for now.
    if (proposal.operation === "UPDATE" || proposal.operation === "MARK_SOLD") {
      if (focusedId && !(await assertVehicleOwned(params.dealerId, focusedId))) {
        meta.policyResult = "DENY";
        return {
          intent: "UPDATE_INVENTORY",
          message: "אין הרשאה לרכב הזה.",
          conversation,
          meta,
        };
      }
      const plan = proposalToPlan(proposal, message);
      const manageTurn = await handleInventoryManageTurn({
        dealerId: params.dealerId,
        message,
        conversation,
        meta,
        turn: turnPlanToEvent(plan),
        focusedVehicleId: focusedId,
      });
      if (manageTurn) return manageTurn;
    }
  }

  if (
    proposal.capability === "VALIDATIONS" &&
    proposal.operation === "CONFIRM_VALIDATION"
  ) {
    return {
      intent: "VALIDATION",
      message:
        "כדי לאשר זמינות צריך לבחור אימות מאושר. עבור למסך האימותים או ציין איזה רכב.",
      suggestions: [{ label: "אימותים", href: "/validations" }],
      conversation,
      meta,
    };
  }

  return {
    intent: "UNKNOWN",
    message:
      "הפעולה הזו עדיין לא מחוברת בבטחה דרך הסוכן. אפשר לבצע אותה במסך המתאים.",
    conversation,
    meta,
  };
}

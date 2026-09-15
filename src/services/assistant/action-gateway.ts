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

    if (pending.action === "intake_resolve") {
      const { resolveIntakeCandidate } = await import(
        "@/services/intake/review"
      );
      const candidateId = String(pending.payload.candidateId ?? "");
      const op = String(pending.payload.operation ?? "");
      const facts =
        (pending.payload.facts as Record<string, unknown> | undefined) ?? {};
      const result = await resolveIntakeCandidate({
        dealerId: params.dealerId,
        candidateId,
        reject: op === "REJECT_CANDIDATE",
        detectedPlate:
          typeof facts.detectedPlate === "string" ? facts.detectedPlate : undefined,
        askingPrice:
          typeof facts.askingPrice === "number" ? facts.askingPrice : undefined,
        mileage: typeof facts.mileage === "number" ? facts.mileage : undefined,
        confirmExistingVehicleId:
          typeof facts.confirmExistingVehicleId === "string"
            ? facts.confirmExistingVehicleId
            : undefined,
        createNewDespiteExisting: Boolean(facts.createNewDespiteExisting),
      });
      meta.policyResult = result.ok ? "ALLOW" : "DENY";
      meta.responseType = "mutation_intake";
      const msg = !result.ok
        ? `לא הצלחתי להשלים את הקליטה (${"error" in result ? result.error : "שגיאה"}).`
        : "rejected" in result && result.rejected
          ? "המועמד נדחה."
          : "vehicleId" in result && result.vehicleId
            ? "הקליטה הושלמה והרכב נשמר במלאי."
            : "הקליטה עודכנה.";
      return {
        intent: "UPDATE_INVENTORY",
        message: msg,
        conversation: { ...conversation, pendingConfirmation: undefined },
        meta,
        ...(result.ok &&
        "vehicleId" in result &&
        result.vehicleId
          ? {
              inventoryMutationResult: {
                type: "created" as const,
                vehicleId: result.vehicleId,
              },
            }
          : {}),
      };
    }

    if (pending.action === "intake_retry") {
      const { processIntakeBatch } = await import(
        "@/services/intake/process-batch"
      );
      const batchId = String(pending.payload.batchId ?? "");
      try {
        await processIntakeBatch(params.dealerId, batchId);
        meta.policyResult = "ALLOW";
        meta.responseType = "mutation_intake_retry";
        return {
          intent: "UPDATE_INVENTORY",
          message: "הפעלתי מחדש את עיבוד האצווה. אפשר לבדוק ב־/intake/review.",
          conversation: { ...conversation, pendingConfirmation: undefined },
          meta,
        };
      } catch {
        meta.policyResult = "DENY";
        return {
          intent: "UPDATE_INVENTORY",
          message: "לא הצלחתי להריץ מחדש את האצווה.",
          conversation: { ...conversation, pendingConfirmation: undefined },
          meta,
        };
      }
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

  if (proposal.capability === "INTAKE") {
    const facts = proposal.facts ?? {};
    const candidateId =
      typeof facts.candidateId === "string"
        ? facts.candidateId
        : typeof proposal.targetReference === "string" &&
            /^[a-z0-9_-]{8,}$/i.test(proposal.targetReference)
          ? proposal.targetReference
          : null;
    const batchId =
      typeof facts.batchId === "string" ? facts.batchId : null;

    if (
      proposal.operation === "CONFIRM_CANDIDATE" ||
      proposal.operation === "RESOLVE_CANDIDATE" ||
      proposal.operation === "REJECT_CANDIDATE" ||
      proposal.operation === "UPDATE"
    ) {
      if (!candidateId) {
        meta.policyResult = "REQUIRE_CLARIFICATION";
        return {
          intent: "UPDATE_INVENTORY",
          message:
            "כדי לטפל במועמד קליטה צריך לזהות איזה מועמד — אפשר לעבור ל־/intake/review.",
          suggestions: [{ label: "סקירת קליטה", href: "/intake/review" }],
          conversation,
          meta,
        };
      }

      if (!conversation?.pendingConfirmation) {
        const label =
          proposal.operation === "REJECT_CANDIDATE"
            ? "לדחות את מועמד הקליטה?"
            : "לאשר/להשלים את מועמד הקליטה?";
        meta.policyResult = "REQUIRE_CONFIRMATION";
        meta.responseType = "confirmation_intake";
        const pending = {
          action: "intake_resolve",
          label,
          payload: {
            capability: "INTAKE",
            operation: proposal.operation,
            candidateId,
            facts,
          },
        };
        return {
          intent: "UPDATE_INVENTORY",
          message: label,
          requiresConfirmation: pending,
          suggestions: [{ label: "כן" }, { label: "לא" }],
          conversation: {
            ...conversation,
            pendingConfirmation: pending,
          },
          meta,
        };
      }
    }

    if (proposal.operation === "RETRY_INTAKE") {
      if (!batchId) {
        meta.policyResult = "REQUIRE_CLARIFICATION";
        return {
          intent: "UPDATE_INVENTORY",
          message: "כדי לנסות שוב קליטה צריך מזהה אצווה. אפשר לעבור ל־/intake.",
          suggestions: [{ label: "קליטה", href: "/intake" }],
          conversation,
          meta,
        };
      }
      if (!conversation?.pendingConfirmation) {
        const pending = {
          action: "intake_retry",
          label: "להריץ מחדש את עיבוד האצווה?",
          payload: { capability: "INTAKE", operation: "RETRY_INTAKE", batchId },
        };
        meta.policyResult = "REQUIRE_CONFIRMATION";
        return {
          intent: "UPDATE_INVENTORY",
          message: pending.label,
          requiresConfirmation: pending,
          suggestions: [{ label: "כן" }, { label: "לא" }],
          conversation: { ...conversation, pendingConfirmation: pending },
          meta,
        };
      }
    }
  }

  return {
    intent: "UNKNOWN",
    message:
      "הפעולה הזו עדיין לא מחוברת בבטחה דרך הסוכן. אפשר לבצע אותה במסך המתאים.",
    conversation,
    meta,
  };
}

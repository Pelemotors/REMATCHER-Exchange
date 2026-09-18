import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  ConversationState,
  PendingConfirmation,
} from "@/services/assistant/conversation-state";
import {
  createPendingAction,
  markActionFailed,
  markActionSucceeded,
} from "@/services/conversation/actions";
import { appendMessage } from "@/services/conversation/messages";
import { saveThreadAgentState } from "@/services/assistant/conversation-persistence";
import type { ConversationPrincipal } from "@/services/conversation/types";

export type ProjectionClearance =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "no_execution";

function uniquePendingKey(action: string): string {
  return `gateway_pending:${action}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Project agent pendingConfirmation onto ConversationAction + ACTION_* messages.
 * SUCCESS/FAIL must come from deterministic clearance — never from assistant text regex.
 */
export async function syncGatewayPendingProjection(input: {
  principal: ConversationPrincipal;
  threadId: string;
  previous: ConversationState | undefined;
  next: ConversationState | undefined;
  assistantMessage?: string;
  /** Required when pending is cleared — executor/confirm path decides. */
  clearance?: ProjectionClearance;
}): Promise<ConversationState | undefined> {
  const prevPending = input.previous?.pendingConfirmation;
  const nextPending = input.next?.pendingConfirmation;
  let state = input.next;

  if (
    nextPending &&
    (!prevPending ||
      prevPending.action !== nextPending.action ||
      prevPending.conversationActionId !== nextPending.conversationActionId)
  ) {
    // New business pending — always a fresh ConversationAction (unique key).
    if (!nextPending.conversationActionId) {
      const { action: pendingAction } = await createPendingAction(
        input.principal,
        {
          threadId: input.threadId,
          actionType: nextPending.action,
          payloadJson: nextPending.payload,
          gatewayActionId: nextPending.action,
          idempotencyKey: uniquePendingKey(nextPending.action),
        }
      );

      const withId: PendingConfirmation = {
        ...nextPending,
        conversationActionId: pendingAction.id,
      };
      state = {
        ...(input.next ?? {}),
        pendingConfirmation: withId,
      };
      await saveThreadAgentState(input.principal, input.threadId, state);

      await appendMessage(input.principal, {
        threadId: input.threadId,
        role: "ASSISTANT",
        kind: "ACTION_CONFIRMATION",
        text: withId.label ?? input.assistantMessage ?? "נדרש אישור",
        payloadJson: {
          actionId: pendingAction.id,
          conversationActionId: pendingAction.id,
          action: withId.action,
          label: withId.label,
          payload: withId.payload,
        },
        idempotencyKey: `action_confirm_msg:${pendingAction.id}`,
        source: "action_gateway",
      });
    }
    return state;
  }

  if (prevPending && !nextPending) {
    const row = await prisma.conversationAction.findFirst({
      where: {
        threadId: input.threadId,
        status: { in: ["PENDING_CONFIRMATION", "EXECUTING"] },
        ...(prevPending.conversationActionId
          ? { id: prevPending.conversationActionId }
          : { gatewayActionId: prevPending.action }),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return state;

    const clearance = input.clearance;
    if (!clearance) {
      // Pending cleared without deterministic outcome — leave ConversationAction PENDING.
      // Do not infer SUCCEEDED from assistant wording (Action Truth).
      return state;
    }

    if (clearance === "succeeded") {
      await markActionSucceeded(input.principal, row.id, {
        action: prevPending.action,
      });
      await appendMessage(input.principal, {
        threadId: input.threadId,
        role: "SYSTEM",
        kind: "ACTION_RESULT",
        text: input.assistantMessage ?? "הפעולה הושלמה",
        payloadJson: { actionId: row.id, status: "SUCCEEDED" },
        idempotencyKey: `action_result:${row.id}:ok`,
        source: "action_gateway",
      });
    } else if (clearance === "cancelled") {
      await patchActionCancelled(input.principal, row.id, {
        reason: "cancelled",
      });
      await appendMessage(input.principal, {
        threadId: input.threadId,
        role: "SYSTEM",
        kind: "ACTION_RESULT",
        text: input.assistantMessage ?? "הפעולה בוטלה",
        payloadJson: { actionId: row.id, status: "CANCELLED" },
        idempotencyKey: `action_result:${row.id}:cancelled`,
        source: "action_gateway",
      });
    } else if (clearance === "no_execution") {
      // Clarification / validation — pending cleared without mutation. Not SUCCESS.
      await patchActionCancelled(input.principal, row.id, {
        reason: "no_execution",
        outcome: "NO_EXECUTION",
      });
      await appendMessage(input.principal, {
        threadId: input.threadId,
        role: "SYSTEM",
        kind: "ACTION_RESULT",
        text: input.assistantMessage ?? "לא בוצעה פעולה",
        payloadJson: {
          actionId: row.id,
          status: "CANCELLED",
          outcome: "NO_EXECUTION",
        },
        idempotencyKey: `action_result:${row.id}:no_execution`,
        source: "action_gateway",
      });
    } else {
      await markActionFailed(input.principal, row.id, {
        reason: clearance,
      });
      await appendMessage(input.principal, {
        threadId: input.threadId,
        role: "SYSTEM",
        kind: "ACTION_RESULT",
        text: input.assistantMessage ?? "הפעולה נכשלה",
        payloadJson: { actionId: row.id, status: "FAILED" },
        idempotencyKey: `action_result:${row.id}:failed`,
        source: "action_gateway",
      });
    }
  }

  return state;
}

async function patchActionCancelled(
  principal: ConversationPrincipal,
  actionId: string,
  resultJson?: unknown
) {
  const { markActionCancelled } = await import(
    "@/services/conversation/actions"
  );
  return markActionCancelled(principal, actionId, resultJson);
}

export async function assertPendingActionOnThread(input: {
  principal: ConversationPrincipal;
  threadId: string;
  /** ConversationAction.id — required for Mobile Conversation confirm. */
  actionId?: string;
  /**
   * Legacy fallback: gateway action type string.
   * Must not be mutation authority for the new Conversation product.
   */
  actionType?: string;
  /** When set, must equal ConversationThread pending Confirmation id. */
  threadPendingActionId?: string | null;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      reason: "no_pending" | "wrong_thread" | "mismatch" | "action_id_required";
    }
> {
  if (!input.actionId && !input.actionType) {
    return { ok: false, reason: "action_id_required" };
  }

  if (input.actionId) {
    const byId = await prisma.conversationAction.findUnique({
      where: { id: input.actionId },
    });
    if (!byId) return { ok: false, reason: "no_pending" };
    if (byId.threadId !== input.threadId) {
      return { ok: false, reason: "wrong_thread" };
    }
    if (byId.status !== "PENDING_CONFIRMATION") {
      return { ok: false, reason: "no_pending" };
    }
    if (
      input.threadPendingActionId != null &&
      input.threadPendingActionId !== input.actionId
    ) {
      return { ok: false, reason: "mismatch" };
    }
    const thread = await prisma.conversationThread.findUnique({
      where: { id: input.threadId },
      select: { dealerId: true },
    });
    if (!thread || thread.dealerId !== input.principal.dealerId) {
      return { ok: false, reason: "wrong_thread" };
    }
    return { ok: true };
  }

  // Legacy actionType-only path — existence check only (not Mobile Conversation).
  const pending = await prisma.conversationAction.findFirst({
    where: {
      threadId: input.threadId,
      status: "PENDING_CONFIRMATION",
      ...(input.actionType ? { gatewayActionId: input.actionType } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) return { ok: false, reason: "no_pending" };
  return { ok: true };
}

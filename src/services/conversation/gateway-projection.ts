import "server-only";
import { prisma } from "@/lib/prisma";
import type { ConversationState } from "@/services/assistant/conversation-state";
import {
  createPendingAction,
  markActionFailed,
  markActionSucceeded,
} from "@/services/conversation/actions";
import { appendMessage } from "@/services/conversation/messages";
import type { ConversationPrincipal } from "@/services/conversation/types";

function pendingKey(action: string): string {
  return `gateway_pending:${action}`;
}

export async function syncGatewayPendingProjection(input: {
  principal: ConversationPrincipal;
  threadId: string;
  previous: ConversationState | undefined;
  next: ConversationState | undefined;
  assistantMessage?: string;
}): Promise<void> {
  const prevPending = input.previous?.pendingConfirmation;
  const nextPending = input.next?.pendingConfirmation;

  if (
    nextPending &&
    (!prevPending || prevPending.action !== nextPending.action)
  ) {
    const { action: pendingAction } = await createPendingAction(
      input.principal,
      {
        threadId: input.threadId,
        actionType: nextPending.action,
        payloadJson: nextPending.payload,
        gatewayActionId: nextPending.action,
        idempotencyKey: pendingKey(nextPending.action),
      }
    );

    await appendMessage(input.principal, {
      threadId: input.threadId,
      role: "ASSISTANT",
      kind: "ACTION_CONFIRMATION",
      text: nextPending.label ?? input.assistantMessage ?? "נדרש אישור",
      payloadJson: {
        actionId: pendingAction.id,
        action: nextPending.action,
        payload: nextPending.payload,
      },
      idempotencyKey: `action_confirm_msg:${nextPending.action}`,
      source: "action_gateway",
    });
    return;
  }

  if (prevPending && !nextPending) {
    const row = await prisma.conversationAction.findFirst({
      where: {
        threadId: input.threadId,
        status: "PENDING_CONFIRMATION",
        gatewayActionId: prevPending.action,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return;

    const rejected =
      input.assistantMessage &&
      /ביטל|לא בוצע|נדחה/i.test(input.assistantMessage);
    if (rejected) {
      await markActionFailed(input.principal, row.id, {
        reason: "rejected",
      });
      await appendMessage(input.principal, {
        threadId: input.threadId,
        role: "SYSTEM",
        kind: "ACTION_RESULT",
        text: input.assistantMessage ?? "הפעולה בוטלה",
        payloadJson: { actionId: row.id, status: "FAILED" },
        idempotencyKey: `action_result:${row.id}:failed`,
        source: "action_gateway",
      });
    } else {
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
    }
  }
}

export async function assertPendingActionOnThread(input: {
  principal: ConversationPrincipal;
  threadId: string;
  actionId?: string;
}): Promise<{ ok: true } | { ok: false; reason: "no_pending" | "wrong_thread" }> {
  const pending = await prisma.conversationAction.findFirst({
    where: {
      threadId: input.threadId,
      status: "PENDING_CONFIRMATION",
      ...(input.actionId ? { id: input.actionId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) {
    if (input.actionId) {
      const elsewhere = await prisma.conversationAction.findUnique({
        where: { id: input.actionId },
      });
      if (elsewhere && elsewhere.threadId !== input.threadId) {
        return { ok: false, reason: "wrong_thread" };
      }
    }
    return { ok: false, reason: "no_pending" };
  }
  if (input.actionId && pending.id !== input.actionId) {
    return { ok: false, reason: "wrong_thread" };
  }
  return { ok: true };
}

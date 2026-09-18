import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import type { ConversationState } from "@/services/assistant/conversation-state";
import {
  AGENT_CONVERSATION_TOPIC,
  loadAgentConversationState,
} from "@/services/assistant/conversation-persistence";
import { appendMessage } from "@/services/conversation/messages";
import { createThread } from "@/services/conversation/threads";
import type { ConversationPrincipal } from "@/services/conversation/types";

const LEGACY_THREAD_TITLE = "סוכן REMATCHER (legacy)";

export async function importLegacyAgentConversationThread(input: {
  principal: ConversationPrincipal;
  ownerUserId?: string;
}): Promise<{ threadId: string; importedMessages: number; droppedStalePending: boolean }> {
  const dealerId = input.principal.dealerId;
  const ownerUserId = input.ownerUserId ?? input.principal.userId;

  const existing = await prisma.conversationThread.findFirst({
    where: {
      dealerId,
      ownerUserId,
      source: "AGENT",
      title: LEGACY_THREAD_TITLE,
      status: { not: "DELETED" },
    },
  });
  if (existing) {
    return {
      threadId: existing.id,
      importedMessages: 0,
      droppedStalePending: false,
    };
  }

  const rawState = await loadAgentConversationState(dealerId);
  let state = rawState;
  let droppedStalePending = false;

  if (state?.pendingConfirmation) {
    const stillValid = await revalidatePendingConfirmation(
      dealerId,
      state.pendingConfirmation
    );
    if (!stillValid) {
      const { pendingConfirmation: _removed, ...rest } = state;
      state = rest as ConversationState;
      droppedStalePending = true;
    }
  }

  const thread = await createThread({
    principal: { dealerId, userId: ownerUserId },
    title: LEGACY_THREAD_TITLE,
    titleSource: "AUTO",
    source: "AGENT",
    agentStateJson: state,
  });

  await prisma.conversationThread.update({
    where: { id: thread.id },
    data: {
      agentStateJson: state ? toPrismaJson(state) : undefined,
      compactSummary: state?.compactSummary ?? null,
    },
  });

  const turns = state?.recentTurns ?? [];
  let imported = 0;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (!turn?.text?.trim()) continue;
    const role =
      turn.role === "user"
        ? "USER"
        : turn.role === "assistant"
          ? "ASSISTANT"
          : "SYSTEM";
    const key = `legacy_turn_${i}`;
    const { created } = await appendMessage(
      { dealerId, userId: ownerUserId },
      {
        threadId: thread.id,
        role,
        kind: "TEXT",
        text: turn.text,
        idempotencyKey: key,
        source: "legacy_migrate",
      }
    );
    if (created) imported += 1;
  }

  if (state?.pendingConfirmation && !droppedStalePending) {
    await prisma.conversationAction.create({
      data: {
        threadId: thread.id,
        actionType: state.pendingConfirmation.action,
        status: "PENDING_CONFIRMATION",
        payloadJson: toPrismaJson(state.pendingConfirmation.payload ?? {}),
        gatewayActionId: state.pendingConfirmation.action,
        idempotencyKey: `legacy_pending_${state.pendingConfirmation.action}`,
      },
    });
  }

  return {
    threadId: thread.id,
    importedMessages: imported,
    droppedStalePending,
  };
}

async function revalidatePendingConfirmation(
  dealerId: string,
  pending: NonNullable<ConversationState["pendingConfirmation"]>
): Promise<boolean> {
  const action = pending.action;
  if (action.startsWith("intake_")) {
    const batchId =
      typeof pending.payload?.batchId === "string"
        ? pending.payload.batchId
        : null;
    if (!batchId) return false;
    const batch = await prisma.intakeBatch.findFirst({
      where: { id: batchId, dealerId },
      select: { status: true },
    });
    return Boolean(batch && batch.status !== "COMMITTED" && batch.status !== "FAILED");
  }
  return true;
}

export async function legacyMemoryRowExists(dealerId: string): Promise<boolean> {
  const row = await prisma.dealerMemoryItem.findFirst({
    where: {
      dealerId,
      topicKey: AGENT_CONVERSATION_TOPIC,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return Boolean(row);
}

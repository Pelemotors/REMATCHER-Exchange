import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { assertThreadAccess } from "@/services/conversation/auth";
import type {
  ConversationPrincipal,
  CreatePendingActionInput,
} from "@/services/conversation/types";
import type {
  ConversationAction,
  ConversationActionStatus,
} from "@prisma/client";

async function upsertActionByKey(
  threadId: string,
  idempotencyKey: string,
  create: () => Promise<ConversationAction>
): Promise<{ action: ConversationAction; created: boolean }> {
  const existing = await prisma.conversationAction.findUnique({
    where: {
      threadId_idempotencyKey: { threadId, idempotencyKey },
    },
  });
  if (existing) return { action: existing, created: false };
  return { action: await create(), created: true };
}

export async function createPendingAction(
  principal: ConversationPrincipal,
  input: CreatePendingActionInput
): Promise<{ action: ConversationAction; created: boolean }> {
  await assertThreadAccess(principal, input.threadId);

  const data = {
    threadId: input.threadId,
    messageId: input.messageId ?? null,
    actionType: input.actionType,
    status: "PENDING_CONFIRMATION" as ConversationActionStatus,
    payloadJson: input.payloadJson ? toPrismaJson(input.payloadJson) : undefined,
    idempotencyKey: input.idempotencyKey ?? null,
    gatewayActionId: input.gatewayActionId ?? null,
  };

  if (input.idempotencyKey) {
    return upsertActionByKey(input.threadId, input.idempotencyKey, () =>
      prisma.conversationAction.create({ data })
    );
  }

  const action = await prisma.conversationAction.create({ data });
  return { action, created: true };
}

async function patchActionStatus(
  principal: ConversationPrincipal,
  actionId: string,
  status: ConversationActionStatus,
  resultJson?: unknown
): Promise<ConversationAction | null> {
  const row = await prisma.conversationAction.findUnique({
    where: { id: actionId },
  });
  if (!row) return null;
  await assertThreadAccess(principal, row.threadId);
  return prisma.conversationAction.update({
    where: { id: actionId },
    data: {
      status,
      ...(resultJson !== undefined
        ? { resultJson: toPrismaJson(resultJson) }
        : {}),
    },
  });
}

export async function markActionExecuting(
  principal: ConversationPrincipal,
  actionId: string
): Promise<ConversationAction | null> {
  return patchActionStatus(principal, actionId, "EXECUTING");
}

export async function markActionSucceeded(
  principal: ConversationPrincipal,
  actionId: string,
  resultJson?: unknown
): Promise<ConversationAction | null> {
  return patchActionStatus(principal, actionId, "SUCCEEDED", resultJson);
}

export async function markActionFailed(
  principal: ConversationPrincipal,
  actionId: string,
  resultJson?: unknown
): Promise<ConversationAction | null> {
  return patchActionStatus(principal, actionId, "FAILED", resultJson);
}

/**
 * Execute through the existing Action Gateway (mutation authority unchanged).
 * ConversationAction rows are projection only until gateway confirms execution.
 */
export async function executeActionViaGateway(input: {
  dealerId: string;
  userId: string;
  message: string;
  conversation?: import("@/services/assistant/conversation-state").ConversationState;
  proposal: import("@/services/assistant/action-proposal").ActionProposal;
}) {
  const { runActionGateway } = await import(
    "@/services/assistant/action-gateway"
  );
  const { AGENT_VERSION } = await import("@/services/assistant/tools/registry");
  const meta: import("@/services/assistant/tools/registry").AgentMeta = {
    agentVersion: AGENT_VERSION,
    plannerUsed: false,
    synthesizerUsed: false,
    model: null,
    tools: [],
    toolDurations: {},
    plannerDurationMs: 0,
    synthesisDurationMs: 0,
    fallbackReason: null,
    responseType: "conversation_action",
    executor: "conversation_workspace",
  };
  return runActionGateway({
    dealerId: input.dealerId,
    userId: input.userId,
    message: input.message,
    conversation: input.conversation,
    proposal: input.proposal,
    meta,
  });
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { assertThreadAccess } from "@/services/conversation/auth";
import type {
  AppendMessageInput,
  ConversationPrincipal,
} from "@/services/conversation/types";
import type { ConversationMessage } from "@prisma/client";

export type MessageListResult = {
  messages: ConversationMessage[];
  nextCursor: string | null;
};

export async function listMessages(input: {
  principal: ConversationPrincipal;
  threadId: string;
  limit?: number;
  cursor?: string;
}): Promise<MessageListResult> {
  await assertThreadAccess(input.principal, input.threadId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const rows = await prisma.conversationMessage.findMany({
    where: { threadId: input.threadId },
    orderBy: { createdAt: "asc" },
    take: limit + 1,
    ...(input.cursor
      ? { cursor: { id: input.cursor }, skip: 1 }
      : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    messages: page,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function appendMessage(
  principal: ConversationPrincipal,
  input: AppendMessageInput
): Promise<{ message: ConversationMessage; created: boolean }> {
  await assertThreadAccess(principal, input.threadId);

  if (input.idempotencyKey) {
    const existing = await prisma.conversationMessage.findUnique({
      where: {
        threadId_idempotencyKey: {
          threadId: input.threadId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      return { message: existing, created: false };
    }
  }

  const message = await prisma.conversationMessage.create({
    data: {
      threadId: input.threadId,
      role: input.role,
      kind: input.kind ?? "TEXT",
      text: input.text ?? null,
      payloadJson: input.payloadJson ? toPrismaJson(input.payloadJson) : undefined,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      intakeBatchId: input.intakeBatchId ?? null,
      source: input.source ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });

  await prisma.conversationThread.update({
    where: { id: input.threadId },
    data: { lastMessageAt: message.createdAt },
  });

  return { message, created: true };
}

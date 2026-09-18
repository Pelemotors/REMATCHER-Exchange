import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import {
  assertThreadAccess,
  ConversationAccessError,
} from "@/services/conversation/auth";
import { serializeThread } from "@/services/conversation/serialize";
import type {
  ConversationPrincipal,
  CreateThreadInput,
  ListThreadsInput,
  ThreadRecord,
} from "@/services/conversation/types";
import type { ConversationThreadStatus } from "@prisma/client";

function listWhere(principal: ConversationPrincipal, status?: ConversationThreadStatus) {
  const statusFilter = status ?? { not: "DELETED" as const };
  return {
    dealerId: principal.dealerId,
    status: statusFilter,
    OR: [
      { ownerUserId: principal.userId },
      { visibility: "DEALER_SHARED" as const },
    ],
  };
}

export async function createThread(input: CreateThreadInput): Promise<ThreadRecord> {
  const { principal } = input;
  const row = await prisma.conversationThread.create({
    data: {
      dealerId: principal.dealerId,
      ownerUserId: principal.userId,
      title: input.title?.trim() || "שיחה חדשה",
      titleSource: input.titleSource ?? "AUTO",
      source: input.source ?? "OTHER",
      visibility: input.visibility ?? "PRIVATE_USER",
      agentStateJson: input.agentStateJson
        ? toPrismaJson(input.agentStateJson)
        : undefined,
    },
  });
  return serializeThread(row);
}

export async function listThreads(
  input: ListThreadsInput
): Promise<{ threads: ThreadRecord[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const rows = await prisma.conversationThread.findMany({
    where: listWhere(input.principal, input.status),
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: limit + 1,
    ...(input.cursor
      ? { cursor: { id: input.cursor }, skip: 1 }
      : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    threads: page.map(serializeThread),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function getThread(
  principal: ConversationPrincipal,
  threadId: string
): Promise<ThreadRecord | null> {
  try {
    const row = await assertThreadAccess(principal, threadId);
    return serializeThread(row);
  } catch (e) {
    if (e instanceof ConversationAccessError) return null;
    throw e;
  }
}

export async function renameThread(input: {
  principal: ConversationPrincipal;
  threadId: string;
  title: string;
}): Promise<ThreadRecord | null> {
  try {
    await assertThreadAccess(input.principal, input.threadId);
  } catch (e) {
    if (e instanceof ConversationAccessError) return null;
    throw e;
  }
  const title = input.title.trim();
  if (!title) return null;
  const row = await prisma.conversationThread.update({
    where: { id: input.threadId },
    data: {
      title,
      titleSource: "USER",
    },
  });
  return serializeThread(row);
}

export async function archiveThread(
  principal: ConversationPrincipal,
  threadId: string
): Promise<ThreadRecord | null> {
  try {
    await assertThreadAccess(principal, threadId);
  } catch (e) {
    if (e instanceof ConversationAccessError) return null;
    throw e;
  }
  const row = await prisma.conversationThread.update({
    where: { id: threadId },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date(),
    },
  });
  return serializeThread(row);
}

export async function restoreThread(
  principal: ConversationPrincipal,
  threadId: string
): Promise<ThreadRecord | null> {
  try {
    await assertThreadAccess(principal, threadId);
  } catch (e) {
    if (e instanceof ConversationAccessError) return null;
    throw e;
  }
  const row = await prisma.conversationThread.update({
    where: { id: threadId },
    data: {
      status: "ACTIVE",
      archivedAt: null,
      deletedAt: null,
    },
  });
  return serializeThread(row);
}

/** Soft delete — does not touch Vehicle, Demand, or Customer rows. */
export async function softDeleteThread(
  principal: ConversationPrincipal,
  threadId: string
): Promise<ThreadRecord | null> {
  try {
    await assertThreadAccess(principal, threadId);
  } catch (e) {
    if (e instanceof ConversationAccessError) return null;
    throw e;
  }
  const row = await prisma.conversationThread.update({
    where: { id: threadId },
    data: {
      status: "DELETED",
      deletedAt: new Date(),
    },
  });
  return serializeThread(row);
}

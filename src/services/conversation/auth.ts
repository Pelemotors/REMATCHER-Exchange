import "server-only";
import { prisma } from "@/lib/prisma";
import type { ConversationPrincipal } from "@/services/conversation/types";
import type { ConversationThread } from "@prisma/client";

export class ConversationAccessError extends Error {
  readonly code: "not_found" | "forbidden" = "forbidden";

  constructor(code: "not_found" | "forbidden") {
    super(code);
    this.code = code;
  }
}

function canAccessThread(
  principal: ConversationPrincipal,
  thread: Pick<ConversationThread, "dealerId" | "ownerUserId" | "visibility" | "status">
): boolean {
  if (thread.status === "DELETED") return false;
  if (thread.dealerId !== principal.dealerId) return false;
  if (thread.visibility === "DEALER_SHARED") return true;
  return thread.ownerUserId === principal.userId;
}

export async function assertThreadAccess(
  principal: ConversationPrincipal,
  threadId: string
): Promise<ConversationThread> {
  const thread = await prisma.conversationThread.findUnique({
    where: { id: threadId },
  });
  if (!thread || thread.status === "DELETED") {
    throw new ConversationAccessError("not_found");
  }
  if (thread.dealerId !== principal.dealerId) {
    throw new ConversationAccessError("not_found");
  }
  if (!canAccessThread(principal, thread)) {
    throw new ConversationAccessError("forbidden");
  }
  return thread;
}

export async function getThreadIfAccessible(
  principal: ConversationPrincipal,
  threadId: string
): Promise<ConversationThread | null> {
  try {
    return await assertThreadAccess(principal, threadId);
  } catch (e) {
    if (e instanceof ConversationAccessError) return null;
    throw e;
  }
}

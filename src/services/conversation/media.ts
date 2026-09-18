import "server-only";
import { prisma } from "@/lib/prisma";
import {
  publicThumbUrlForDisplayKey,
  publicUrlForStorageKey,
} from "@/lib/media/storage";
import { assertThreadAccess } from "@/services/conversation/auth";
import type { ConversationPrincipal } from "@/services/conversation/types";
import type { ThreadMediaItemDTO } from "@/services/conversation/dto";

export async function listThreadIntakeMedia(
  principal: ConversationPrincipal,
  threadId: string
): Promise<ThreadMediaItemDTO[]> {
  await assertThreadAccess(principal, threadId);
  const batches = await prisma.intakeBatch.findMany({
    where: { conversationThreadId: threadId, dealerId: principal.dealerId },
    select: { id: true },
  });
  if (!batches.length) return [];

  const media = await prisma.intakeMedia.findMany({
    where: { batchId: { in: batches.map((b) => b.id) } },
    orderBy: [{ batchId: "asc" }, { originalOrder: "asc" }],
  });

  return media.map((m) => ({
    id: m.id,
    batchId: m.batchId,
    thumbUrl: publicThumbUrlForDisplayKey(m.storageKey),
    url: publicUrlForStorageKey(m.storageKey),
    originalOrder: m.originalOrder,
  }));
}

export async function countThreadIntakeMedia(
  principal: ConversationPrincipal,
  threadId: string
): Promise<number> {
  await assertThreadAccess(principal, threadId);
  return prisma.intakeMedia.count({
    where: {
      batch: {
        conversationThreadId: threadId,
        dealerId: principal.dealerId,
      },
    },
  });
}

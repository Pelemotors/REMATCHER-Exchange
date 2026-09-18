import "server-only";
import { prisma } from "@/lib/prisma";
import { countThreadIntakeMedia } from "@/services/conversation/media";
import type { ConversationPrincipal } from "@/services/conversation/types";

export async function fetchThreadPresentationExtras(
  principal: ConversationPrincipal,
  threadId: string
): Promise<{ preview: string | null; mediaCount: number }> {
  const last = await prisma.conversationMessage.findFirst({
    where: { threadId },
    orderBy: { createdAt: "desc" },
    select: { text: true },
  });
  const mediaCount = await countThreadIntakeMedia(principal, threadId);
  return {
    preview: last?.text?.slice(0, 160) ?? null,
    mediaCount,
  };
}

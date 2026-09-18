import "server-only";
import { prisma } from "@/lib/prisma";
import type { ConversationPrincipal } from "@/services/conversation/types";
import { createThread } from "@/services/conversation/threads";
import { appendMessage } from "@/services/conversation/messages";
import type { IntakeSource } from "@prisma/client";

function mapIntakeSourceToThreadSource(
  source: IntakeSource
): import("@prisma/client").ConversationThreadSource {
  switch (source) {
    case "IOS_SHARE":
      return "IOS_SHARE";
    case "ANDROID_SHARE":
      return "IOS_SHARE";
    case "WEB_UPLOAD":
      return "HOME_CAPTURE";
    case "MANUAL":
      return "TEXT";
    case "IMPORT":
      return "OTHER";
    default:
      return "OTHER";
  }
}

export async function ensureThreadForIntakeBatch(input: {
  principal: ConversationPrincipal;
  batchId: string;
}): Promise<{ threadId: string; created: boolean }> {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: input.batchId, dealerId: input.principal.dealerId },
  });
  if (!batch) {
    throw new Error("intake_batch_not_found");
  }
  if (batch.conversationThreadId) {
    return { threadId: batch.conversationThreadId, created: false };
  }

  const thread = await createThread({
    principal: input.principal,
    source: mapIntakeSourceToThreadSource(batch.source),
    title: "קליטת מלאי",
  });

  await prisma.intakeBatch.update({
    where: { id: batch.id },
    data: { conversationThreadId: thread.id },
  });

  return { threadId: thread.id, created: true };
}

export async function appendIntakeMilestoneMessage(input: {
  principal: ConversationPrincipal;
  threadId: string;
  milestone: string;
  idempotencyKey: string;
  payloadJson?: unknown;
}): Promise<{ created: boolean }> {
  const result = await appendMessage(input.principal, {
    threadId: input.threadId,
    role: "SYSTEM",
    kind: "STATUS",
    text: input.milestone,
    payloadJson: input.payloadJson,
    idempotencyKey: input.idempotencyKey,
    source: "intake",
  });
  return { created: result.created };
}

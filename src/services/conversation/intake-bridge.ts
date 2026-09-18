import "server-only";
import { prisma } from "@/lib/prisma";
import { formatVehicleDisplayLabel } from "@/lib/vehicle-display-label";
import type { ConversationPrincipal } from "@/services/conversation/types";
import { createThread } from "@/services/conversation/threads";
import { appendMessage } from "@/services/conversation/messages";
import { autoTitleFromVehicle } from "@/services/conversation/titles";
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
  ownerUserId?: string;
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

  const principal = {
    dealerId: input.principal.dealerId,
    userId: input.ownerUserId ?? input.principal.userId,
  };

  const thread = await createThread({
    principal,
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
  kind?: import("@prisma/client").ConversationMessageKind;
  intakeBatchId?: string;
}): Promise<{ created: boolean }> {
  const result = await appendMessage(input.principal, {
    threadId: input.threadId,
    role: "SYSTEM",
    kind: input.kind ?? "STATUS",
    text: input.milestone,
    payloadJson: input.payloadJson,
    idempotencyKey: input.idempotencyKey,
    source: "intake",
    intakeBatchId: input.intakeBatchId,
  });
  return { created: result.created };
}

export async function recordIntakeMediaReceived(input: {
  principal: ConversationPrincipal;
  batchId: string;
  mediaCount: number;
}): Promise<void> {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: input.batchId, dealerId: input.principal.dealerId },
    select: { conversationThreadId: true },
  });
  if (!batch?.conversationThreadId) return;

  await appendIntakeMilestoneMessage({
    principal: input.principal,
    threadId: batch.conversationThreadId,
    milestone: `MEDIA_RECEIVED (${input.mediaCount} קבצים)`,
    idempotencyKey: `thread:intake:${input.batchId}:media`,
    payloadJson: { batchId: input.batchId, mediaCount: input.mediaCount },
    kind: "MEDIA_GROUP",
    intakeBatchId: input.batchId,
  });
}

export async function recordIntakeProcessingStarted(input: {
  principal: ConversationPrincipal;
  batchId: string;
}): Promise<void> {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: input.batchId, dealerId: input.principal.dealerId },
    select: { conversationThreadId: true },
  });
  if (!batch?.conversationThreadId) return;

  await appendIntakeMilestoneMessage({
    principal: input.principal,
    threadId: batch.conversationThreadId,
    milestone: "INTAKE_PROCESSING",
    idempotencyKey: `thread:intake:${input.batchId}:processing`,
    payloadJson: { batchId: input.batchId },
    intakeBatchId: input.batchId,
  });
}

export async function recordVehicleIdentifiedForCandidate(input: {
  principal: ConversationPrincipal;
  batchId: string;
  candidateId: string;
}): Promise<void> {
  const candidate = await prisma.vehicleCandidate.findFirst({
    where: {
      id: input.candidateId,
      batchId: input.batchId,
      dealerId: input.principal.dealerId,
    },
    include: {
      batch: { select: { conversationThreadId: true } },
    },
  });
  if (!candidate?.batch.conversationThreadId) return;

  const gov = (candidate.govIdentityJson ?? {}) as {
    make?: string | null;
    model?: string | null;
    year?: number | null;
  };
  const label = formatVehicleDisplayLabel({
    make: gov.make,
    model: gov.model,
    year: gov.year,
    plate: candidate.plateNormalized ?? candidate.detectedPlate,
  });

  await appendIntakeMilestoneMessage({
    principal: input.principal,
    threadId: candidate.batch.conversationThreadId,
    milestone: `VEHICLE_IDENTIFIED: ${label}`,
    idempotencyKey: `thread:intake:${input.batchId}:candidate:${input.candidateId}:identified`,
    payloadJson: {
      batchId: input.batchId,
      candidateId: input.candidateId,
      label,
    },
    kind: "VEHICLE_CANDIDATE",
    intakeBatchId: input.batchId,
  });

  await autoTitleFromVehicle({
    threadId: candidate.batch.conversationThreadId,
    make: gov.make,
    model: gov.model,
    year: gov.year,
    plate: candidate.plateNormalized ?? candidate.detectedPlate,
  });
}

export async function recordIntentRequest(input: {
  principal: ConversationPrincipal;
  batchId: string;
  candidateCount: number;
}): Promise<void> {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: input.batchId, dealerId: input.principal.dealerId },
    select: { conversationThreadId: true },
  });
  if (!batch?.conversationThreadId) return;

  await appendIntakeMilestoneMessage({
    principal: input.principal,
    threadId: batch.conversationThreadId,
    milestone: "INTENT_REQUEST",
    idempotencyKey: `thread:intake:${input.batchId}:intent_request`,
    payloadJson: {
      batchId: input.batchId,
      candidateCount: input.candidateCount,
    },
    intakeBatchId: input.batchId,
  });
}

export async function recordIntentApplied(input: {
  principal: ConversationPrincipal;
  batchId: string;
  candidateId: string;
  intent: string;
  vehicleId?: string | null;
}): Promise<void> {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: input.batchId, dealerId: input.principal.dealerId },
    select: { conversationThreadId: true },
  });
  if (!batch?.conversationThreadId) return;

  await appendIntakeMilestoneMessage({
    principal: input.principal,
    threadId: batch.conversationThreadId,
    milestone: `INTENT_APPLIED: ${input.intent}`,
    idempotencyKey: `thread:intake:${input.batchId}:intent:${input.candidateId}:${input.intent}`,
    payloadJson: {
      batchId: input.batchId,
      candidateId: input.candidateId,
      intent: input.intent,
      vehicleId: input.vehicleId ?? null,
    },
    intakeBatchId: input.batchId,
  });

  const { autoTitleFromVehicleIntent } = await import(
    "@/services/conversation/titles"
  );
  await autoTitleFromVehicleIntent({
    threadId: batch.conversationThreadId,
    candidateId: input.candidateId,
    intent: input.intent,
  }).catch(() => undefined);
}

/** Resolve dealer principal for system/async intake hooks (first dealer user). */
export async function intakePrincipalForDealer(
  dealerId: string
): Promise<ConversationPrincipal | null> {
  const membership = await prisma.dealerMembership.findFirst({
    where: { dealerId },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;
  return { dealerId, userId: membership.userId };
}

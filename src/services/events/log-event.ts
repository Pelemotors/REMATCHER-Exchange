import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function logEvent(params: {
  eventType: string;
  eventVersion?: number;
  entityType?: string;
  entityId?: string;
  dealerId?: string;
  userId?: string;
  source?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ created: boolean; id?: string }> {
  const data = {
    eventType: params.eventType,
    eventVersion: params.eventVersion ?? 1,
    entityType: params.entityType,
    entityId: params.entityId,
    dealerId: params.dealerId,
    userId: params.userId,
    source: params.source,
    idempotencyKey: params.idempotencyKey,
    metadataJson: params.metadata as Prisma.InputJsonValue | undefined,
  };

  if (params.idempotencyKey) {
    const existing = await prisma.appEvent.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
      select: { id: true },
    });
    if (existing) return { created: false, id: existing.id };
  }

  try {
    const row = await prisma.appEvent.create({ data });
    return { created: true, id: row.id };
  } catch (err) {
    if (
      params.idempotencyKey &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { created: false };
    }
    throw err;
  }
}

/** @deprecated use logEvent — kept for backward compatibility during migration */
export async function logAppEvent(params: {
  eventType: string;
  entityType?: string;
  entityId?: string;
  dealerId?: string;
  metadata?: object;
  idempotencyKey?: string;
  userId?: string;
  source?: string;
}) {
  return logEvent({
    ...params,
    metadata: params.metadata as Record<string, unknown> | undefined,
  });
}

/**
 * Alias for Native clients that POST /api/v1/notifications/{id}/read.
 * Same semantics as PATCH /api/v1/notifications { notificationId }.
 */
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Json } from "@/lib/api-v1/respond";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/services/events/log-event";
import { PRODUCT_EVENTS } from "@/services/events/contract";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;

  await prisma.notification.updateMany({
    where: { id, userId: principal.userId },
    data: { readAt: new Date() },
  });
  await logEvent({
    eventType: PRODUCT_EVENTS.NOTIFICATION_READ,
    userId: principal.userId,
    entityType: "notification",
    entityId: id,
    source: "inbox",
  }).catch(() => {});

  return v1Json(ctx, { ok: true });
}

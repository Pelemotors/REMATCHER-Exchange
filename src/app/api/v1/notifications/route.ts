import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/services/events/log-event";
import { PRODUCT_EVENTS } from "@/services/events/contract";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const unreadOnly = url.searchParams.get("unread") === "true";

  const notifications = await prisma.notification.findMany({
    where: {
      userId: principal.userId,
      ...(unreadOnly ? { readAt: null } : {}),
      ...(category
        ? {
            sourceCategory: category.toUpperCase() as
              | "PRODUCT"
              | "ADMIN"
              | "REMINDER"
              | "SYSTEM",
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: principal.userId, readAt: null },
  });

  return v1Json(ctx, { notifications, unreadCount });
}

export async function PATCH(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    notificationId?: unknown;
    markAllRead?: unknown;
  };

  if (typeof body.notificationId === "string" && body.notificationId) {
    await prisma.notification.updateMany({
      where: { id: body.notificationId, userId: principal.userId },
      data: { readAt: new Date() },
    });
    await logEvent({
      eventType: PRODUCT_EVENTS.NOTIFICATION_READ,
      userId: principal.userId,
      entityType: "notification",
      entityId: body.notificationId,
      source: "inbox",
    }).catch(() => {});
    return v1Json(ctx, { ok: true });
  }

  if (body.markAllRead === true) {
    await prisma.notification.updateMany({
      where: { userId: principal.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return v1Json(ctx, { ok: true });
  }

  return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
}

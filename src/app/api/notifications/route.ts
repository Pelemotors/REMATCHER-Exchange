import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/services/events/log-event";
import { PRODUCT_EVENTS } from "@/services/events/contract";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const category = new URL(req.url).searchParams.get("category");
  const unreadOnly = new URL(req.url).searchParams.get("unread") === "true";

  const notifications = await prisma.notification.findMany({
    where: {
      userId: session.user.id,
      ...(unreadOnly ? { readAt: null } : {}),
      ...(category
        ? { sourceCategory: category.toUpperCase() as "PRODUCT" | "ADMIN" | "REMINDER" | "SYSTEM" }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, readAt: null },
  });

  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (body.notificationId) {
    await prisma.notification.updateMany({
      where: { id: body.notificationId, userId: session.user.id },
      data: { readAt: new Date() },
    });
    await logEvent({
      eventType: PRODUCT_EVENTS.NOTIFICATION_READ,
      userId: session.user.id,
      entityType: "notification",
      entityId: body.notificationId,
      source: "inbox",
    }).catch(() => {});
  } else if (body.markAllRead) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}

import "server-only";
import { prisma } from "@/lib/prisma";
import type { NotificationSourceCategory, NotificationType } from "@prisma/client";
import { deliverPushToUser } from "./push";
import type { PushSource, PushTriggerType } from "@prisma/client";

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  sendPush?: boolean;
  sourceCategory?: NotificationSourceCategory;
  pushSource?: PushSource;
  pushTriggerType?: PushTriggerType;
  dealerId?: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link,
      entityType: params.entityType,
      entityId: params.entityId,
      sourceCategory: params.sourceCategory ?? "PRODUCT",
    },
  });

  if (params.sendPush !== false) {
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: params.userId },
    });
    const category = params.sourceCategory ?? "PRODUCT";
    const allowed =
      !prefs ||
      (category === "PRODUCT" && prefs.criticalProduct) ||
      (category === "REMINDER" && prefs.reminders) ||
      (category === "ADMIN" && prefs.adminCommunications) ||
      category === "SYSTEM";

    if (allowed) {
      await deliverPushToUser({
        userId: params.userId,
        dealerId: params.dealerId,
        title: params.title,
        body: params.body,
        link: params.link,
        source: params.pushSource ?? "PRODUCT",
        triggerType: params.pushTriggerType,
        notificationId: notification.id,
        skipIfNoSubscription: true,
      }).catch(() => {});
    }
  }

  return notification;
}

export async function notifyDealerUsers(
  dealerId: string,
  params: Omit<Parameters<typeof createNotification>[0], "userId" | "dealerId">
) {
  const memberships = await prisma.dealerMembership.findMany({
    where: { dealerId },
    include: { user: true },
  });

  for (const m of memberships) {
    await createNotification({ ...params, userId: m.userId, dealerId });
  }
}

export { logEvent, logAppEvent } from "@/services/events/log-event";

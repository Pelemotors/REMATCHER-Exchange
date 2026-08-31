import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";
import { sendPushToUser } from "./push";

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  sendPush?: boolean;
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
    },
  });

  if (params.sendPush !== false) {
    await sendPushToUser(params.userId, {
      title: params.title,
      body: params.body,
      link: params.link,
    }).catch(() => {});
  }

  return notification;
}

export async function notifyDealerUsers(
  dealerId: string,
  params: Omit<Parameters<typeof createNotification>[0], "userId">
) {
  const memberships = await prisma.dealerMembership.findMany({
    where: { dealerId },
    include: { user: true },
  });

  for (const m of memberships) {
    await createNotification({ ...params, userId: m.userId });
  }
}

export async function logAppEvent(params: {
  eventType: string;
  entityType?: string;
  entityId?: string;
  dealerId?: string;
  metadata?: object;
}) {
  await prisma.appEvent.create({
    data: {
      eventType: params.eventType,
      entityType: params.entityType,
      entityId: params.entityId,
      dealerId: params.dealerId,
      metadataJson: params.metadata ?? undefined,
    },
  });
}

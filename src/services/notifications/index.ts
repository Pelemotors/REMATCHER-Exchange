import "server-only";
import { prisma } from "@/lib/prisma";
import type { NotificationSourceCategory, NotificationType } from "@prisma/client";
import { deliverPushToUser } from "./push";
import type { PushSource, PushTriggerType, NotificationEventType } from "@prisma/client";

function eventPrefType(
  type: NotificationType,
  trigger?: PushTriggerType
): NotificationEventType | null {
  if (trigger === "MUTUAL_INTEREST" || type === "MUTUAL_INTEREST") return "MUTUAL_INTEREST";
  if (trigger === "MATCH_CREATED" || trigger === "MATCH_NOTIFIED" || type === "BUYER_MATCH") {
    return "NEW_MATCH";
  }
  if (trigger === "DEMAND_EXPIRING") return "SEARCH_EXPIRING";
  return null;
}

export async function createNotification(params: {
  userId: string; type: NotificationType; title: string; body: string; link?: string; entityType?: string; entityId?: string; sendPush?: boolean; sourceCategory?: NotificationSourceCategory; pushSource?: PushSource; pushTriggerType?: PushTriggerType; dealerId?: string;
}) {
  if (params.type === "BUYER_MATCH" && params.entityId) {
    const existing = await prisma.notification.findFirst({ where: { userId: params.userId, type: "BUYER_MATCH", entityId: params.entityId }, orderBy: { createdAt: "asc" } });
    if (existing) return existing;
  }
  const notification = await prisma.notification.create({ data: { userId: params.userId, type: params.type, title: params.title, body: params.body, link: params.link, entityType: params.entityType, entityId: params.entityId, sourceCategory: params.sourceCategory ?? "PRODUCT" } });
  if (params.sendPush !== false) {
    const prefs = await prisma.notificationPreference.findUnique({ where: { userId: params.userId } });
    const category = params.sourceCategory ?? "PRODUCT";
    const allowed = !prefs || (category === "PRODUCT" && prefs.criticalProduct) || (category === "REMINDER" && prefs.reminders) || (category === "ADMIN" && prefs.adminCommunications) || category === "SYSTEM";
    const mapped = eventPrefType(params.type, params.pushTriggerType);
    let eventAllowed = true;
    if (mapped) {
      const eventPref = await prisma.notificationEventPreference.findUnique({
        where: { userId_eventType: { userId: params.userId, eventType: mapped } },
      });
      if (eventPref && eventPref.enabled === false) eventAllowed = false;
    }
    if (allowed && eventAllowed) await deliverPushToUser({ userId: params.userId, dealerId: params.dealerId, title: params.title, body: params.body, link: params.link, source: params.pushSource ?? "PRODUCT", triggerType: params.pushTriggerType, notificationId: notification.id, skipIfNoSubscription: true }).catch(() => {});
  }
  return notification;
}
export async function notifyDealerUsers(dealerId: string, params: Omit<Parameters<typeof createNotification>[0], "userId" | "dealerId">) {
  const memberships = await prisma.dealerMembership.findMany({ where: { dealerId }, include: { user: true } });
  for (const m of memberships) await createNotification({ ...params, userId: m.userId, dealerId });
}
export { logEvent, logAppEvent } from "@/services/events/log-event";

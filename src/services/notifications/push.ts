import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import type {
  PushDeliveryStatus,
  PushSource,
  PushTriggerType,
} from "@prisma/client";
import { PUSH_EVENTS } from "@/services/events/contract";
import { logEvent } from "@/services/events/log-event";
import { pushDeliveryIdempotencyKey } from "@/services/events/contract";
import { isSafeInternalPath } from "@/lib/deep-links";
import { isKillSwitchOn } from "@/config/kill-switches";

const MAX_TITLE = 120;
const MAX_BODY = 500;
const MAX_LINK = 500;

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@local";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function validatePushContent(input: {
  title: string;
  body: string;
  link?: string | null;
}): { ok: true } | { ok: false; error: string } {
  const title = input.title?.trim();
  const body = input.body?.trim();
  if (!title) return { ok: false, error: "Title required" };
  if (!body) return { ok: false, error: "Body required" };
  if (title.length > MAX_TITLE) return { ok: false, error: "Title too long" };
  if (body.length > MAX_BODY) return { ok: false, error: "Body too long" };
  if (input.link && input.link.length > MAX_LINK) {
    return { ok: false, error: "Link too long" };
  }
  if (input.link && !isSafeInternalPath(input.link)) {
    return { ok: false, error: "Link must be a safe internal application path" };
  }
  return { ok: true };
}

async function transitionDelivery(
  deliveryId: string,
  status: PushDeliveryStatus,
  extra: Record<string, unknown> = {}
) {
  const now = new Date();
  const patch: Record<string, unknown> = { status, ...extra };
  if (status === "SEND_ATTEMPTED") patch.sendAttemptedAt = now;
  if (status === "SENT") patch.sentAt = now;
  if (status === "DELIVERY_FAILED") patch.failedAt = now;
  if (status === "RECEIVED") patch.receivedAt = now;
  if (status === "CLICKED") patch.clickedAt = now;
  if (status === "DESTINATION_OPENED") patch.destinationOpenedAt = now;

  await prisma.pushDelivery.update({
    where: { id: deliveryId },
    data: patch,
  });
}

async function logPushEvent(
  deliveryId: string,
  eventType: string,
  metadata: Record<string, unknown>
) {
  await logEvent({
    eventType,
    source: "push_pipeline",
    entityType: "push_delivery",
    entityId: deliveryId,
    metadata: { deliveryId, ...metadata },
  }).catch(() => {});
}

export interface DeliverPushParams {
  userId: string;
  dealerId?: string;
  title: string;
  body: string;
  link?: string;
  source: PushSource;
  triggerType?: PushTriggerType;
  campaignId?: string;
  notificationId?: string;
  skipIfNoSubscription?: boolean;
}

export async function deliverPushToUser(
  params: DeliverPushParams
): Promise<{ sent: number; failed: number; deliveries: string[] }> {
  if (isKillSwitchOn("push")) {
    return { sent: 0, failed: 0, deliveries: [] };
  }
  if (!configureWebPush()) return { sent: 0, failed: 0, deliveries: [] };

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: params.userId, invalidatedAt: null },
  });

  if (subs.length === 0) {
    if (!params.skipIfNoSubscription) {
      const delivery = await prisma.pushDelivery.create({
        data: {
          userId: params.userId,
          dealerId: params.dealerId,
          campaignId: params.campaignId,
          notificationId: params.notificationId,
          source: params.source,
          triggerType: params.triggerType,
          title: params.title,
          body: params.body,
          link: params.link,
          status: "DELIVERY_FAILED",
          failureCategory: "no_subscription",
          failedAt: new Date(),
        },
      });
      await logPushEvent(delivery.id, PUSH_EVENTS.DELIVERY_FAILED, {
        reason: "no_subscription",
      });
      return { sent: 0, failed: 1, deliveries: [delivery.id] };
    }
    return { sent: 0, failed: 0, deliveries: [] };
  }

  const pushPayload = (deliveryId: string) =>
    JSON.stringify({
      title: params.title,
      body: params.body,
      link: params.link,
      deliveryId,
    });

  let sent = 0;
  let failed = 0;
  const deliveryIds: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      const idempotencyKey = pushDeliveryIdempotencyKey(
        params.source,
        params.notificationId ?? null,
        sub.id,
        params.userId
      );

      let delivery = await prisma.pushDelivery.findUnique({
        where: { idempotencyKey },
      });

      if (!delivery) {
        delivery = await prisma.pushDelivery.create({
          data: {
            userId: params.userId,
            dealerId: params.dealerId,
            campaignId: params.campaignId,
            notificationId: params.notificationId,
            pushSubscriptionId: sub.id,
            source: params.source,
            triggerType: params.triggerType,
            title: params.title,
            body: params.body,
            link: params.link,
            idempotencyKey,
            status: "CREATED",
          },
        });
        await logPushEvent(delivery.id, PUSH_EVENTS.CREATED, {
          userId: params.userId,
          source: params.source,
        });
      }

      deliveryIds.push(delivery.id);

      if (delivery.status === "SENT" || delivery.status === "RECEIVED") {
        sent += 1;
        return;
      }

      await transitionDelivery(delivery.id, "SEND_ATTEMPTED");
      await logPushEvent(delivery.id, PUSH_EVENTS.SEND_ATTEMPTED, {});

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload(delivery.id)
        );
        await transitionDelivery(delivery.id, "SENT");
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
        await logPushEvent(delivery.id, PUSH_EVENTS.SENT, {});
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        const category =
          statusCode === 410 || statusCode === 404
            ? "subscription_expired"
            : "provider_error";
        await transitionDelivery(delivery.id, "DELIVERY_FAILED", {
          failureCategory: category,
        });
        await logPushEvent(delivery.id, PUSH_EVENTS.DELIVERY_FAILED, {
          category,
          statusCode,
        });
        if (statusCode === 410 || statusCode === 404) {
          await prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { invalidatedAt: new Date() },
          });
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    })
  );

  return { sent, failed, deliveries: deliveryIds };
}

export async function recordPushTelemetry(
  deliveryId: string,
  event: "received" | "clicked" | "destination_opened",
  userId: string
): Promise<boolean> {
  const delivery = await prisma.pushDelivery.findUnique({
    where: { id: deliveryId },
  });
  if (!delivery || delivery.userId !== userId) return false;

  const eventMap = {
    received: PUSH_EVENTS.RECEIVED,
    clicked: PUSH_EVENTS.CLICKED,
    destination_opened: PUSH_EVENTS.DESTINATION_OPENED,
  };

  const already =
    (event === "received" && delivery.receivedAt) ||
    (event === "clicked" && delivery.clickedAt) ||
    (event === "destination_opened" && delivery.destinationOpenedAt);
  if (already) return true;

  const statusMap = {
    received: "RECEIVED" as const,
    clicked: "CLICKED" as const,
    destination_opened: "DESTINATION_OPENED" as const,
  };

  await transitionDelivery(delivery.id, statusMap[event]);
  await logPushEvent(delivery.id, eventMap[event], {});

  if (delivery.campaignId) {
    const field =
      event === "received"
        ? "receivedCount"
        : event === "clicked"
          ? "clickedCount"
          : "destinationOpenedCount";
    await prisma.pushCampaign.update({
      where: { id: delivery.campaignId },
      data: { [field]: { increment: 1 } },
    });
  }

  return true;
}

export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    update: {
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      invalidatedAt: null,
    },
  });
}

export async function removePushSubscription(
  userId: string,
  endpoint: string
): Promise<boolean> {
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });
  if (!existing || existing.userId !== userId) return false;
  await prisma.pushSubscription.delete({ where: { endpoint } });
  return true;
}

export async function isDeviceSubscribed(
  userId: string,
  endpoint: string
): Promise<boolean> {
  const row = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });
  return row?.userId === userId && !row.invalidatedAt;
}

/** Backward-compatible wrapper */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; link?: string },
  opts?: {
    source?: PushSource;
    triggerType?: PushTriggerType;
    notificationId?: string;
    dealerId?: string;
  }
): Promise<{ sent: number; failed: number }> {
  const result = await deliverPushToUser({
    userId,
    title: payload.title,
    body: payload.body,
    link: payload.link,
    source: opts?.source ?? "PRODUCT",
    triggerType: opts?.triggerType,
    notificationId: opts?.notificationId,
    dealerId: opts?.dealerId,
    skipIfNoSubscription: true,
  });
  return { sent: result.sent, failed: result.failed };
}

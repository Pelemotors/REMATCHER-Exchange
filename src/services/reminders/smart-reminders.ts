import "server-only";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/services/notifications";
import { logEvent } from "@/services/events/log-event";
import { businessIdempotencyKey } from "@/services/events/contract";

const COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h dedup per entity

async function recentlySent(
  eventType: string,
  entityType: string,
  entityId: string
): Promise<boolean> {
  const key = businessIdempotencyKey(eventType, entityType, entityId);
  const existing = await prisma.appEvent.findUnique({
    where: { idempotencyKey: key },
    select: { createdAt: true },
  });
  if (!existing) return false;
  return Date.now() - existing.createdAt.getTime() < COOLDOWN_MS;
}

/** Smart contextual reminders — one per entity per cooldown window */
export async function runSmartReminders(): Promise<{ sent: number }> {
  let sent = 0;
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const stuckOpportunities = await prisma.sellerOpportunity.findMany({
    where: { status: "OPEN", createdAt: { lte: since48h } },
    include: {
      vehicle: { select: { dealerId: true, make: true, model: true } },
      buyerInterest: { include: { demand: true } },
    },
    take: 20,
  });

  for (const opp of stuckOpportunities) {
    const entityId = opp.id;
    if (await recentlySent("smart_reminder_opportunity", "seller_opportunity", entityId)) {
      continue;
    }
    await notifyDealerReminder(
      opp.vehicle.dealerId,
      "יש עניין שמחכה לתגובה",
      "סוחר הביע עניין — חזרו ל-REMATCHER לבדוק את ההזדמנות.",
      `/opportunities?focus=${entityId}`,
      "smart_reminder_opportunity",
      "seller_opportunity",
      entityId
    );
    sent += 1;
  }

  const revealsNoOutcome = await prisma.reveal.findMany({
    where: {
      outcome: null,
      revealedAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    take: 20,
  });

  for (const reveal of revealsNoOutcome) {
    if (await recentlySent("smart_reminder_outcome", "reveal", reveal.id)) continue;
    for (const dealerId of [reveal.buyerDealerId, reveal.sellerDealerId]) {
      await notifyDealerReminder(
        dealerId,
        "חיבור ממתין לתוצאה",
        "עדכנו את תוצאת החיבור ב-REMATCHER.",
        `/reveals/${reveal.id}`,
        "smart_reminder_outcome",
        "reveal",
        reveal.id
      );
    }
    sent += 1;
  }

  return { sent };
}

async function notifyDealerReminder(
  dealerId: string,
  title: string,
  body: string,
  link: string,
  eventType: string,
  entityType: string,
  entityId: string
) {
  const memberships = await prisma.dealerMembership.findMany({
    where: { dealerId },
    select: { userId: true },
  });

  for (const m of memberships) {
    await createNotification({
      userId: m.userId,
      type: "OUTCOME_REMINDER",
      title,
      body,
      link,
      sourceCategory: "REMINDER",
      pushSource: "SMART_REMINDER",
      dealerId,
      entityType,
      entityId,
    });
  }

  await logEvent({
    eventType,
    entityType,
    entityId,
    dealerId,
    source: "smart_reminders",
    idempotencyKey: businessIdempotencyKey(eventType, entityType, entityId),
  });
}

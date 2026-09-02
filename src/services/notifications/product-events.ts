import "server-only";
import { prisma } from "@/lib/prisma";
import { notifyDealerUsers } from "@/services/notifications";
import { confirmedFromJson, demandTitle } from "@/lib/demand-display";

/** Notify dealer about demands expiring within 24h — deduped per demand per day */
export async function notifyExpiringDemands(dealerId: string) {
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const demands = await prisma.demand.findMany({
    where: {
      dealerId,
      status: "ACTIVE",
      expiresAt: {
        lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
        gte: new Date(),
      },
    },
  });

  for (const d of demands) {
    const recent = await prisma.notification.findFirst({
      where: {
        entityType: "demand",
        entityId: d.id,
        type: "DEMAND_EXPIRY",
        createdAt: { gte: since },
      },
    });
    if (recent) continue;

    const confirmed = confirmedFromJson(d.confirmedJson);
    await notifyDealerUsers(dealerId, {
      type: "DEMAND_EXPIRY",
      title: "חיפוש עומד להסתיים",
      body: `"${demandTitle(confirmed)}" — כדאי לחדש או לעדכן`,
      link: `/demand?edit=${d.id}`,
      entityType: "demand",
      entityId: d.id,
    });
  }
}

/** Notify seller when inventory requires freshness attention — deduped per vehicle per day */
export async function notifyFreshnessAttention(
  dealerId: string,
  vehicleId: string,
  title: string
) {
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const recent = await prisma.notification.findFirst({
    where: {
      entityType: "vehicle",
      entityId: vehicleId,
      type: "FRESHNESS",
      createdAt: { gte: since },
    },
  });
  if (recent) return;

  await notifyDealerUsers(dealerId, {
    type: "FRESHNESS",
    title: "מלאי דורש עדכון",
    body: `${title} — נדרש אישור זמינות`,
    link: `/inventory?focus=${vehicleId}`,
    entityType: "vehicle",
    entityId: vehicleId,
  });
}

/** Schedule in-app outcome reminders for stale reveals */
export async function processOutcomeReminders(dealerId: string) {
  const reveals = await prisma.reveal.findMany({
    where: {
      OR: [{ buyerDealerId: dealerId }, { sellerDealerId: dealerId }],
      outcome: null,
      revealedAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    take: 5,
  });
  for (const r of reveals) {
    await notifyOutcomeReminder(dealerId, r.id);
  }
}

export async function notifyOutcomeReminder(
  dealerId: string,
  revealId: string
) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = await prisma.notification.findFirst({
    where: {
      entityType: "reveal",
      entityId: revealId,
      type: "OUTCOME_REMINDER",
      createdAt: { gte: since },
    },
  });
  if (recent) return;

  await notifyDealerUsers(dealerId, {
    type: "OUTCOME_REMINDER",
    title: "מה קרה עם החיבור?",
    body: "עדכון קצר עוזר ל-REMATCHER ללמוד ולהתאים",
    link: `/reveals/${revealId}`,
    entityType: "reveal",
    entityId: revealId,
    sendPush: true,
  });
}

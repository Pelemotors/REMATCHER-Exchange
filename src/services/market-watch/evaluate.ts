import "server-only";
import { prisma } from "@/lib/prisma";
import { getNetworkIntelligenceSnapshot } from "@/services/network-intelligence";
import { createNotification } from "@/services/notifications";

function fingerprintFromSnapshot(snap: Awaited<ReturnType<typeof getNetworkIntelligenceSnapshot>>): string {
  return JSON.stringify({
    d: snap.demand.activeCount,
    s: snap.supply.activeCount,
    di: snap.demand.insufficientData,
    si: snap.supply.insufficientData,
  });
}

function meaningfullyChanged(prev: string | null, next: string): boolean {
  if (!prev) return true;
  try {
    const a = JSON.parse(prev) as Record<string, unknown>;
    const b = JSON.parse(next) as Record<string, unknown>;
    for (const k of ["d", "s"]) {
      if (a[k] !== b[k]) return true;
    }
    return false;
  } catch {
    return prev !== next;
  }
}

/**
 * Evaluate active watches (stub — safe network snapshot fingerprint).
 * Callable from lifecycle catch-up.
 */
export async function evaluateMarketWatches(params?: {
  dealerId?: string;
  limit?: number;
}): Promise<{ evaluated: number; notified: number }> {
  const watches = await prisma.marketWatch.findMany({
    where: {
      active: true,
      ...(params?.dealerId ? { dealerId: params.dealerId } : {}),
    },
    take: params?.limit ?? 50,
    orderBy: { lastEvaluatedAt: "asc" },
  });

  let notified = 0;
  for (const watch of watches) {
    const snap = await getNetworkIntelligenceSnapshot({
      dealerId: watch.dealerId,
      make: watch.queryMake,
      model: watch.queryModel,
      yearMin: watch.yearMin,
      yearMax: watch.yearMax,
    });
    const fp = fingerprintFromSnapshot(snap);
    const changed = meaningfullyChanged(watch.lastFingerprint, fp);
    const now = new Date();

    await prisma.marketWatch.update({
      where: { id: watch.id },
      data: { lastEvaluatedAt: now, lastFingerprint: fp },
    });

    if (
      !changed ||
      (snap.demand.insufficientData && snap.supply.insufficientData)
    ) {
      continue;
    }

    const memberships = await prisma.dealerMembership.findMany({
      where: { dealerId: watch.dealerId },
      select: { userId: true },
    });
    const title = `עדכון שוק — ${watch.queryMake} ${watch.queryModel}`;
    const body =
      snap.supply.activeCount != null || snap.demand.activeCount != null
        ? `ביקוש/היצע ברשת עודכנו עבור ${watch.queryMake} ${watch.queryModel}.`
        : `יש נתוני שוק חדשים עבור ${watch.queryMake} ${watch.queryModel}.`;

    for (const m of memberships) {
      if (watch.userId && m.userId !== watch.userId) continue;
      await createNotification({
        userId: m.userId,
        dealerId: watch.dealerId,
        type: "SYSTEM",
        title,
        body,
        link: "/intelligence",
        entityType: "MarketWatch",
        entityId: watch.id,
        sendPush: false,
        sourceCategory: "PRODUCT",
      }).catch(() => undefined);
    }

    await prisma.marketWatch.update({
      where: { id: watch.id },
      data: { lastNotifiedAt: now },
    });
    notified += 1;
  }

  return { evaluated: watches.length, notified };
}

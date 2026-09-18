import "server-only";
import { prisma } from "@/lib/prisma";
import { runExchangeIntelligenceEngine } from "@/services/exchange-intelligence/engine";
import { createNotification } from "@/services/notifications";

type IntelFingerprint = {
  marketBalance: string | null;
  liquidity: string | null;
  tradeRisk: string | null;
  demandCount: number | null;
  supplyCount: number | null;
  b2bMedian: number | null;
};

type OverviewShape = {
  marketBalance?: string;
  liquidity?: string;
  tradeRisk?: string;
  demand: { activeCount: number | null };
  supply: { activeCount: number | null };
  askingB2B: { median: number | null };
};

function fingerprintFromIntel(overview: OverviewShape): string {
  const payload: IntelFingerprint = {
    marketBalance: overview.marketBalance ?? null,
    liquidity: overview.liquidity ?? null,
    tradeRisk: overview.tradeRisk ?? null,
    demandCount: overview.demand.activeCount,
    supplyCount: overview.supply.activeCount,
    b2bMedian: overview.askingB2B.median,
  };
  return JSON.stringify(payload);
}

function parseFingerprint(raw: string | null): IntelFingerprint | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IntelFingerprint;
  } catch {
    return null;
  }
}

function meaningfullyChanged(prev: IntelFingerprint | null, next: IntelFingerprint): boolean {
  if (!prev) return false;
  if (prev.marketBalance !== next.marketBalance) return true;
  if (prev.liquidity !== next.liquidity) return true;
  if (prev.tradeRisk !== next.tradeRisk) return true;
  const countDelta = (a: number | null, b: number | null) =>
    a != null && b != null && Math.abs(a - b) >= 2;
  if (countDelta(prev.demandCount, next.demandCount)) return true;
  if (countDelta(prev.supplyCount, next.supplyCount)) return true;
  if (
    prev.b2bMedian != null &&
    next.b2bMedian != null &&
    prev.b2bMedian > 0 &&
    Math.abs(next.b2bMedian - prev.b2bMedian) / prev.b2bMedian >= 0.05
  ) {
    return true;
  }
  return false;
}

/**
 * Evaluate active watches using Exchange Intelligence V2 (MARKET_OVERVIEW).
 */
export async function evaluateMarketWatches(params?: {
  dealerId?: string;
  limit?: number;
}): Promise<{ evaluated: number; notified: number; baselined: number }> {
  const watches = await prisma.marketWatch.findMany({
    where: {
      active: true,
      ...(params?.dealerId ? { dealerId: params.dealerId } : {}),
    },
    take: params?.limit ?? 50,
    orderBy: { lastEvaluatedAt: "asc" },
    include: {
      dealer: { select: { isActive: true, verificationStatus: true } },
    },
  });

  let notified = 0;
  let baselined = 0;
  for (const watch of watches) {
    if (!watch.dealer.isActive || watch.dealer.verificationStatus === "DISABLED") {
      continue;
    }

    const intel = await runExchangeIntelligenceEngine({
      dealerId: watch.dealerId,
      action: "MARKET_OVERVIEW",
      subject: {
        make: watch.queryMake,
        model: watch.queryModel,
        yearMin: watch.yearMin,
        yearMax: watch.yearMax,
      },
    });
    if (!intel.ok || !("overview" in intel)) continue;

    const fp = fingerprintFromIntel(intel.overview);
    const nextPayload = parseFingerprint(fp)!;
    const prevPayload = parseFingerprint(watch.lastFingerprint);
    const now = new Date();

    if (watch.lastFingerprint == null) {
      await prisma.marketWatch.update({
        where: { id: watch.id },
        data: { lastEvaluatedAt: now, lastFingerprint: fp },
      });
      baselined += 1;
      continue;
    }

    const changed = meaningfullyChanged(prevPayload, nextPayload);

    await prisma.marketWatch.update({
      where: { id: watch.id },
      data: { lastEvaluatedAt: now, lastFingerprint: fp },
    });

    if (!changed || intel.overview.marketBalance === "INSUFFICIENT_DATA") {
      continue;
    }

    const memberships = await prisma.dealerMembership.findMany({
      where: { dealerId: watch.dealerId },
      select: { userId: true },
    });
    const title = `עדכון שוק — ${watch.queryMake} ${watch.queryModel}`;
    const body = `מאזן שוק: ${intel.overview.marketBalance}. נזילות: ${intel.overview.liquidity}.`;

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

  return { evaluated: watches.length, notified, baselined };
}

export { fingerprintFromIntel, meaningfullyChanged, parseFingerprint };

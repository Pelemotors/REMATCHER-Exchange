import "server-only";
import { prisma } from "@/lib/prisma";
import { timingDistribution, pct, formatDurationMs } from "./percentiles";

function periodStart(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function getLifecycleMetrics(days: number) {
  const since = periodStart(days);

  const [
    totalDemands,
    activeDemands,
    demandsWithMatch,
    totalMatches,
    buyerInterested,
    sellerInterested,
    reveals,
    dealClosed,
    mutualInterest,
    staleMatches,
    revealsWithOutcome,
    totalOutcomes,
  ] = await Promise.all([
    prisma.demand.count({ where: { createdAt: { gte: since } } }),
    prisma.demand.count({ where: { status: "ACTIVE", createdAt: { gte: since } } }),
    prisma.demand.count({
      where: {
        createdAt: { gte: since },
        candidateMatches: { some: {} },
      },
    }),
    prisma.candidateMatch.count({ where: { createdAt: { gte: since } } }),
    prisma.buyerInterest.count({
      where: { createdAt: { gte: since }, status: "INTERESTED" },
    }),
    prisma.sellerInterest.count({
      where: { createdAt: { gte: since }, status: "INTERESTED" },
    }),
    prisma.reveal.count({ where: { revealedAt: { gte: since } } }),
    prisma.outcome.count({
      where: { reportedAt: { gte: since }, status: "DEAL_CLOSED" },
    }),
    prisma.mutualInterest.count({ where: { createdAt: { gte: since } } }),
    prisma.candidateMatch.count({
      where: {
        createdAt: { gte: since, lte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        buyerInterests: { none: { status: "INTERESTED" } },
        status: { in: ["CANDIDATE", "VALIDATED"] },
      },
    }),
    prisma.reveal.count({
      where: { revealedAt: { gte: since }, outcome: { isNot: null } },
    }),
    prisma.outcome.count({ where: { reportedAt: { gte: since } } }),
  ]);

  const demandToFirstMatchMs = await computeDemandToFirstMatchTimings(since);
  const matchToInterestMs = await computeMatchToFirstInterestTimings(since);
  const interestToMutualMs = await computeInterestToMutualTimings(since);
  const mutualToRevealMs = await computeMutualToRevealTimings(since);
  const revealToOutcomeMs = await computeRevealToOutcomeTimings(since);

  return {
    periodDays: days,
    demand: {
      total: totalDemands,
      active: activeDemands,
      withMatchPct: pct(demandsWithMatch, totalDemands),
      timeToFirstMatch: formatTiming(demandToFirstMatchMs),
    },
    match: {
      total: totalMatches,
      buyerInterestedPct: pct(buyerInterested, totalMatches),
      mutualInterestPct: pct(mutualInterest, totalMatches),
      staleNoResponse: staleMatches,
      timeToFirstAction: formatTiming(matchToInterestMs),
    },
    interest: {
      mutualInterest,
      timeFirstToSecond: formatTiming(interestToMutualMs),
    },
    reveal: {
      total: reveals,
      revealFromMatchPct: pct(reveals, totalMatches),
      withOutcomePct: pct(revealsWithOutcome, reveals),
      timeFromMutual: formatTiming(mutualToRevealMs),
      timeToOutcome: formatTiming(revealToOutcomeMs),
    },
    deal: {
      completed: dealClosed,
      revealToDealPct: pct(dealClosed, reveals),
    },
    funnel: {
      demands: totalDemands,
      matches: totalMatches,
      firstInterest: buyerInterested,
      mutualInterest,
      reveals,
      outcomes: totalOutcomes,
      deals: dealClosed,
    },
  };
}

function formatTiming(dist: ReturnType<typeof timingDistribution>) {
  return {
    count: dist.count,
    average: formatDurationMs(dist.averageMs),
    median: formatDurationMs(dist.medianMs),
    p75: formatDurationMs(dist.p75Ms),
    p90: formatDurationMs(dist.p90Ms),
  };
}

/** Full-period timing — no arbitrary row cap (counts use prisma.count elsewhere). */
async function computeDemandToFirstMatchTimings(since: Date) {
  const demands = await prisma.demand.findMany({
    where: { createdAt: { gte: since } },
    select: {
      createdAt: true,
      candidateMatches: {
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  const ms = demands
    .filter((d) => d.candidateMatches[0])
    .map((d) => d.candidateMatches[0].createdAt.getTime() - d.createdAt.getTime());
  return timingDistribution(ms);
}

async function computeMatchToFirstInterestTimings(since: Date) {
  const matches = await prisma.candidateMatch.findMany({
    where: { createdAt: { gte: since } },
    select: {
      createdAt: true,
      buyerInterests: {
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  const ms = matches
    .filter((m) => m.buyerInterests[0])
    .map((m) => m.buyerInterests[0].createdAt.getTime() - m.createdAt.getTime());
  return timingDistribution(ms);
}

async function computeInterestToMutualTimings(since: Date) {
  const mutual = await prisma.mutualInterest.findMany({
    where: { createdAt: { gte: since } },
    include: {
      sellerInterest: {
        include: { opportunity: { include: { buyerInterest: true } } },
      },
    },
  });
  const ms = mutual
    .map((m) => {
      const buyerAt = m.sellerInterest.opportunity.buyerInterest.createdAt.getTime();
      return m.createdAt.getTime() - buyerAt;
    })
    .filter((v) => v >= 0);
  return timingDistribution(ms);
}

async function computeMutualToRevealTimings(since: Date) {
  const reveals = await prisma.reveal.findMany({
    where: { revealedAt: { gte: since } },
    include: { mutualInterest: true },
  });
  const ms = reveals.map(
    (r) => r.revealedAt.getTime() - r.mutualInterest.createdAt.getTime()
  );
  return timingDistribution(ms);
}

async function computeRevealToOutcomeTimings(since: Date) {
  const outcomes = await prisma.outcome.findMany({
    where: { reportedAt: { gte: since } },
    include: { reveal: true },
  });
  const ms = outcomes.map(
    (o) => o.reportedAt.getTime() - o.reveal.revealedAt.getTime()
  );
  return timingDistribution(ms);
}

export async function getEngagementMetrics() {
  const day = periodStart(1);
  const week = periodStart(7);
  const month = periodStart(30);

  const humanEngagementFilter = {
    userId: { not: null },
    NOT: {
      OR: [
        { eventType: { startsWith: "push_" } },
        { source: "push_pipeline" },
        { source: "smart_reminders" },
      ],
    },
  };

  const [dau, wau, mau, activeDealers] = await Promise.all([
    prisma.appEvent.groupBy({
      by: ["userId"],
      where: { ...humanEngagementFilter, createdAt: { gte: day } },
    }),
    prisma.appEvent.groupBy({
      by: ["userId"],
      where: { ...humanEngagementFilter, createdAt: { gte: week } },
    }),
    prisma.appEvent.groupBy({
      by: ["userId"],
      where: { ...humanEngagementFilter, createdAt: { gte: month } },
    }),
    (await import("./active-dealer")).countActiveDealers(30),
  ]);

  return {
    dau: dau.length,
    wau: wau.length,
    mau: mau.length,
    activeDealers30d: activeDealers,
  };
}

export async function getDealerResponseAnalytics() {
  const since = periodStart(30);

  const buyerTimes = await prisma.buyerInterest.findMany({
    where: { createdAt: { gte: since }, status: "INTERESTED" },
    select: {
      createdAt: true,
      candidateMatch: { select: { createdAt: true } },
    },
  });

  const sellerTimes = await prisma.sellerInterest.findMany({
    where: { createdAt: { gte: since }, status: "INTERESTED" },
    select: {
      createdAt: true,
      opportunity: { select: { createdAt: true } },
    },
  });

  const buyerMs = buyerTimes.map(
    (b) => b.createdAt.getTime() - b.candidateMatch.createdAt.getTime()
  );
  const sellerMs = sellerTimes.map(
    (s) => s.createdAt.getTime() - s.opportunity.createdAt.getTime()
  );

  const pendingValidations = await prisma.validationEvent.count({
    where: { status: "PENDING" },
  });
  const pendingOpportunities = await prisma.sellerOpportunity.count({
    where: { status: "OPEN" },
  });

  return {
    buyerResponse: formatTiming(timingDistribution(buyerMs)),
    sellerResponse: formatTiming(timingDistribution(sellerMs)),
    pendingValidations,
    pendingOpportunities,
  };
}

export async function getCommunicationAnalytics(excludeTest = true) {
  const where = excludeTest
    ? { source: { not: "ADMIN_TEST" as const } }
    : {};

  const [campaigns, totalsAgg] = await Promise.all([
    prisma.pushCampaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        source: true,
        selectedCount: true,
        eligibleCount: true,
        sentCount: true,
        failedCount: true,
        receivedCount: true,
        clickedCount: true,
        destinationOpenedCount: true,
        createdAt: true,
      },
    }),
    prisma.pushCampaign.aggregate({
      where,
      _sum: {
        selectedCount: true,
        eligibleCount: true,
        sentCount: true,
        failedCount: true,
        receivedCount: true,
        clickedCount: true,
        destinationOpenedCount: true,
      },
    }),
  ]);

  const totals = {
    selected: totalsAgg._sum.selectedCount ?? 0,
    eligible: totalsAgg._sum.eligibleCount ?? 0,
    sent: totalsAgg._sum.sentCount ?? 0,
    received: totalsAgg._sum.receivedCount ?? 0,
    clicked: totalsAgg._sum.clickedCount ?? 0,
    opened: totalsAgg._sum.destinationOpenedCount ?? 0,
  };

  return {
    campaigns,
    totals,
    receivedPct: pct(totals.received, totals.sent),
    clickedPct: pct(totals.clicked, totals.received),
    openedPct: pct(totals.opened, totals.clicked),
  };
}

/**
 * Canonical pilot funnel counts — analytics only, TEST emails excluded.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { DEALER_COHORT, isTestAccountEmail } from "@/config/accounts";
import { BUYER_VISIBLE_MATCH_WHERE } from "@/services/domain/candidate-policy";

async function pilotDealerIds(): Promise<string[]> {
  const dealers = await prisma.dealer.findMany({
    where: {
      OR: [
        { cohort: DEALER_COHORT.PILOT },
        { cohort: null, verificationStatus: "VERIFIED" },
      ],
    },
    select: {
      id: true,
      memberships: { select: { user: { select: { email: true } } }, take: 5 },
    },
  });
  return dealers
    .filter(
      (d) => !d.memberships.some((m) => isTestAccountEmail(m.user.email))
    )
    .map((d) => d.id);
}

export async function getPilotFunnelMetrics() {
  const dealerIds = await pilotDealerIds();
  if (dealerIds.length === 0) {
    return {
      activeDealers: 0,
      activeInventory: 0,
      activeDemand: 0,
      candidates: 0,
      partial: 0,
      qualified: 0,
      buyerInterests: 0,
      sellerInterests: 0,
      mutuals: 0,
      reveals: 0,
      dealDone: 0,
      noDeal: 0,
      rates: {
        qualifiedRate: null,
        buyerInterestRate: null,
        mutualRate: null,
        revealRate: null,
        dealRate: null,
      },
      timings: {
        note: "Median hours available via getPilotActivationMetrics().medianHours (firstMatchToInterest, interestToMutual, mutualToReveal, revealToDeal).",
      },
      excludesTestEmails: true,
    };
  }

  const [
    activeDealers,
    activeInventory,
    activeDemand,
    candidates,
    partial,
    qualified,
    buyerInterests,
    sellerInterests,
    mutuals,
    reveals,
    deals,
    noDeals,
  ] = await Promise.all([
    prisma.dealer.count({
      where: { id: { in: dealerIds }, verificationStatus: "VERIFIED" },
    }),
    prisma.vehicle.count({
      where: { status: "ACTIVE", dealerId: { in: dealerIds } },
    }),
    prisma.demand.count({
      where: { status: "ACTIVE", dealerId: { in: dealerIds } },
    }),
    prisma.candidateMatch.count({
      where: { demand: { dealerId: { in: dealerIds } } },
    }),
    prisma.candidateMatch.count({
      where: {
        demand: { dealerId: { in: dealerIds } },
        resolutionState: "NEEDS_INFORMATION",
      },
    }),
    prisma.candidateMatch.count({
      where: {
        demand: { dealerId: { in: dealerIds } },
        ...BUYER_VISIBLE_MATCH_WHERE,
      },
    }),
    prisma.buyerInterest.count({
      where: {
        status: "INTERESTED",
        dealerId: { in: dealerIds },
      },
    }),
    prisma.sellerInterest.count({
      where: {
        status: "INTERESTED",
        dealerId: { in: dealerIds },
      },
    }),
    prisma.mutualInterest.count({
      where: {
        sellerInterest: { dealerId: { in: dealerIds } },
      },
    }),
    prisma.reveal.count({
      where: {
        OR: [
          { buyerDealerId: { in: dealerIds } },
          { sellerDealerId: { in: dealerIds } },
        ],
      },
    }),
    prisma.outcome.count({
      where: {
        status: "DEAL_CLOSED",
        OR: [
          { buyerDealerId: { in: dealerIds } },
          { sellerDealerId: { in: dealerIds } },
        ],
      },
    }),
    prisma.outcome.count({
      where: {
        status: {
          in: [
            "PRICE_DIDNT_WORK",
            "VEHICLE_DIDNT_FIT",
            "DID_NOT_PROGRESS",
          ],
        },
        OR: [
          { buyerDealerId: { in: dealerIds } },
          { sellerDealerId: { in: dealerIds } },
        ],
      },
    }),
  ]);

  return {
    activeDealers,
    activeInventory,
    activeDemand,
    candidates,
    partial,
    qualified,
    buyerInterests,
    sellerInterests,
    mutuals,
    reveals,
    dealDone: deals,
    noDeal: noDeals,
    rates: {
      qualifiedRate:
        candidates > 0 ? Math.round((qualified / candidates) * 1000) / 10 : null,
      buyerInterestRate:
        qualified > 0
          ? Math.round((buyerInterests / qualified) * 1000) / 10
          : null,
      mutualRate:
        buyerInterests > 0
          ? Math.round((mutuals / buyerInterests) * 1000) / 10
          : null,
      revealRate:
        mutuals > 0 ? Math.round((reveals / mutuals) * 1000) / 10 : null,
      dealRate:
        reveals > 0 ? Math.round((deals / reveals) * 1000) / 10 : null,
    },
    timings: {
      note: "Median hours available via getPilotActivationMetrics().medianHours (firstMatchToInterest, interestToMutual, mutualToReveal, revealToDeal).",
    },
    excludesTestEmails: true,
  };
}

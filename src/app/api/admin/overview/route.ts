import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authResult = await requireAdminSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const [
    dealers,
    verifiedDealers,
    activeInventory,
    activeDemands,
    pendingValidations,
    validatedMatches,
    opportunities,
    mutualInterests,
    reveals,
    outcomes,
    dealClosed,
    pushSubs,
  ] = await Promise.all([
    prisma.dealer.count(),
    prisma.dealer.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.vehicle.count({ where: { status: "ACTIVE" } }),
    prisma.demand.count({ where: { status: "ACTIVE" } }),
    prisma.validationEvent.count({ where: { status: "PENDING" } }),
    prisma.candidateMatch.count({ where: { status: "VALIDATED" } }),
    prisma.sellerOpportunity.count({ where: { status: "OPEN" } }),
    prisma.mutualInterest.count(),
    prisma.reveal.count(),
    prisma.outcome.count(),
    prisma.outcome.count({ where: { status: "DEAL_CLOSED" } }),
    prisma.pushSubscription.count(),
  ]);

  const candidates = await prisma.candidateMatch.count();
  const buyerInterested = await prisma.buyerInterest.count({
    where: { status: "INTERESTED" },
  });
  const sellerInterested = await prisma.sellerInterest.count({
    where: { status: "INTERESTED" },
  });

  const revealToDealPct =
    reveals > 0 ? Math.round((dealClosed / reveals) * 100) : null;

  const stuckValidations = await prisma.validationEvent.findMany({
    where: {
      status: "PENDING",
      requestedAt: { lte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    take: 10,
    include: { vehicle: { select: { make: true, model: true } } },
  });

  const stuckOpportunities = await prisma.sellerOpportunity.findMany({
    where: {
      status: "OPEN",
      createdAt: { lte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    take: 10,
  });

  const revealsNoOutcome = await prisma.reveal.findMany({
    where: {
      outcome: null,
      revealedAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    take: 10,
    include: {
      buyerDealer: { select: { businessName: true } },
      sellerDealer: { select: { businessName: true } },
    },
  });

  return NextResponse.json({
    metrics: {
      dealers,
      verifiedDealers,
      activeInventory,
      activeDemands,
      pendingValidations,
      validatedMatches,
      opportunities,
      mutualInterests,
      reveals,
      outcomes,
      dealClosed,
      pushSubscriptions: pushSubs,
      revealToDealPct,
    },
    funnel: {
      candidates,
      validatedMatches,
      buyerInterested,
      opportunities,
      sellerInterested,
      reveals,
      dealClosed,
    },
    queues: {
      stuckValidations,
      stuckOpportunities,
      revealsNoOutcome,
    },
  });
}

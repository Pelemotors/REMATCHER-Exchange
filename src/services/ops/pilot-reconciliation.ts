/**
 * Low-risk idempotent reconciliation for known inconsistent pilot states.
 * Repair only when deterministic and safe. Otherwise count as diagnostic-only.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { cancelOpenRequestsForVehicle } from "@/services/matching/information-request";
import { createRevealFromMutualInterest } from "@/services/commercial/reveal-flow";
import { logEvent } from "@/services/events/log-event";

export async function reconcilePilotInconsistencies(): Promise<{
  cancelledEnrichmentOnSold: number;
  revealsRecovered: number;
  closedStaleOpportunities: number;
}> {
  // 1) Open enrichment on SOLD/ARCHIVED vehicles → cancel
  const soldWithOpen = await prisma.informationRequest.findMany({
    where: {
      status: "OPEN",
      vehicle: { status: { in: ["SOLD", "ARCHIVED"] } },
    },
    select: { vehicleId: true },
    take: 100,
  });
  const vehicleIds = [...new Set(soldWithOpen.map((r) => r.vehicleId))];
  for (const vehicleId of vehicleIds) {
    await cancelOpenRequestsForVehicle(vehicleId);
  }
  const cancelledEnrichmentOnSold = soldWithOpen.length;

  // 2) Mutual without Reveal → create Reveal (idempotent)
  const mutualsMissingReveal = await prisma.mutualInterest.findMany({
    where: { reveal: { is: null } },
    take: 50,
    include: {
      sellerInterest: {
        include: {
          opportunity: {
            include: {
              buyerInterest: true,
            },
          },
        },
      },
    },
  });

  let revealsRecovered = 0;
  for (const mutual of mutualsMissingReveal) {
    const si = mutual.sellerInterest;
    const opp = si.opportunity;
    if (!opp?.buyerInterest) continue;
    try {
      await createRevealFromMutualInterest({
        mutualInterestId: mutual.id,
        sellerInterestId: si.id,
        buyerDealerId: opp.buyerInterest.dealerId,
        sellerDealerId: si.dealerId,
        candidateMatchId: opp.candidateMatchId,
      });
      revealsRecovered += 1;
    } catch {
      // leave for next run / admin diagnostic
    }
  }

  // 3) OPEN Seller Opportunity on SOLD vehicle / inactive demand → CLOSE
  const closedStale = await prisma.sellerOpportunity.updateMany({
    where: {
      status: "OPEN",
      OR: [
        { vehicle: { status: { in: ["SOLD", "ARCHIVED"] } } },
        { candidateMatch: { demand: { status: { not: "ACTIVE" } } } },
        { candidateMatch: { status: { in: ["REJECTED", "HIDDEN"] } } },
      ],
    },
    data: { status: "CLOSED" },
  });

  await logEvent({
    eventType: "pilot_reconciliation_completed",
    entityType: "System",
    entityId: "reconciliation",
    source: "lifecycle_catchup",
    metadata: {
      cancelledEnrichmentOnSold,
      revealsRecovered,
      closedStaleOpportunities: closedStale.count,
    },
  });

  return {
    cancelledEnrichmentOnSold,
    revealsRecovered,
    closedStaleOpportunities: closedStale.count,
  };
}

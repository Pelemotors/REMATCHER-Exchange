/**
 * Durable SOLD → Exchange lifecycle (idempotent).
 * Call after VEHICLE_SOLD is durably recorded.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { emitExchangeEvent } from "@/services/exchange/events";
import { cancelOpenRequestsForVehicle } from "@/services/matching/information-request";

const TERMINAL_MATCH = ["REJECTED", "HIDDEN"] as const;

export async function applyVehicleSoldLifecycle(params: {
  vehicleId: string;
  dealerId: string;
  source?: string;
}): Promise<{
  closedOpportunities: number;
  invalidatedMatches: number;
}> {
  const { vehicleId, dealerId } = params;

  await cancelOpenRequestsForVehicle(vehicleId);

  const openOpps = await prisma.sellerOpportunity.updateMany({
    where: { vehicleId, status: "OPEN" },
    data: { status: "CLOSED" },
  });

  const openMatches = await prisma.candidateMatch.findMany({
    where: {
      vehicleId,
      status: { notIn: [...TERMINAL_MATCH] },
    },
    select: { id: true, demandId: true },
  });

  let invalidatedMatches = 0;
  for (const match of openMatches) {
    const hasMutual = await prisma.sellerOpportunity.findFirst({
      where: {
        candidateMatchId: match.id,
        sellerInterest: { is: { mutualInterest: { isNot: null } } },
      },
      select: { id: true },
    });
    if (hasMutual) continue;

    const reveal = await prisma.reveal.findFirst({
      where: { candidateMatchId: match.id },
      select: { id: true },
    });
    if (reveal) continue;

    await prisma.candidateMatch.update({
      where: { id: match.id },
      data: {
        status: "REJECTED",
        explanationText: "הרכב כבר אינו זמין",
      },
    });
    await emitExchangeEvent({
      eventType: "MATCH_INVALIDATED",
      dealerId,
      demandId: match.demandId,
      vehicleId,
      candidateMatchId: match.id,
      evidenceType: "SYSTEM_OBSERVED",
      privacyClass: "DEALER_SCOPED",
      reason: "vehicle_sold",
      eventData: { source: params.source ?? "sold_lifecycle" },
      idempotencyKey: `match-invalidated:sold:${match.id}`,
    });
    invalidatedMatches += 1;
  }

  await prisma.validationEvent.updateMany({
    where: { vehicleId, status: "PENDING" },
    data: { status: "REJECTED", response: "sold", respondedAt: new Date() },
  });

  return {
    closedOpportunities: openOpps.count,
    invalidatedMatches,
  };
}

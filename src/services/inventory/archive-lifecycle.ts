/**
 * Durable ARCHIVED / inventory-removed → Exchange lifecycle (idempotent).
 * NOT sold — uses inventory_removed / vehicle_unavailable semantics.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { emitExchangeEvent } from "@/services/exchange/events";
import { cancelOpenRequestsForVehicle } from "@/services/matching/information-request";

const TERMINAL_MATCH = ["REJECTED", "HIDDEN"] as const;

export async function applyVehicleArchiveLifecycle(params: {
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
        explanationText: "הרכב הוסר מהמלאי",
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
      reason: "inventory_removed",
      eventData: {
        source: params.source ?? "archive_lifecycle",
        lifecycle: "vehicle_unavailable",
      },
      idempotencyKey: `match-invalidated:archive:${match.id}`,
    });
    invalidatedMatches += 1;
  }

  await prisma.validationEvent.updateMany({
    where: { vehicleId, status: "PENDING" },
    data: {
      status: "REJECTED",
      response: "unavailable",
      respondedAt: new Date(),
    },
  });

  await emitExchangeEvent({
    eventType: "INVENTORY_REMOVED",
    dealerId,
    vehicleId,
    evidenceType: "SYSTEM_OBSERVED",
    privacyClass: "DEALER_SCOPED",
    reason: "inventory_removed",
    eventData: { source: params.source ?? "archive_lifecycle" },
    idempotencyKey: `inventory-removed:${vehicleId}`,
  }).catch(() => undefined);

  return {
    closedOpportunities: openOpps.count,
    invalidatedMatches,
  };
}

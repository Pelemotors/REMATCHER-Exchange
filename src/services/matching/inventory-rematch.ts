import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Canonical inventory-side discovery trigger.
 * Any inventory mutation that can change match eligibility must call this.
 * It intentionally discovers across ALL active demands owned by other dealers,
 * rather than only reevaluating CandidateMatch rows that already exist.
 */
export async function rematchAfterInventoryMutation(params: {
  vehicleId: string;
  sellerDealerId: string;
}) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: params.vehicleId },
    select: { id: true, dealerId: true, status: true },
  });

  if (!vehicle || vehicle.dealerId !== params.sellerDealerId) {
    return [] as string[];
  }

  if (vehicle.status !== "ACTIVE") {
    return [] as string[];
  }

  const activeDemands = await prisma.demand.findMany({
    where: {
      status: "ACTIVE",
      dealerId: { not: params.sellerDealerId },
    },
    select: { id: true },
  });

  if (activeDemands.length === 0) return [] as string[];

  const { runMatchingForDemand } = await import(
    "@/services/domain/matching-flow"
  );

  const rematched: string[] = [];
  for (const demand of activeDemands) {
    await runMatchingForDemand(demand.id);
    rematched.push(demand.id);
  }

  return rematched;
}

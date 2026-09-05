import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Canonical inventory-side discovery trigger.
 * Every inventory mutation that can change match eligibility must call this.
 *
 * Important: this discovers across ALL active demands owned by other dealers.
 * It must not depend on CandidateMatch rows already existing, otherwise a newly
 * eligible vehicle can never be discovered.
 */
export async function rematchAfterInventoryMutation(params: {
  vehicleId: string;
  sellerDealerId: string;
}) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: params.vehicleId },
    select: { id: true, dealerId: true, status: true },
  });

  if (
    !vehicle ||
    vehicle.dealerId !== params.sellerDealerId ||
    vehicle.status !== "ACTIVE"
  ) {
    return [] as string[];
  }

  const demands = await prisma.demand.findMany({
    where: {
      status: "ACTIVE",
      dealerId: { not: params.sellerDealerId },
    },
    select: { id: true },
  });

  if (demands.length === 0) return [] as string[];

  const { runMatchingForDemand } = await import(
    "@/services/domain/matching-flow"
  );

  const rematched: string[] = [];
  for (const demand of demands) {
    await runMatchingForDemand(demand.id);
    rematched.push(demand.id);
  }

  return rematched;
}

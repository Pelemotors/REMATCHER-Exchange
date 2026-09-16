import "server-only";
import { prisma } from "@/lib/prisma";
import { evaluateMatchV2 } from "@/services/matching/engine-v2";
import { legacyToSearchIntent } from "@/services/matching/legacy-search-intent-adapter";

/**
 * Private Match: vehicle in THIS dealer's workspace ↔ THIS dealer's demands.
 * Full detail allowed — same privacy boundary.
 * Never mutates visibility / never publishes to network.
 */
export async function matchPrivateVehicleToMyDemands(params: {
  dealerId: string;
  vehicleId: string;
}) {
  const vehicle = await prisma.vehicle.findFirst({
    where: {
      id: params.vehicleId,
      dealerId: params.dealerId,
      status: "ACTIVE",
    },
  });
  if (!vehicle) return { ok: false as const, error: "not_found" };

  const demands = await prisma.demand.findMany({
    where: {
      dealerId: params.dealerId,
      status: "ACTIVE",
    },
    include: {
      constraints: true,
      customer: {
        select: { id: true, name: true, normalizedPhone: true },
      },
    },
  });

  const hits: Array<{
    demandId: string;
    customerId: string | null;
    customerName: string | null;
    customerPhone: string | null;
    band: string | null;
    score: number;
    hardPassed: boolean;
    summary: string;
  }> = [];

  for (const demand of demands) {
    if (demand.confirmedJson == null) continue;
    try {
      const { structuredIntent } = legacyToSearchIntent(
        demand.confirmedJson,
        demand.constraints
      );
      const ev = evaluateMatchV2({ vehicle, intent: structuredIntent });
      if (
        ev.resolutionState === "RESOLVED" &&
        (ev.band === "NO_MATCH" || !ev.hardPassed)
      ) {
        continue;
      }
      hits.push({
        demandId: demand.id,
        customerId: demand.customerId,
        customerName: demand.customer?.name ?? null,
        customerPhone: demand.customer?.normalizedPhone ?? null,
        band: ev.band,
        score: ev.score,
        hardPassed: ev.hardPassed,
        summary: demand.rawText.slice(0, 160),
      });
    } catch {
      continue;
    }
  }

  hits.sort((a, b) => b.score - a.score);

  return {
    ok: true as const,
    vehicleId: vehicle.id,
    relationship: vehicle.dealerRelationship,
    visibility: vehicle.visibility,
    publishedToNetwork: vehicle.visibility === "ANONYMOUS_NETWORK",
    matchCount: hits.length,
    matches: hits,
  };
}

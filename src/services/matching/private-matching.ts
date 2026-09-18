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

/**
 * Private Match: demand in THIS dealer's workspace ↔ THIS dealer's ACTIVE inventory.
 * Includes PRIVATE visibility vehicles. Never mutates visibility.
 */
export async function matchDemandToMyInventory(params: {
  dealerId: string;
  demandId: string;
}) {
  const demand = await prisma.demand.findFirst({
    where: {
      id: params.demandId,
      dealerId: params.dealerId,
      status: "ACTIVE",
    },
    include: { constraints: true },
  });
  if (!demand || demand.confirmedJson == null) {
    return { ok: false as const, error: "not_found" as const };
  }

  let structuredIntent;
  try {
    ({ structuredIntent } = legacyToSearchIntent(
      demand.confirmedJson,
      demand.constraints
    ));
  } catch {
    return { ok: false as const, error: "not_found" as const };
  }

  const vehicles = await prisma.vehicle.findMany({
    where: {
      dealerId: params.dealerId,
      status: "ACTIVE",
    },
    include: {
      media: {
        where: { isPrimary: true },
        take: 1,
        orderBy: { sortOrder: "asc" },
        select: { storageKey: true },
      },
    },
  });

  const { publicThumbUrlForDisplayKey } = await import("@/lib/media/storage");

  type MatchHit = {
    vehicleId: string;
    make: string | null;
    model: string | null;
    year: number | null;
    thumbUrl: string | null;
    band: string | null;
    score: number;
    hardPassed: boolean;
    dealerRelationship?: string;
  };

  const inventoryMatches: MatchHit[] = [];
  const otherWorkspaceMatches: MatchHit[] = [];

  const inventoryRelationships = new Set(["OWNED", "INVENTORY"]);
  const workspaceRelationships = new Set([
    "OFFERED_TO_ME",
    "TRADE_IN_CANDIDATE",
    "EXTERNAL",
  ]);

  for (const vehicle of vehicles) {
    try {
      const ev = evaluateMatchV2({ vehicle, intent: structuredIntent });
      if (
        ev.resolutionState === "RESOLVED" &&
        (ev.band === "NO_MATCH" || !ev.hardPassed)
      ) {
        continue;
      }
      const primaryKey = vehicle.media[0]?.storageKey ?? null;
      const hit: MatchHit = {
        vehicleId: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        thumbUrl: primaryKey ? publicThumbUrlForDisplayKey(primaryKey) : null,
        band: ev.band,
        score: ev.score,
        hardPassed: ev.hardPassed,
        dealerRelationship: vehicle.dealerRelationship,
      };
      if (inventoryRelationships.has(vehicle.dealerRelationship)) {
        inventoryMatches.push(hit);
      } else if (workspaceRelationships.has(vehicle.dealerRelationship)) {
        otherWorkspaceMatches.push(hit);
      }
    } catch {
      continue;
    }
  }

  inventoryMatches.sort((a, b) => b.score - a.score);
  otherWorkspaceMatches.sort((a, b) => b.score - a.score);

  return {
    ok: true as const,
    demandId: demand.id,
    matchCount: inventoryMatches.length,
    inventoryMatches,
    otherWorkspaceMatches,
    matches: inventoryMatches,
  };
}

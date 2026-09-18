import "server-only";
import { prisma } from "@/lib/prisma";
import { legacyToSearchIntent } from "@/services/matching/legacy-search-intent-adapter";
import { networkSupplyWhere } from "@/services/vehicles/relationship-visibility";
import {
  dealerAllowsSyntheticMarket,
  networkDemandWhere,
} from "@/services/dealer/market-scope";

/**
 * Network Intelligence — privacy-safe aggregates only.
 * Never returns dealer/customer/phone/raw cross-dealer rows.
 *
 * PRODUCT_DECISION_REQUIRED: NETWORK_INTEL_MIN_COHORT (default 3).
 */

export type NetworkIntelQuery = {
  dealerId: string;
  make?: string | null;
  model?: string | null;
  yearMin?: number | null;
  yearMax?: number | null;
};

export type NetworkIntelSnapshot = {
  ok: true;
  query: {
    make?: string | null;
    model?: string | null;
    yearMin?: number | null;
    yearMax?: number | null;
  };
  demand: {
    activeCount: number | null;
    highMatchEstimate: number | null;
    insufficientData: boolean;
  };
  supply: {
    activeCount: number | null;
    insufficientData: boolean;
  };
  myPrivate: {
    matchingDemandCount: number;
    matchingVehicleCount: number;
  };
  privacyNote: string;
};

function minCohort(): number {
  const raw = process.env.NETWORK_INTEL_MIN_COHORT;
  if (raw && /^\d+$/.test(raw)) return Math.max(1, Number(raw));
  return 3;
}

function vehicleMatchesQuery(
  v: { make: string | null; model: string | null; year: number | null },
  q: NetworkIntelQuery
): boolean {
  if (q.make && (v.make ?? "").toLowerCase() !== q.make.toLowerCase()) return false;
  if (q.model && !(v.model ?? "").toLowerCase().includes(q.model.toLowerCase())) {
    return false;
  }
  if (q.yearMin != null && (v.year == null || v.year < q.yearMin)) return false;
  if (q.yearMax != null && (v.year == null || v.year > q.yearMax)) return false;
  return true;
}

function demandMatchesQuery(confirmedJson: unknown, q: NetworkIntelQuery): boolean {
  const j = (confirmedJson ?? {}) as Record<string, unknown>;
  const make = typeof j.make === "string" ? j.make : null;
  const model = typeof j.model === "string" ? j.model : null;
  const yearMin = typeof j.yearMin === "number" ? j.yearMin : null;
  const yearMax = typeof j.yearMax === "number" ? j.yearMax : null;
  if (q.make && (!make || make.toLowerCase() !== q.make.toLowerCase())) return false;
  if (q.model && (!model || !model.toLowerCase().includes(q.model.toLowerCase()))) {
    return false;
  }
  if (q.yearMin != null && yearMax != null && yearMax < q.yearMin) return false;
  if (q.yearMax != null && yearMin != null && yearMin > q.yearMax) return false;
  return true;
}

function cloak(
  count: number,
  min: number
): { value: number | null; insufficientData: boolean } {
  if (count < min) return { value: null, insufficientData: true };
  return { value: count, insufficientData: false };
}

export async function getNetworkIntelligenceSnapshot(
  query: NetworkIntelQuery
): Promise<NetworkIntelSnapshot> {
  const min = minCohort();
  const allowSynthetic = await dealerAllowsSyntheticMarket(query.dealerId);

  const [demands, supplies, myDemands, myVehicles] = await Promise.all([
    prisma.demand.findMany({
      where: networkDemandWhere(query.dealerId, allowSynthetic),
      select: { id: true, confirmedJson: true, constraints: true },
      take: 800,
    }),
    prisma.vehicle.findMany({
      where: networkSupplyWhere(query.dealerId, allowSynthetic),
      select: { id: true, make: true, model: true, year: true },
      take: 800,
    }),
    prisma.demand.findMany({
      where: {
        dealerId: query.dealerId,
        status: "ACTIVE",
      },
      select: { id: true, confirmedJson: true },
    }),
    prisma.vehicle.findMany({
      where: { dealerId: query.dealerId, status: "ACTIVE" },
      select: { id: true, make: true, model: true, year: true },
    }),
  ]);

  const demandIds = new Set<string>();
  for (const d of demands) {
    if (d.confirmedJson == null) continue;
    if (demandMatchesQuery(d.confirmedJson, query)) demandIds.add(d.id);
  }
  const supplyIds = new Set<string>();
  for (const v of supplies) {
    if (vehicleMatchesQuery(v, query)) supplyIds.add(v.id);
  }

  // High-match estimate skipped when no price on synthetic — count demand cohort only.
  // Use soft band heuristic: identity make/model match via adapter without inventing prices.
  let highMatch = 0;
  for (const d of demands) {
    if (!demandIds.has(d.id) || d.confirmedJson == null) continue;
    try {
      const { structuredIntent } = legacyToSearchIntent(
        d.confirmedJson,
        d.constraints
      );
      const universe = structuredIntent.vehicleUniverse as
        | { make?: string; model?: string }
        | undefined;
      const makeOk =
        !query.make ||
        (universe?.make ?? "").toLowerCase() === query.make.toLowerCase();
      const modelOk =
        !query.model ||
        (universe?.model ?? "")
          .toLowerCase()
          .includes(query.model.toLowerCase());
      if (makeOk && modelOk) highMatch += 1;
    } catch {
      /* skip */
    }
  }

  const demandCloak = cloak(demandIds.size, min);
  const supplyCloak = cloak(supplyIds.size, min);
  const highCloak = cloak(highMatch, min);

  return {
    ok: true,
    query: {
      make: query.make,
      model: query.model,
      yearMin: query.yearMin,
      yearMax: query.yearMax,
    },
    demand: {
      activeCount: demandCloak.value,
      highMatchEstimate: highCloak.value,
      insufficientData: demandCloak.insufficientData,
    },
    supply: {
      activeCount: supplyCloak.value,
      insufficientData: supplyCloak.insufficientData,
    },
    myPrivate: {
      matchingDemandCount: myDemands.filter(
        (d) => d.confirmedJson != null && demandMatchesQuery(d.confirmedJson, query)
      ).length,
      matchingVehicleCount: myVehicles.filter((v) =>
        vehicleMatchesQuery(v, query)
      ).length,
    },
    privacyNote:
      "Network counts are anonymous aggregates only. Identities are never included. Small cohorts are suppressed.",
  };
}

/** Guard: ensure NI response never embeds forbidden identity keys */
export function assertNetworkIntelSafe(payload: unknown): boolean {
  const s = JSON.stringify(payload).toLowerCase();
  const banned = [
    "customerphone",
    "phonenumber",
    "businessname",
    "contactname",
    "normalizedphone",
    "rawphone",
  ];
  for (const b of banned) {
    if (s.includes(`"${b}"`)) return false;
  }
  return true;
}

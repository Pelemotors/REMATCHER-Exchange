/**
 * Exchange Intelligence Engine V2 — privacy-safe network aggregates.
 *
 * Cohort widening (never cross models):
 *   LEVEL 0 — make + model + year window + exact fuel (when known)
 *   LEVEL 1 — make + model + year window + fuel family (when fuel known)
 *   LEVEL 2 — make + model + year window (fuel ignored)
 *
 * Liquidity labels (CHECK_LIQUIDITY):
 *   HIGH  — supplyCount >= 8 and demandCount >= 5
 *   MODERATE — supplyCount >= minCohort and demandCount >= minCohort
 *   THIN — otherwise but cohort met at some level
 *   UNKNOWN — insufficientData at all levels
 *
 * Trade risk (CHECK_TRADE_RISK):
 *   ELEVATED — demand/supply ratio > 2.5 with thin supply (< 5)
 *   MODERATE — demand/supply ratio > 1.5
 *   LOW — balanced or supply-heavy
 *   UNKNOWN — insufficientData
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { legacyToSearchIntent } from "@/services/matching/legacy-search-intent-adapter";
import { networkSupplyWhere } from "@/services/vehicles/relationship-visibility";
import {
  canonicalizeFuelType,
  canonicalizeMake,
  canonicalizeModel,
  type CanonicalFuelType,
} from "@/services/exchange/vehicle-identity";
import { matchPrivateVehicleToMyDemands } from "@/services/matching/private-matching";
import type { MatchVehicleInput } from "@/services/matching/engine-v2";

export type ExchangeIntelAction =
  | "MARKET_OVERVIEW"
  | "CHECK_DEMAND"
  | "CHECK_SUPPLY"
  | "COMPARE_SIMILAR"
  | "CHECK_BUY_PRICE"
  | "CHECK_LIQUIDITY"
  | "CHECK_TRADE_RISK"
  | "MATCH_MY_CUSTOMERS";

export type ExchangeIntelSubject =
  | { vehicleId: string }
  | { demandId: string }
  | {
      make: string;
      model: string;
      yearMin?: number | null;
      yearMax?: number | null;
      fuel?: string | null;
      engine?: string | null;
    };

export type ResolvedIntelSubject = {
  make: string;
  model: string;
  yearMin: number | null;
  yearMax: number | null;
  fuel: CanonicalFuelType | null;
  engineHint: string | null;
  vehicleId?: string;
  demandId?: string;
};

function minCohort(): number {
  const raw = process.env.NETWORK_INTEL_MIN_COHORT;
  if (raw && /^\d+$/.test(raw)) return Math.max(1, Number(raw));
  return 3;
}

function minDistinctDealers(): number {
  const raw = process.env.NETWORK_INTEL_MIN_DISTINCT_DEALERS;
  if (raw && /^\d+$/.test(raw)) return Math.max(1, Number(raw));
  return 3;
}

function minDistributionObs(): number {
  return 5;
}

function fuelFamily(fuel: CanonicalFuelType | null): string | null {
  if (!fuel) return null;
  if (fuel === "HYBRID" || fuel === "PLUG_IN_HYBRID") return "HYBRID_FAMILY";
  if (fuel === "ELECTRIC" || fuel === "HYDROGEN") return "ELECTRIC_FAMILY";
  if (
    fuel === "GASOLINE" ||
    fuel === "DIESEL" ||
    fuel === "LPG" ||
    fuel === "CNG" ||
    fuel === "OTHER"
  ) {
    return "ICE_FAMILY";
  }
  return "OTHER_FAMILY";
}

function readVehicleFuel(v: MatchVehicleInput): CanonicalFuelType | null {
  const prov = v.fieldProvenance;
  let raw: string | null = null;
  if (prov && typeof prov === "object" && !Array.isArray(prov)) {
    const rec = prov as Record<string, unknown>;
    for (const k of ["fuel", "fuelType"]) {
      const val = rec[k];
      if (typeof val === "string") raw = val;
      if (val && typeof val === "object" && "value" in val) {
        const inner = (val as { value?: unknown }).value;
        if (typeof inner === "string") raw = inner;
      }
    }
  }
  return canonicalizeFuelType(raw);
}

function yearInRange(year: number | null, min: number | null, max: number | null): boolean {
  if (year == null) return min == null && max == null;
  if (min != null && year < min) return false;
  if (max != null && year > max) return false;
  return true;
}

function modelsMatch(model: string | null, target: string): boolean {
  if (!model) return false;
  return model.toLowerCase().includes(target.toLowerCase());
}

type CohortRow = {
  dealerId: string;
  year: number | null;
  fuel: CanonicalFuelType | null;
  b2bPrice: number | null;
  retailPrice: number | null;
  budget: number | null;
  kind: "supply" | "demand";
};

function cohortAtLevel(rows: CohortRow[], level: 0 | 1 | 2, subject: ResolvedIntelSubject): CohortRow[] {
  return rows.filter((r) => {
    if (!yearInRange(r.year, subject.yearMin, subject.yearMax)) return false;
    if (subject.fuel == null) return true;
    if (r.fuel == null) return level >= 2;
    if (level === 0) return r.fuel === subject.fuel;
    if (level === 1) return fuelFamily(r.fuel) === fuelFamily(subject.fuel);
    return true;
  });
}

function distinctDealers(rows: CohortRow[]): number {
  return new Set(rows.map((r) => r.dealerId)).size;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function cloakCount(count: number, min: number, dealers: number, minDealers: number) {
  if (count < min || dealers < minDealers) {
    return { value: null as number | null, insufficientData: true };
  }
  return { value: count, insufficientData: false };
}

function cloakDistribution(values: number[], rows: CohortRow[]) {
  const dealers = distinctDealers(rows);
  const minObs = minDistributionObs();
  const minDealers = minDistinctDealers();
  if (values.length < minObs || dealers < minDealers) {
    return { median: null, p25: null, p75: null, insufficientData: true as const };
  }
  const s = [...values].sort((a, b) => a - b);
  const p25 = s[Math.floor(s.length * 0.25)] ?? null;
  const p75 = s[Math.floor(s.length * 0.75)] ?? null;
  return {
    median: median(values),
    p25,
    p75,
    insufficientData: false as const,
  };
}

function pickCohort(rows: CohortRow[], subject: ResolvedIntelSubject) {
  const min = minCohort();
  const minDealers = minDistinctDealers();
  for (const level of [0, 1, 2] as const) {
    const cohort = cohortAtLevel(rows, level, subject);
    const dealers = distinctDealers(cohort);
    if (cohort.length >= min && dealers >= minDealers) {
      return { cohort, level, insufficientData: false as const };
    }
  }
  return { cohort: [] as CohortRow[], level: 2 as const, insufficientData: true as const };
}

function budgetFromConfirmed(confirmedJson: unknown): number | null {
  const j = (confirmedJson ?? {}) as Record<string, unknown>;
  for (const k of ["budgetMax", "maxBudget", "budget", "priceMax"]) {
    const v = j[k];
    if (typeof v === "number" && v > 0) return v;
  }
  const budgets = j.budgets;
  if (budgets && typeof budgets === "object" && !Array.isArray(budgets)) {
    const b = budgets as Record<string, unknown>;
    for (const k of ["max", "hardMax", "ceiling"]) {
      const v = b[k];
      if (typeof v === "number" && v > 0) return v;
    }
  }
  return null;
}

export async function resolveExchangeIntelSubject(
  dealerId: string,
  subject: ExchangeIntelSubject
): Promise<ResolvedIntelSubject | null> {
  if ("vehicleId" in subject && subject.vehicleId) {
    const v = await prisma.vehicle.findFirst({
      where: { id: subject.vehicleId, dealerId },
    });
    if (!v?.make || !v.model) return null;
    const id = canonicalizeMake(v.make);
    const model = canonicalizeModel(v.model);
    if (!id || !model) return null;
    return {
      make: id,
      model,
      yearMin: v.year,
      yearMax: v.year,
      fuel: readVehicleFuel(v as MatchVehicleInput),
      engineHint: null,
      vehicleId: v.id,
    };
  }
  if ("demandId" in subject && subject.demandId) {
    const d = await prisma.demand.findFirst({
      where: { id: subject.demandId, dealerId },
      include: { constraints: true },
    });
    if (!d?.confirmedJson) return null;
    const j = d.confirmedJson as Record<string, unknown>;
    const make = canonicalizeMake(typeof j.make === "string" ? j.make : null);
    const model = canonicalizeModel(typeof j.model === "string" ? j.model : null);
    if (!make || !model) {
      try {
        const { structuredIntent } = legacyToSearchIntent(d.confirmedJson, d.constraints);
        const u = structuredIntent.vehicleUniverse as { make?: string; model?: string } | undefined;
        const m2 = canonicalizeMake(u?.make ?? null);
        const mod2 = canonicalizeModel(u?.model ?? null);
        if (!m2 || !mod2) return null;
        return {
          make: m2,
          model: mod2,
          yearMin: typeof j.yearMin === "number" ? j.yearMin : null,
          yearMax: typeof j.yearMax === "number" ? j.yearMax : null,
          fuel: canonicalizeFuelType(typeof j.fuel === "string" ? j.fuel : null),
          engineHint: null,
          demandId: d.id,
        };
      } catch {
        return null;
      }
    }
    return {
      make,
      model,
      yearMin: typeof j.yearMin === "number" ? j.yearMin : null,
      yearMax: typeof j.yearMax === "number" ? j.yearMax : null,
      fuel: canonicalizeFuelType(typeof j.fuel === "string" ? j.fuel : null),
      engineHint: null,
      demandId: d.id,
    };
  }
  if (!("make" in subject) || !("model" in subject)) return null;
  const make = canonicalizeMake(subject.make);
  const model = canonicalizeModel(subject.model);
  if (!make || !model) return null;
  return {
    make,
    model,
    yearMin: subject.yearMin ?? null,
    yearMax: subject.yearMax ?? null,
    fuel: canonicalizeFuelType(subject.fuel ?? null),
    engineHint: subject.engine ?? null,
  };
}

async function loadNetworkRows(
  dealerId: string,
  subject: ResolvedIntelSubject
): Promise<CohortRow[]> {
  const [supplies, demands] = await Promise.all([
    prisma.vehicle.findMany({
      where: networkSupplyWhere(dealerId),
      select: {
        dealerId: true,
        make: true,
        model: true,
        year: true,
        b2bPrice: true,
        retailPrice: true,
        fieldProvenance: true,
      },
      take: 1200,
    }),
    prisma.demand.findMany({
      where: {
        status: "ACTIVE",
        networkVisibility: "ANONYMOUS_NETWORK",
        dealerId: { not: dealerId },
      },
      select: { dealerId: true, confirmedJson: true, constraints: true },
      take: 1200,
    }),
  ]);

  const rows: CohortRow[] = [];
  for (const v of supplies) {
    const mk = canonicalizeMake(v.make);
    const md = canonicalizeModel(v.model);
    if (!mk || !md || mk !== subject.make || !modelsMatch(md, subject.model)) continue;
    rows.push({
      dealerId: v.dealerId,
      year: v.year,
      fuel: readVehicleFuel(v as MatchVehicleInput),
      b2bPrice: v.b2bPrice,
      retailPrice: v.retailPrice,
      budget: null,
      kind: "supply",
    });
  }
  for (const d of demands) {
    if (d.confirmedJson == null) continue;
    const j = d.confirmedJson as Record<string, unknown>;
    const mk = canonicalizeMake(typeof j.make === "string" ? j.make : null);
    const md = canonicalizeModel(typeof j.model === "string" ? j.model : null);
    let make = mk;
    let model = md;
    if (!make || !model) {
      try {
        const { structuredIntent } = legacyToSearchIntent(d.confirmedJson, d.constraints);
        const u = structuredIntent.vehicleUniverse as { make?: string; model?: string } | undefined;
        make = canonicalizeMake(u?.make ?? null);
        model = canonicalizeModel(u?.model ?? null);
      } catch {
        continue;
      }
    }
    if (!make || !model || make !== subject.make || !modelsMatch(model, subject.model)) {
      continue;
    }
    const yearMin = typeof j.yearMin === "number" ? j.yearMin : null;
    const yearMax = typeof j.yearMax === "number" ? j.yearMax : null;
    rows.push({
      dealerId: d.dealerId,
      year: yearMax ?? yearMin,
      fuel: canonicalizeFuelType(typeof j.fuel === "string" ? j.fuel : null),
      b2bPrice: null,
      retailPrice: null,
      budget: budgetFromConfirmed(d.confirmedJson),
      kind: "demand",
    });
  }
  return rows;
}

function liquidityLabel(supplyCount: number, demandCount: number): string {
  if (supplyCount >= 8 && demandCount >= 5) return "HIGH";
  if (supplyCount >= minCohort() && demandCount >= minCohort()) return "MODERATE";
  if (supplyCount > 0 || demandCount > 0) return "THIN";
  return "UNKNOWN";
}

function tradeRiskLabel(supplyCount: number, demandCount: number): string {
  if (supplyCount === 0 && demandCount === 0) return "UNKNOWN";
  if (supplyCount === 0) return "ELEVATED";
  const ratio = demandCount / supplyCount;
  if (ratio > 2.5 && supplyCount < 5) return "ELEVATED";
  if (ratio > 1.5) return "MODERATE";
  return "LOW";
}

export async function runExchangeIntelligenceEngine(input: {
  dealerId: string;
  action: ExchangeIntelAction;
  subject: ExchangeIntelSubject;
  offeredPrice?: number | null;
  /** When false, omit customer phone from MATCH_MY_CUSTOMERS (agent safety). */
  includeCustomerPhone?: boolean;
}) {
  const resolved = await resolveExchangeIntelSubject(input.dealerId, input.subject);
  if (!resolved) {
    return { ok: false as const, error: "subject_unresolved" as const };
  }

  const rows = await loadNetworkRows(input.dealerId, resolved);
  const picked = pickCohort(rows, resolved);
  const supplyRows = picked.cohort.filter((r) => r.kind === "supply");
  const demandRows = picked.cohort.filter((r) => r.kind === "demand");
  const min = minCohort();
  const minDealers = minDistinctDealers();
  const dealers = distinctDealers(picked.cohort);

  const supplyCloak = cloakCount(supplyRows.length, min, dealers, minDealers);
  const demandCloak = cloakCount(demandRows.length, min, dealers, minDealers);

  const b2bPrices = supplyRows.map((r) => r.b2bPrice).filter((p): p is number => p != null && p > 0);
  const retailPrices = supplyRows
    .map((r) => r.retailPrice)
    .filter((p): p is number => p != null && p > 0);
  const buyerBudgets = demandRows.map((r) => r.budget).filter((p): p is number => p != null && p > 0);

  const supplyB2B = cloakDistribution(b2bPrices, supplyRows);
  const supplyRetail = cloakDistribution(retailPrices, supplyRows);
  const buyerBudget = cloakDistribution(buyerBudgets, demandRows);

  const base = {
    ok: true as const,
    action: input.action,
    subject: resolved,
    cohortLevel: picked.level,
    insufficientData: picked.insufficientData,
    privacyNote:
      "Anonymous aggregates only. Raw cross-dealer rows are never returned.",
  };

  if (input.action === "MATCH_MY_CUSTOMERS") {
    if (!resolved.vehicleId) {
      return { ok: false as const, error: "vehicleId_required" as const };
    }
    const priv = await matchPrivateVehicleToMyDemands({
      dealerId: input.dealerId,
      vehicleId: resolved.vehicleId,
    });
    if (!priv.ok) return { ok: false as const, error: "not_found" as const };
    const matches = priv.matches.map((m) => ({
      demandId: m.demandId,
      customerName: m.customerName,
      ...(input.includeCustomerPhone ? { customerPhone: m.customerPhone } : {}),
      band: m.band,
      score: m.score,
      hardPassed: m.hardPassed,
      summary: m.summary,
    }));
    return { ...base, matchCount: matches.length, matches };
  }

  if (input.action === "CHECK_BUY_PRICE") {
    if (input.offeredPrice == null || input.offeredPrice <= 0) {
      return {
        ...base,
        priceFamily: "SUPPLY_ASKING_PRICE_B2B",
        needsOfferedPrice: true,
        supplyMedianB2B: supplyB2B.median,
        insufficientDistribution: supplyB2B.insufficientData,
      };
    }
    const med = supplyB2B.median;
    let verdict: string | null = null;
    if (med != null && !supplyB2B.insufficientData) {
      const delta = ((input.offeredPrice - med) / med) * 100;
      if (delta <= -8) verdict = "BELOW_MARKET";
      else if (delta >= 8) verdict = "ABOVE_MARKET";
      else verdict = "NEAR_MEDIAN";
    }
    return {
      ...base,
      priceFamily: "SUPPLY_ASKING_PRICE_B2B",
      offeredPrice: input.offeredPrice,
      supplyMedianB2B: supplyB2B.median,
      insufficientDistribution: supplyB2B.insufficientData,
      verdict,
    };
  }

  if (input.action === "CHECK_LIQUIDITY") {
    const label = picked.insufficientData
      ? "UNKNOWN"
      : liquidityLabel(supplyRows.length, demandRows.length);
    return {
      ...base,
      evidence: {
        supplyObservations: supplyCloak.insufficientData ? null : supplyRows.length,
        demandObservations: demandCloak.insufficientData ? null : demandRows.length,
        distinctDealers: picked.insufficientData ? null : dealers,
      },
      label,
    };
  }

  if (input.action === "CHECK_TRADE_RISK") {
    const sc = supplyCloak.insufficientData ? 0 : supplyRows.length;
    const dc = demandCloak.insufficientData ? 0 : demandRows.length;
    const label = picked.insufficientData ? "UNKNOWN" : tradeRiskLabel(sc, dc);
    return {
      ...base,
      evidence: {
        supplyObservations: supplyCloak.insufficientData ? null : sc,
        demandObservations: demandCloak.insufficientData ? null : dc,
        demandSupplyRatio:
          sc > 0 && !demandCloak.insufficientData && !supplyCloak.insufficientData
            ? Math.round((dc / sc) * 100) / 100
            : null,
      },
      label,
    };
  }

  if (input.action === "CHECK_DEMAND") {
    return {
      ...base,
      demand: {
        activeCount: demandCloak.value,
        insufficientData: demandCloak.insufficientData,
      },
      buyerBudget: {
        median: buyerBudget.median,
        insufficientData: buyerBudget.insufficientData,
        priceFamily: "BUYER_BUDGET",
      },
    };
  }

  if (input.action === "CHECK_SUPPLY") {
    return {
      ...base,
      supply: {
        activeCount: supplyCloak.value,
        insufficientData: supplyCloak.insufficientData,
      },
      askingB2B: {
        median: supplyB2B.median,
        insufficientData: supplyB2B.insufficientData,
        priceFamily: "SUPPLY_ASKING_PRICE_B2B",
      },
      askingRetail: {
        median: supplyRetail.median,
        insufficientData: supplyRetail.insufficientData,
        priceFamily: "SUPPLY_ASKING_PRICE_RETAIL",
      },
    };
  }

  if (input.action === "COMPARE_SIMILAR") {
    return {
      ...base,
      comparison: {
        supplyCount: supplyCloak.value,
        demandCount: demandCloak.value,
        supplyMedianB2B: supplyB2B.median,
        supplyMedianRetail: supplyRetail.median,
        buyerBudgetMedian: buyerBudget.median,
        insufficientData: picked.insufficientData,
      },
    };
  }

  // MARKET_OVERVIEW (default combined snapshot)
  return {
    ...base,
    overview: {
      cohortLevel: picked.level,
      demand: {
        activeCount: demandCloak.value,
        insufficientData: demandCloak.insufficientData,
      },
      supply: {
        activeCount: supplyCloak.value,
        insufficientData: supplyCloak.insufficientData,
      },
      buyerBudget: {
        median: buyerBudget.median,
        insufficientData: buyerBudget.insufficientData,
        priceFamily: "BUYER_BUDGET",
      },
      askingB2B: {
        median: supplyB2B.median,
        insufficientData: supplyB2B.insufficientData,
        priceFamily: "SUPPLY_ASKING_PRICE_B2B",
      },
      askingRetail: {
        median: supplyRetail.median,
        insufficientData: supplyRetail.insufficientData,
        priceFamily: "SUPPLY_ASKING_PRICE_RETAIL",
      },
      liquidity: picked.insufficientData
        ? "UNKNOWN"
        : liquidityLabel(supplyRows.length, demandRows.length),
      tradeRisk: picked.insufficientData
        ? "UNKNOWN"
        : tradeRiskLabel(supplyRows.length, demandRows.length),
    },
  };
}

export { minCohort, minDistinctDealers, cloakCount };

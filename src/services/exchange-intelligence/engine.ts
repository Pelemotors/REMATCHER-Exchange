/**
 * Exchange Intelligence Engine V2 — privacy-safe network aggregates.
 *
 * Year widening (never cross models):
 *   LEVEL 0 — exact subject year span (scalar or demand yearMin..yearMax)
 *   LEVEL 1 — span ± 1 year (disclosed via yearWidening.deltaYears)
 *   LEVEL 2 — span ± 2 years
 *
 * Fuel cohort (within year level):
 *   LEVEL 0 — exact fuel when known
 *   LEVEL 1 — fuel family
 *   LEVEL 2 — fuel ignored
 *
 * Privacy: supplyDistinctDealers and demandDistinctDealers evaluated separately.
 * Price/mileage/hand/fuel/engine distributions use contributor-side rows only.
 * Liquidity, tradeRisk, marketBalance require BOTH sides to pass privacy else UNKNOWN.
 *
 * Market balance (MARKET_OVERVIEW):
 *   DEMAND_HEAVY — demand/supply >= 1.5 (both sides pass privacy)
 *   SUPPLY_HEAVY — supply/demand >= 1.5
 *   BALANCED — otherwise
 *   INSUFFICIENT_DATA — either side fails privacy or zero observations
 *
 * Trade risk (CHECK_TRADE_RISK) — evidence-based, separate from market balance:
 *   Strong demand + scarce supply must NEVER elevate risk (LOW/MODERATE).
 *   ELEVATED — supply-heavy / weak demand, offered price above B2B band, etc.
 *   UNKNOWN — either side fails privacy or no usable evidence
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/services/events/log-event";
import { legacyToSearchIntent } from "@/services/matching/legacy-search-intent-adapter";
import { networkSupplyWhere } from "@/services/vehicles/relationship-visibility";
import {
  dealerAllowsSyntheticMarket,
  networkDemandWhere,
} from "@/services/dealer/market-scope";
import {
  canonicalizeFuelType,
  canonicalizeMake,
  canonicalizeModel,
  type CanonicalFuelType,
} from "@/services/exchange/vehicle-identity";
import {
  matchPrivateSubjectToMyDemands,
  matchPrivateVehicleToMyDemands,
} from "@/services/matching/private-matching";
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

export type MarketBalanceLabel =
  | "DEMAND_HEAVY"
  | "BALANCED"
  | "SUPPLY_HEAVY"
  | "INSUFFICIENT_DATA";

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

/** Per-vehicle engine label from provenance — never copy subject.engineHint onto every row. */
function readVehicleEngine(v: {
  fieldProvenance?: unknown;
}): string | null {
  const prov = v.fieldProvenance;
  if (!prov || typeof prov !== "object" || Array.isArray(prov)) return null;
  const rec = prov as Record<string, unknown>;
  for (const k of ["engine", "engineFamily", "engineDisplacementCc", "engineCc"]) {
    const val = rec[k];
    if (typeof val === "string" && val.trim()) return val.trim();
    if (typeof val === "number" && val > 0) return String(Math.round(val));
    if (val && typeof val === "object" && "value" in val) {
      const inner = (val as { value?: unknown }).value;
      if (typeof inner === "string" && inner.trim()) return inner.trim();
      if (typeof inner === "number" && inner > 0) return String(Math.round(inner));
    }
  }
  return null;
}

function readVehicleOwnershipType(v: {
  ownershipType?: string | null;
  fieldProvenance?: unknown;
}): string | null {
  if (typeof v.ownershipType === "string" && v.ownershipType.trim()) {
    return v.ownershipType.trim().toUpperCase();
  }
  const prov = v.fieldProvenance;
  if (!prov || typeof prov !== "object" || Array.isArray(prov)) return null;
  const rec = prov as Record<string, unknown>;
  for (const k of ["ownershipType", "ownershipSource", "source"]) {
    const val = rec[k];
    if (typeof val === "string" && val.trim()) return val.trim().toUpperCase();
    if (val && typeof val === "object" && "value" in val) {
      const inner = (val as { value?: unknown }).value;
      if (typeof inner === "string" && inner.trim()) return inner.trim().toUpperCase();
    }
  }
  return null;
}

function subjectYearSpan(subject: ResolvedIntelSubject): { min: number; max: number } | null {
  let min = subject.yearMin;
  let max = subject.yearMax ?? subject.yearMin;
  if (min == null && max == null) return null;
  if (min == null) min = max;
  if (max == null) max = min;
  return { min: min!, max: max! };
}

export function yearWindowForCohortLevel(
  subject: ResolvedIntelSubject,
  level: 0 | 1 | 2
): { min: number; max: number; deltaYears: number } | null {
  const span = subjectYearSpan(subject);
  if (!span) return null;
  const delta = level === 0 ? 0 : level === 1 ? 1 : 2;
  return {
    min: span.min - delta,
    max: span.max + delta,
    deltaYears: delta,
  };
}

function modelsMatch(model: string | null, target: string): boolean {
  if (!model) return false;
  return model.toLowerCase().includes(target.toLowerCase());
}

type CohortRow = {
  dealerId: string;
  year: number | null;
  yearMin: number | null;
  yearMax: number | null;
  fuel: CanonicalFuelType | null;
  engine: string | null;
  mileage: number | null;
  ownershipHand: number | null;
  ownershipType: string | null;
  b2bPrice: number | null;
  retailPrice: number | null;
  budget: number | null;
  kind: "supply" | "demand";
};

function rowOverlapsYearWindow(
  row: CohortRow,
  window: { min: number; max: number } | null
): boolean {
  if (!window) return true;
  if (row.kind === "demand") {
    const rMin = row.yearMin ?? row.yearMax ?? row.year;
    const rMax = row.yearMax ?? row.yearMin ?? row.year;
    if (rMin == null && rMax == null) return false;
    const aMin = rMin ?? rMax!;
    const aMax = rMax ?? rMin!;
    return aMax >= window.min && aMin <= window.max;
  }
  if (row.year == null) return false;
  return row.year >= window.min && row.year <= window.max;
}

function cohortAtLevel(
  rows: CohortRow[],
  level: 0 | 1 | 2,
  subject: ResolvedIntelSubject,
  yearWindow: { min: number; max: number } | null
): CohortRow[] {
  return rows.filter((r) => {
    if (!rowOverlapsYearWindow(r, yearWindow)) return false;
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

export function supplyDistinctDealers(rows: CohortRow[]): number {
  return distinctDealers(rows.filter((r) => r.kind === "supply"));
}

export function demandDistinctDealers(rows: CohortRow[]): number {
  return distinctDealers(rows.filter((r) => r.kind === "demand"));
}

function sidePassesPrivacy(rows: CohortRow[], min: number, minDealers: number): boolean {
  return rows.length >= min && distinctDealers(rows) >= minDealers;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** API contract: p25/median/p75 are always JSON integers or null (no fractional ₪/km). */
export function asDistributionInt(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n);
}

function cloakCount(count: number, min: number, dealers: number, minDealers: number) {
  if (count < min || dealers < minDealers) {
    return { value: null as number | null, insufficientData: true };
  }
  return { value: count, insufficientData: false };
}

/** Privacy eligibility from contributor rows only — not the full cohort side. */
export function cloakDistribution(
  values: number[],
  contributorRows: Array<{ dealerId: string }>
) {
  const dealers = new Set(contributorRows.map((r) => r.dealerId)).size;
  const minObs = minDistributionObs();
  const minDealers = minDistinctDealers();
  if (values.length < minObs || dealers < minDealers) {
    return { median: null, p25: null, p75: null, insufficientData: true as const };
  }
  const s = [...values].sort((a, b) => a - b);
  const p25 = s[Math.floor(s.length * 0.25)] ?? null;
  const p75 = s[Math.floor(s.length * 0.75)] ?? null;
  return {
    median: asDistributionInt(median(values)),
    p25: asDistributionInt(p25),
    p75: asDistributionInt(p75),
    insufficientData: false as const,
  };
}

export function cloakCategoricalDistribution<T extends { dealerId: string }>(
  rows: T[],
  pick: (r: T) => string | null
) {
  const contributors = rows.filter((r) => pick(r) != null);
  const dealers = new Set(contributors.map((r) => r.dealerId)).size;
  if (contributors.length < minDistributionObs() || dealers < minDistinctDealers()) {
    return { insufficientData: true as const, buckets: null as Record<string, number> | null };
  }
  const counts = new Map<string, number>();
  for (const r of contributors) {
    const k = pick(r);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return {
    insufficientData: false as const,
    buckets: Object.fromEntries(counts) as Record<string, number>,
  };
}

function pickCohort(rows: CohortRow[], subject: ResolvedIntelSubject) {
  const min = minCohort();
  const minDealers = minDistinctDealers();
  for (const level of [0, 1, 2] as const) {
    const yearWindow = yearWindowForCohortLevel(subject, level);
    const cohort = cohortAtLevel(rows, level, subject, yearWindow);
    const dealers = distinctDealers(cohort);
    if (cohort.length >= min && dealers >= minDealers) {
      return {
        cohort,
        level,
        yearWidening: {
          deltaYears: yearWindow?.deltaYears ?? 0,
          level,
        },
        insufficientData: false as const,
      };
    }
  }
  return {
    cohort: [] as CohortRow[],
    level: 2 as const,
    yearWidening: { deltaYears: 2, level: 2 as const },
    insufficientData: true as const,
  };
}

export function marketBalanceLabel(
  supplyCount: number,
  demandCount: number,
  supplyPrivacyOk: boolean,
  demandPrivacyOk: boolean
): MarketBalanceLabel {
  if (!supplyPrivacyOk || !demandPrivacyOk) return "INSUFFICIENT_DATA";
  if (supplyCount === 0 && demandCount === 0) return "INSUFFICIENT_DATA";
  if (supplyCount === 0) return "DEMAND_HEAVY";
  if (demandCount === 0) return "SUPPLY_HEAVY";
  const ratio = demandCount / supplyCount;
  if (ratio >= 1.5) return "DEMAND_HEAVY";
  if (supplyCount / demandCount >= 1.5) return "SUPPLY_HEAVY";
  return "BALANCED";
}

/**
 * Trade risk is NOT the inverse of demand scarcity.
 * Strong demand + scarce supply → easier to move → LOW/MODERATE, never ELEVATED.
 * Elevated only from supply-heavy markets, weak demand, expensive acquisition, etc.
 */
export function tradeRiskLabel(input: {
  supplyCount: number;
  demandCount: number;
  supplyPrivacyOk: boolean;
  demandPrivacyOk: boolean;
  offeredPrice?: number | null;
  b2bMedian?: number | null;
  b2bPrivacyOk?: boolean;
}): "ELEVATED" | "MODERATE" | "LOW" | "UNKNOWN" {
  if (!input.supplyPrivacyOk || !input.demandPrivacyOk) return "UNKNOWN";
  if (input.supplyCount === 0 && input.demandCount === 0) return "UNKNOWN";

  let score = 0;
  // Supply-heavy / weak demand raises risk
  if (input.demandCount === 0 && input.supplyCount > 0) score += 2;
  else if (
    input.demandCount > 0 &&
    input.supplyCount >= input.demandCount * 1.5
  ) {
    score += input.supplyCount >= input.demandCount * 2.5 ? 2 : 1;
  }

  // Demand-heavy / scarce supply lowers acquisition/resale risk — never elevates
  if (input.supplyCount === 0 && input.demandCount > 0) score -= 1;
  else if (input.demandCount >= input.supplyCount * 1.5 && input.supplyCount > 0) score -= 1;

  if (
    input.b2bPrivacyOk &&
    input.offeredPrice != null &&
    input.offeredPrice > 0 &&
    input.b2bMedian != null &&
    input.b2bMedian > 0
  ) {
    const delta = (input.offeredPrice - input.b2bMedian) / input.b2bMedian;
    if (delta >= 0.08) score += 2;
    else if (delta <= -0.08) score -= 1;
  }

  if (score >= 2) return "ELEVATED";
  if (score >= 1) return "MODERATE";
  if (score <= -1) return "LOW";
  return "LOW";
}

function liquidityLabel(supplyCount: number, demandCount: number): string {
  if (supplyCount >= 8 && demandCount >= 5) return "HIGH";
  if (supplyCount >= minCohort() && demandCount >= minCohort()) return "MODERATE";
  if (supplyCount > 0 || demandCount > 0) return "THIN";
  return "UNKNOWN";
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

function priceDistributionBlock(
  dist: ReturnType<typeof cloakDistribution>,
  priceFamily: string
) {
  return {
    p25: dist.p25,
    median: dist.median,
    p75: dist.p75,
    insufficientData: dist.insufficientData,
    priceFamily,
  };
}

export async function resolveExchangeIntelSubject(
  dealerId: string,
  subject: ExchangeIntelSubject
): Promise<
  | { ok: true; subject: ResolvedIntelSubject }
  | { ok: false; error: "subject_unresolved"; reason: "make_model_unresolved" | "not_found" }
> {
  if ("vehicleId" in subject && subject.vehicleId) {
    const v = await prisma.vehicle.findFirst({
      where: { id: subject.vehicleId, dealerId },
    });
    if (!v) return { ok: false, error: "subject_unresolved", reason: "not_found" };
    if (!v?.make || !v.model) {
      return { ok: false, error: "subject_unresolved", reason: "make_model_unresolved" };
    }
    const id = canonicalizeMake(v.make);
    const model = canonicalizeModel(v.model);
    if (!id || !model) {
      return { ok: false, error: "subject_unresolved", reason: "make_model_unresolved" };
    }
    return {
      ok: true,
      subject: {
        make: id,
        model,
        yearMin: v.year,
        yearMax: v.year,
        fuel: readVehicleFuel(v as MatchVehicleInput),
        engineHint: null,
        vehicleId: v.id,
      },
    };
  }
  if ("demandId" in subject && subject.demandId) {
    const d = await prisma.demand.findFirst({
      where: { id: subject.demandId, dealerId },
      include: { constraints: true },
    });
    if (!d?.confirmedJson) {
      return { ok: false, error: "subject_unresolved", reason: "not_found" };
    }
    const j = d.confirmedJson as Record<string, unknown>;
    const make = canonicalizeMake(typeof j.make === "string" ? j.make : null);
    const model = canonicalizeModel(typeof j.model === "string" ? j.model : null);
    if (!make || !model) {
      try {
        const { structuredIntent } = legacyToSearchIntent(d.confirmedJson, d.constraints);
        const u = structuredIntent.vehicleUniverse as { make?: string; model?: string } | undefined;
        const m2 = canonicalizeMake(u?.make ?? null);
        const mod2 = canonicalizeModel(u?.model ?? null);
        if (!m2 || !mod2) {
          return {
            ok: false,
            error: "subject_unresolved",
            reason: "make_model_unresolved",
          };
        }
        return {
          ok: true,
          subject: {
            make: m2,
            model: mod2,
            yearMin: typeof j.yearMin === "number" ? j.yearMin : null,
            yearMax: typeof j.yearMax === "number" ? j.yearMax : null,
            fuel: canonicalizeFuelType(typeof j.fuel === "string" ? j.fuel : null),
            engineHint: null,
            demandId: d.id,
          },
        };
      } catch {
        return { ok: false, error: "subject_unresolved", reason: "make_model_unresolved" };
      }
    }
    return {
      ok: true,
      subject: {
        make,
        model,
        yearMin: typeof j.yearMin === "number" ? j.yearMin : null,
        yearMax: typeof j.yearMax === "number" ? j.yearMax : null,
        fuel: canonicalizeFuelType(typeof j.fuel === "string" ? j.fuel : null),
        engineHint: null,
        demandId: d.id,
      },
    };
  }
  if (!("make" in subject) || !("model" in subject)) {
    return { ok: false, error: "subject_unresolved", reason: "make_model_unresolved" };
  }
  const make = canonicalizeMake(subject.make);
  const model = canonicalizeModel(subject.model);
  if (!make || !model) {
    return { ok: false, error: "subject_unresolved", reason: "make_model_unresolved" };
  }
  return {
    ok: true,
    subject: {
      make,
      model,
      yearMin: subject.yearMin ?? null,
      yearMax: subject.yearMax ?? null,
      fuel: canonicalizeFuelType(subject.fuel ?? null),
      engineHint: subject.engine ?? null,
    },
  };
}

async function loadNetworkRows(
  dealerId: string,
  subject: ResolvedIntelSubject
): Promise<CohortRow[]> {
  const allowSynthetic = await dealerAllowsSyntheticMarket(dealerId);
  const [supplies, demands] = await Promise.all([
    prisma.vehicle.findMany({
      where: networkSupplyWhere(dealerId, allowSynthetic),
      select: {
        dealerId: true,
        make: true,
        model: true,
        year: true,
        mileage: true,
        ownershipHand: true,
        ownershipType: true,
        b2bPrice: true,
        retailPrice: true,
        fieldProvenance: true,
      },
      take: 1200,
    }),
    prisma.demand.findMany({
      where: networkDemandWhere(dealerId, allowSynthetic),
      select: { dealerId: true, confirmedJson: true, constraints: true },
      take: 1200,
    }),
  ]);

  const rows: CohortRow[] = [];
  for (const v of supplies) {
    const mk = canonicalizeMake(v.make);
    const md = canonicalizeModel(v.model);
    if (!mk || !md || mk !== subject.make || !modelsMatch(md, subject.model)) continue;
    const fuel = readVehicleFuel(v as MatchVehicleInput);
    rows.push({
      dealerId: v.dealerId,
      year: v.year,
      yearMin: v.year,
      yearMax: v.year,
      fuel,
      engine: readVehicleEngine(v),
      mileage: v.mileage,
      ownershipHand: v.ownershipHand,
      ownershipType: readVehicleOwnershipType(v),
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
      yearMin,
      yearMax,
      fuel: canonicalizeFuelType(typeof j.fuel === "string" ? j.fuel : null),
      engine: typeof j.engine === "string" ? j.engine : null,
      mileage: null,
      ownershipHand: null,
      ownershipType: null,
      b2bPrice: null,
      retailPrice: null,
      budget: budgetFromConfirmed(d.confirmedJson),
      kind: "demand",
    });
  }
  return rows;
}

export async function runExchangeIntelligenceEngine(input: {
  dealerId: string;
  action: ExchangeIntelAction;
  subject: ExchangeIntelSubject;
  offeredPrice?: number | null;
  /** When false, omit customer phone from MATCH_MY_CUSTOMERS (agent safety). */
  includeCustomerPhone?: boolean;
}) {
  const resolvedWrap = await resolveExchangeIntelSubject(
    input.dealerId,
    input.subject
  );
  if (!resolvedWrap.ok) {
    return {
      ok: false as const,
      error: resolvedWrap.error,
      reason: resolvedWrap.reason,
    };
  }
  const resolved = resolvedWrap.subject;

  const rows = await loadNetworkRows(input.dealerId, resolved);
  const picked = pickCohort(rows, resolved);
  const supplyRows = picked.cohort.filter((r) => r.kind === "supply");
  const demandRows = picked.cohort.filter((r) => r.kind === "demand");
  const min = minCohort();
  const minDealers = minDistinctDealers();

  const supplyDealers = supplyDistinctDealers(supplyRows);
  const demandDealers = demandDistinctDealers(demandRows);
  const supplyPrivacyOk = sidePassesPrivacy(supplyRows, min, minDealers);
  const demandPrivacyOk = sidePassesPrivacy(demandRows, min, minDealers);
  const bothSidesPrivacyOk = supplyPrivacyOk && demandPrivacyOk;

  const supplyCloak = cloakCount(
    supplyRows.length,
    min,
    supplyDealers,
    minDealers
  );
  const demandCloak = cloakCount(
    demandRows.length,
    min,
    demandDealers,
    minDealers
  );

  const b2bContributors = supplyRows.filter(
    (r) => r.b2bPrice != null && r.b2bPrice > 0
  );
  const retailContributors = supplyRows.filter(
    (r) => r.retailPrice != null && r.retailPrice > 0
  );
  const mileageContributors = supplyRows.filter(
    (r) => r.mileage != null && r.mileage >= 0
  );
  const budgetContributors = demandRows.filter(
    (r) => r.budget != null && r.budget > 0
  );

  const b2bPrices = b2bContributors.map((r) => r.b2bPrice!);
  const retailPrices = retailContributors.map((r) => r.retailPrice!);
  const mileages = mileageContributors.map((r) => r.mileage!);
  const buyerBudgets = budgetContributors.map((r) => r.budget!);

  const supplyB2B = cloakDistribution(b2bPrices, b2bContributors);
  const supplyRetail = cloakDistribution(retailPrices, retailContributors);
  const supplyMileage = cloakDistribution(mileages, mileageContributors);
  const buyerBudget = cloakDistribution(buyerBudgets, budgetContributors);

  const supplyFuelDist = cloakCategoricalDistribution(supplyRows, (r) => r.fuel);
  const supplyHandDist = cloakCategoricalDistribution(supplyRows, (r) =>
    r.ownershipHand != null ? String(r.ownershipHand) : null
  );
  const supplyEngineDist = cloakCategoricalDistribution(supplyRows, (r) => r.engine);
  const supplyOwnershipDist = cloakCategoricalDistribution(
    supplyRows,
    (r) => r.ownershipType
  );

  const base = {
    ok: true as const,
    action: input.action,
    subject: resolved,
    cohortLevel: picked.level,
    yearWidening: picked.yearWidening,
    insufficientData: picked.insufficientData,
    supplyDistinctDealers: supplyPrivacyOk ? supplyDealers : null,
    demandDistinctDealers: demandPrivacyOk ? demandDealers : null,
  };

  const subjectType =
    resolved.vehicleId != null
      ? "vehicle"
      : resolved.demandId != null
        ? "demand"
        : "make_model";

  void logEvent({
    eventType: "intelligence.engine_run",
    dealerId: input.dealerId,
    metadata: {
      action: input.action,
      subjectType,
      cohortLevel: picked.level,
      insufficientData: picked.insufficientData,
    },
  }).catch(() => undefined);

  const sc = supplyCloak.insufficientData ? 0 : supplyRows.length;
  const dc = demandCloak.insufficientData ? 0 : demandRows.length;

  if (input.action === "MATCH_MY_CUSTOMERS") {
    const priv = resolved.vehicleId
      ? await matchPrivateVehicleToMyDemands({
          dealerId: input.dealerId,
          vehicleId: resolved.vehicleId,
        })
      : await matchPrivateSubjectToMyDemands({
          dealerId: input.dealerId,
          make: resolved.make,
          model: resolved.model,
          yearMin: resolved.yearMin,
          yearMax: resolved.yearMax,
          fuel: resolved.fuel,
          engine: resolved.engineHint,
        });
    if (!priv.ok) {
      if (priv.error === "subject_unresolved") {
        return {
          ok: false as const,
          error: "subject_unresolved" as const,
          reason: "make_model_unresolved" as const,
        };
      }
      return { ok: false as const, error: "not_found" as const };
    }
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
    const askingB2B = priceDistributionBlock(
      supplyB2B,
      "SUPPLY_ASKING_PRICE_B2B"
    );
    if (input.offeredPrice == null || input.offeredPrice <= 0) {
      return {
        ...base,
        needsOfferedPrice: true,
        askingB2B,
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
      offeredPrice: input.offeredPrice,
      askingB2B,
      verdict,
    };
  }

  if (input.action === "CHECK_LIQUIDITY") {
    const label = !bothSidesPrivacyOk
      ? "UNKNOWN"
      : liquidityLabel(sc, dc);
    return {
      ...base,
      evidence: {
        supplyObservations: supplyCloak.insufficientData ? null : sc,
        demandObservations: demandCloak.insufficientData ? null : dc,
        supplyDistinctDealers: supplyPrivacyOk ? supplyDealers : null,
        demandDistinctDealers: demandPrivacyOk ? demandDealers : null,
      },
      label,
    };
  }

  if (input.action === "CHECK_TRADE_RISK") {
    const label = tradeRiskLabel({
      supplyCount: sc,
      demandCount: dc,
      supplyPrivacyOk,
      demandPrivacyOk,
      offeredPrice: input.offeredPrice,
      b2bMedian: supplyB2B.median,
      b2bPrivacyOk: !supplyB2B.insufficientData,
    });
    return {
      ...base,
      evidence: {
        supplyObservations: supplyCloak.insufficientData ? null : sc,
        demandObservations: demandCloak.insufficientData ? null : dc,
        demandSupplyRatio:
          sc > 0 && bothSidesPrivacyOk
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
      buyerBudget: priceDistributionBlock(buyerBudget, "BUYER_BUDGET"),
    };
  }

  if (input.action === "CHECK_SUPPLY") {
    return {
      ...base,
      supply: {
        activeCount: supplyCloak.value,
        insufficientData: supplyCloak.insufficientData,
      },
      askingB2B: priceDistributionBlock(supplyB2B, "SUPPLY_ASKING_PRICE_B2B"),
      askingRetail: priceDistributionBlock(
        supplyRetail,
        "SUPPLY_ASKING_PRICE_RETAIL"
      ),
      mileage: priceDistributionBlock(supplyMileage, "SUPPLY_MILEAGE"),
      fuelDistribution: supplyFuelDist,
      handDistribution: supplyHandDist,
      engineDistribution: supplyEngineDist,
      ownershipDistribution: supplyOwnershipDist,
    };
  }

  if (input.action === "COMPARE_SIMILAR") {
    return {
      ...base,
      comparison: {
        supplyCount: supplyCloak.value,
        demandCount: demandCloak.value,
        askingB2B: priceDistributionBlock(supplyB2B, "SUPPLY_ASKING_PRICE_B2B"),
        askingRetail: priceDistributionBlock(
          supplyRetail,
          "SUPPLY_ASKING_PRICE_RETAIL"
        ),
        buyerBudget: priceDistributionBlock(buyerBudget, "BUYER_BUDGET"),
        insufficientData: picked.insufficientData,
      },
    };
  }

  const marketBalance = marketBalanceLabel(
    sc,
    dc,
    supplyPrivacyOk,
    demandPrivacyOk
  );

  return {
    ...base,
    overview: {
      cohortLevel: picked.level,
      yearWidening: picked.yearWidening,
      demand: {
        activeCount: demandCloak.value,
        insufficientData: demandCloak.insufficientData,
      },
      supply: {
        activeCount: supplyCloak.value,
        insufficientData: supplyCloak.insufficientData,
      },
      buyerBudget: priceDistributionBlock(buyerBudget, "BUYER_BUDGET"),
      askingB2B: priceDistributionBlock(supplyB2B, "SUPPLY_ASKING_PRICE_B2B"),
      askingRetail: priceDistributionBlock(
        supplyRetail,
        "SUPPLY_ASKING_PRICE_RETAIL"
      ),
      mileage: priceDistributionBlock(supplyMileage, "SUPPLY_MILEAGE"),
      fuelDistribution: supplyFuelDist,
      handDistribution: supplyHandDist,
      engineDistribution: supplyEngineDist,
      ownershipDistribution: supplyOwnershipDist,
      marketBalance,
      liquidity: !bothSidesPrivacyOk ? "UNKNOWN" : liquidityLabel(sc, dc),
      tradeRisk: tradeRiskLabel({
        supplyCount: sc,
        demandCount: dc,
        supplyPrivacyOk,
        demandPrivacyOk,
        offeredPrice: input.offeredPrice,
        b2bMedian: supplyB2B.median,
        b2bPrivacyOk: !supplyB2B.insufficientData,
      }),
    },
  };
}

export { minCohort, minDistinctDealers, cloakCount, liquidityLabel };

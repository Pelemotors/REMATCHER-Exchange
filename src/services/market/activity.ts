import "server-only";
import { prisma } from "@/lib/prisma";
import {
  loadDealerMarketSide,
  marketSideFromDealerRow,
  marketsCompatible,
} from "@/services/dealer/market-scope";
import {
  modelsMatch,
  resolveExchangeIntelSubject,
  runExchangeIntelligenceEngine,
  yearWindowForCohortLevel,
  type ExchangeIntelSubject,
  type ResolvedIntelSubject,
} from "@/services/exchange-intelligence/engine";
import {
  canonicalizeMake,
  canonicalizeModel,
} from "@/services/exchange/vehicle-identity";
import { matchPrivateVehicleToMyDemands } from "@/services/matching/private-matching";
import {
  computeMarketability,
  computePricePosition,
  type MarketabilityResult,
} from "@/services/market/marketability";
import {
  MARKET_ACTIVITY_COPY,
  matchLookbackDays,
  minCohortObservations,
  minDistinctDealers,
  type DataCoverage,
  type PricePositionBand,
} from "@/services/market/thresholds";

export type MarketActivityVehicleRef = {
  id?: string;
  make: string | null;
  model: string | null;
  year: number | null;
  trim?: string | null;
};

export type CloakedCount = {
  count: number | null;
  insufficientData: boolean;
  lookbackDays?: number;
};

export type ComparablePriceRange = {
  low: number | null;
  high: number | null;
  median: number | null;
  insufficientData: boolean;
  priceFamily: "SUPPLY_ASKING_PRICE_B2B";
  copy: string | null;
};

export type MarketActivitySnapshot = {
  subject: MarketActivityVehicleRef;
  generatedAt: string;
  dataCoverage: DataCoverage;
  coverageCopy: string | null;
  supply: CloakedCount;
  demand: CloakedCount;
  matches: CloakedCount;
  interest: CloakedCount;
  reveals: CloakedCount;
  pricePosition: {
    band: PricePositionBand;
    semantic: "network_asking_b2b";
    subjectPrice: number | null;
    rangeLow: number | null;
    rangeHigh: number | null;
  };
  comparablePriceRange: ComparablePriceRange;
  marketability: MarketabilityResult;
  customerMatches: {
    count: number;
    scope: "dealer_local";
  };
  cohort: {
    make: string;
    model: string;
    yearMin: number | null;
    yearMax: number | null;
    fuel: string | null;
    source: "exchange-intelligence/engine";
    dimensions: string[];
  };
};

function cloakActivityCount(count: number, dealers: number): CloakedCount {
  const min = minCohortObservations();
  const minDealers = minDistinctDealers();
  if (count < min || dealers < minDealers) {
    return { count: null, insufficientData: true, lookbackDays: matchLookbackDays() };
  }
  return { count, insufficientData: false, lookbackDays: matchLookbackDays() };
}

function yearInWindow(
  year: number | null | undefined,
  yearMin: number | null,
  yearMax: number | null
): boolean {
  if (yearMin == null && yearMax == null) return true;
  if (year == null) return true;
  if (yearMin != null && year < yearMin) return false;
  if (yearMax != null && year > yearMax) return false;
  return true;
}

function vehicleInCohort(
  vehicle: { make: string | null; model: string | null; year: number | null },
  subject: ResolvedIntelSubject,
  yearMin: number | null,
  yearMax: number | null
): boolean {
  const make = canonicalizeMake(vehicle.make);
  const model = canonicalizeModel(vehicle.model);
  if (!make || !model || make !== subject.make || !modelsMatch(model, subject.model)) {
    return false;
  }
  return yearInWindow(vehicle.year, yearMin, yearMax);
}

async function countCohortEvents(input: {
  dealerId: string;
  subject: ResolvedIntelSubject;
  yearMin: number | null;
  yearMax: number | null;
}): Promise<{
  matches: CloakedCount;
  interest: CloakedCount;
  reveals: CloakedCount;
}> {
  const requester = await loadDealerMarketSide(input.dealerId);
  const since = new Date(Date.now() - matchLookbackDays() * 86_400_000);
  const dealerSelect = {
    marketMode: true,
    canAccessSyntheticMarket: true,
  } as const;
  const vehicleSelect = {
    make: true,
    model: true,
    year: true,
    dealerId: true,
    dealer: { select: dealerSelect },
  } as const;

  const [matchRows, interestRows, revealRows] = await Promise.all([
    prisma.candidateMatch.findMany({
      where: { createdAt: { gte: since } },
      take: 800,
      select: {
        vehicle: { select: vehicleSelect },
      },
    }),
    prisma.buyerInterest.findMany({
      where: { status: "INTERESTED", createdAt: { gte: since } },
      take: 800,
      select: {
        candidateMatch: {
          select: { vehicle: { select: vehicleSelect } },
        },
      },
    }),
    prisma.reveal.findMany({
      where: { revealedAt: { gte: since }, candidateMatchId: { not: null } },
      take: 400,
      select: { candidateMatchId: true },
    }),
  ]);

  const keep = (
    vehicle:
      | {
          make: string | null;
          model: string | null;
          year: number | null;
          dealerId: string;
          dealer: { marketMode: "REAL" | "SYNTHETIC"; canAccessSyntheticMarket: boolean };
        }
      | null
      | undefined
  ) => {
    if (!vehicle) return false;
    if (!marketsCompatible(requester, marketSideFromDealerRow(vehicle.dealer))) {
      return false;
    }
    return vehicleInCohort(vehicle, input.subject, input.yearMin, input.yearMax);
  };

  const revealMatchIds = revealRows
    .map((row) => row.candidateMatchId)
    .filter((id): id is string => Boolean(id));
  const revealMatches = revealMatchIds.length
    ? await prisma.candidateMatch.findMany({
        where: { id: { in: revealMatchIds } },
        select: { vehicle: { select: vehicleSelect } },
      })
    : [];

  const matchKept = matchRows.filter((row) => keep(row.vehicle));
  const interestKept = interestRows.filter((row) => keep(row.candidateMatch.vehicle));
  const revealKept = revealMatches.filter((row) => keep(row.vehicle));

  return {
    matches: cloakActivityCount(
      matchKept.length,
      new Set(matchKept.map((row) => row.vehicle.dealerId)).size
    ),
    interest: cloakActivityCount(
      interestKept.length,
      new Set(interestKept.map((row) => row.candidateMatch.vehicle.dealerId)).size
    ),
    reveals: cloakActivityCount(
      revealKept.length,
      new Set(revealKept.map((row) => row.vehicle.dealerId)).size
    ),
  };
}

function emptyActivity(
  subject: MarketActivityVehicleRef,
  resolved: ResolvedIntelSubject | null
): MarketActivitySnapshot {
  const marketability = computeMarketability({
    supplyCount: null,
    demandCount: null,
    supplyCoverageOk: false,
    demandCoverageOk: false,
    matchCount30d: null,
    customerMatchCount: 0,
  });
  return {
    subject,
    generatedAt: new Date().toISOString(),
    dataCoverage: "INSUFFICIENT",
    coverageCopy: MARKET_ACTIVITY_COPY.insufficient,
    supply: { count: null, insufficientData: true },
    demand: { count: null, insufficientData: true },
    matches: { count: null, insufficientData: true, lookbackDays: matchLookbackDays() },
    interest: { count: null, insufficientData: true, lookbackDays: matchLookbackDays() },
    reveals: { count: null, insufficientData: true, lookbackDays: matchLookbackDays() },
    pricePosition: {
      band: "UNKNOWN",
      semantic: "network_asking_b2b",
      subjectPrice: null,
      rangeLow: null,
      rangeHigh: null,
    },
    comparablePriceRange: {
      low: null,
      high: null,
      median: null,
      insufficientData: true,
      priceFamily: "SUPPLY_ASKING_PRICE_B2B",
      copy: MARKET_ACTIVITY_COPY.insufficientPriceRange,
    },
    marketability,
    customerMatches: { count: 0, scope: "dealer_local" },
    cohort: {
      make: resolved?.make ?? subject.make ?? "",
      model: resolved?.model ?? subject.model ?? "",
      yearMin: resolved?.yearMin ?? subject.year,
      yearMax: resolved?.yearMax ?? subject.year,
      fuel: resolved?.fuel ?? null,
      source: "exchange-intelligence/engine",
      dimensions: ["canonical_make", "canonical_model", "year_window", "fuel_family"],
    },
  };
}

export async function collectMarketActivity(input: {
  dealerId: string;
  subject: ExchangeIntelSubject;
  subjectPrice?: number | null;
  vehicleRef?: MarketActivityVehicleRef;
}): Promise<MarketActivitySnapshot> {
  const resolvedWrap = await resolveExchangeIntelSubject(
    input.dealerId,
    input.subject
  );
  const fallbackRef: MarketActivityVehicleRef = input.vehicleRef ?? {
    id: "vehicleId" in input.subject ? input.subject.vehicleId : undefined,
    make: "",
    model: "",
    year: null,
  };
  if (!resolvedWrap.ok) {
    return emptyActivity(fallbackRef, null);
  }
  const resolved = resolvedWrap.subject;
  const subjectRef: MarketActivityVehicleRef = {
    id: resolved.vehicleId ?? fallbackRef.id,
    make: resolved.make,
    model: resolved.model,
    year: resolved.yearMin ?? resolved.yearMax,
    trim: fallbackRef.trim ?? null,
  };

  const intel = await runExchangeIntelligenceEngine({
    dealerId: input.dealerId,
    action: "MARKET_OVERVIEW",
    subject: input.subject,
    includeCustomerPhone: false,
  });

  if (!intel.ok || !("overview" in intel) || !intel.overview) {
    return emptyActivity(subjectRef, resolved);
  }

  const overview = intel.overview;
  const supplyCount = overview.supply.insufficientData
    ? null
    : overview.supply.activeCount;
  const demandCount = overview.demand.insufficientData
    ? null
    : overview.demand.activeCount;
  const supplyCoverageOk = !overview.supply.insufficientData && supplyCount != null;
  const demandCoverageOk = !overview.demand.insufficientData && demandCount != null;

  const asking = overview.askingB2B;
  const comparable: ComparablePriceRange = {
    low: asking.insufficientData ? null : asking.p25,
    high: asking.insufficientData ? null : asking.p75,
    median: asking.insufficientData ? null : asking.median,
    insufficientData: asking.insufficientData,
    priceFamily: "SUPPLY_ASKING_PRICE_B2B",
    copy: asking.insufficientData
      ? MARKET_ACTIVITY_COPY.insufficientPriceRange
      : null,
  };

  const cohortLevel =
    intel.cohortLevel === 1 || intel.cohortLevel === 2 ? intel.cohortLevel : 0;
  const yearWindow = yearWindowForCohortLevel(resolved, cohortLevel);
  const events = await countCohortEvents({
    dealerId: input.dealerId,
    subject: resolved,
    yearMin: yearWindow?.min ?? resolved.yearMin,
    yearMax: yearWindow?.max ?? resolved.yearMax,
  });

  let customerCount = 0;
  if (resolved.vehicleId) {
    const priv = await matchPrivateVehicleToMyDemands({
      dealerId: input.dealerId,
      vehicleId: resolved.vehicleId,
    });
    if (priv.ok) customerCount = priv.matchCount;
  }

  const marketability = computeMarketability({
    supplyCount,
    demandCount,
    supplyCoverageOk,
    demandCoverageOk,
    matchCount30d: events.matches.insufficientData ? null : events.matches.count,
    customerMatchCount: customerCount,
  });

  const dataCoverage = marketability.coverage;
  return {
    subject: subjectRef,
    generatedAt: new Date().toISOString(),
    dataCoverage,
    coverageCopy:
      dataCoverage === "SUFFICIENT" ? null : MARKET_ACTIVITY_COPY.insufficient,
    supply: {
      count: supplyCount,
      insufficientData: !supplyCoverageOk,
    },
    demand: {
      count: demandCount,
      insufficientData: !demandCoverageOk,
    },
    matches: events.matches,
    interest: events.interest,
    reveals: events.reveals,
    pricePosition: computePricePosition({
      subjectPrice: input.subjectPrice ?? null,
      rangeLow: comparable.low,
      rangeHigh: comparable.high,
    }),
    comparablePriceRange: comparable,
    marketability,
    customerMatches: { count: customerCount, scope: "dealer_local" },
    cohort: {
      make: resolved.make,
      model: resolved.model,
      yearMin: yearWindow?.min ?? resolved.yearMin,
      yearMax: yearWindow?.max ?? resolved.yearMax,
      fuel: resolved.fuel,
      source: "exchange-intelligence/engine",
      dimensions: ["canonical_make", "canonical_model", "year_window", "fuel_family"],
    },
  };
}

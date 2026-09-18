/**
 * Canonical Backend↔Swift contract shapes.
 * Fixtures under tests/fixtures/contracts/ MUST match these keys/types.
 * Mobile docs/contracts/ validates the same nested shapes.
 */
export const MARKET_OVERVIEW_OVERVIEW_KEYS = [
  "cohortLevel",
  "yearWidening",
  "demand",
  "supply",
  "buyerBudget",
  "askingB2B",
  "askingRetail",
  "mileage",
  "fuelDistribution",
  "handDistribution",
  "engineDistribution",
  "ownershipDistribution",
  "marketBalance",
  "liquidity",
  "tradeRisk",
] as const;

export const PRICE_DISTRIBUTION_KEYS = [
  "p25",
  "median",
  "p75",
  "insufficientData",
  "priceFamily",
] as const;

export const CATEGORICAL_DISTRIBUTION_KEYS = [
  "insufficientData",
  "buckets",
] as const;

export const CUSTOMER_HINT_KEYS = [
  "name",
  "confirmedPhone",
  "phoneCandidates",
  "requiresPhoneConfirmation",
] as const;

export const INTAKE_CANDIDATE_SUBJECT_KEYS = [
  "id",
  "make",
  "model",
  "year",
  "fuel",
  "engine",
  "trim",
  "offeredPrice",
  "askingPrice",
  "confidenceBand",
  "govIdentity",
] as const;

/** Example MARKET_OVERVIEW payload matching runExchangeIntelligenceEngine serializer. */
export function buildMarketOverviewContractFixture() {
  return {
    ok: true,
    action: "MARKET_OVERVIEW" as const,
    cohortLevel: 1,
    yearWidening: { deltaYears: 1, level: 1 },
    overview: {
      cohortLevel: 1,
      yearWidening: { deltaYears: 1, level: 1 },
      demand: { activeCount: 14, insufficientData: false },
      supply: { activeCount: 9, insufficientData: false },
      buyerBudget: {
        p25: 105000,
        median: 112000,
        p75: 118000,
        insufficientData: false,
        priceFamily: "BUYER_BUDGET",
      },
      askingB2B: {
        p25: 119000,
        median: 123000,
        p75: 128000,
        insufficientData: false,
        priceFamily: "SUPPLY_ASKING_PRICE_B2B",
      },
      askingRetail: {
        p25: 132000,
        median: 139000,
        p75: 145000,
        insufficientData: false,
        priceFamily: "SUPPLY_ASKING_PRICE_RETAIL",
      },
      mileage: {
        p25: 42000,
        median: 58000,
        p75: 72000,
        insufficientData: false,
        priceFamily: "SUPPLY_MILEAGE",
      },
      fuelDistribution: {
        insufficientData: false,
        buckets: { GASOLINE: 5, DIESEL: 3, HYBRID: 1 },
      },
      handDistribution: {
        insufficientData: false,
        buckets: { "1": 6, "2": 2 },
      },
      engineDistribution: {
        insufficientData: false,
        buckets: { "1600": 4, "2000": 3 },
      },
      ownershipDistribution: {
        insufficientData: true,
        buckets: null,
      },
      marketBalance: "DEMAND_HEAVY",
      liquidity: "MODERATE",
      tradeRisk: "LOW",
    },
  };
}

export function buildIntakeDemandDraftAmbiguousPhoneFixture() {
  return {
    demandDraft: {
      rawText:
        "[16.9.2026, 17:46:12] לקוח: היי מחפש מאזדה CX5 2022\n[16.9.2026, 17:47:01] לקוח: עד 130 אלף תתקשר 050-9876543",
      summaryHe: "Mazda CX-5 2022 עד ₪130,000",
      status: "PENDING_DEALER_CONFIRM",
      customerHint: {
        name: null as string | null,
        confirmedPhone: null as string | null,
        requiresPhoneConfirmation: true,
        phoneCandidates: [
          {
            raw: "050-9876543",
            normalized: "0509876543",
            attribution: "MESSAGE_BODY",
            confidence: "medium",
          },
        ],
      },
      parsed: {
        make: "Mazda",
        model: "CX-5",
        yearMin: 2022,
        budgetMax: 130000,
      },
    },
  };
}

export function buildIntakeCandidateSubjectFixture() {
  return {
    id: "cand_fixture_1",
    make: "Hyundai",
    model: "Tucson",
    year: 2022,
    fuel: "GASOLINE",
    engine: "1600",
    trim: "Luxury",
    offeredPrice: 125000,
    askingPrice: 125000,
    confidenceBand: "HIGH",
    govIdentity: {
      make: "Hyundai",
      model: "Tucson",
      year: 2022,
      fuel: "GASOLINE",
      engine: "1600",
      trim: "Luxury",
    },
  };
}

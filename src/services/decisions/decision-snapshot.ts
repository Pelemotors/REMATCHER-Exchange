import "server-only";
import { prisma } from "@/lib/prisma";
import {
  getDecisionForVehicle,
  type VehicleDecisionView,
} from "@/services/decisions/vehicle-decision";
import {
  collectMarketActivity,
  type MarketActivitySnapshot,
} from "@/services/market/activity";
import type { DataCoverage } from "@/services/market/thresholds";
import { isOwnedInventoryRelationship } from "@/services/vehicles/vehicle-capabilities";

export type SnapshotVehicle = {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
};

export type PurchaseDecisionSnapshot = {
  decisionId: string;
  vehicle: SnapshotVehicle;
  incomingAskPrice: number | null;
  marketActivity: MarketActivitySnapshot;
  comparablePriceRange: MarketActivitySnapshot["comparablePriceRange"];
  pricePosition: MarketActivitySnapshot["pricePosition"];
  matchingCustomers: { count: number; scope: "dealer_local" };
  marketability: MarketActivitySnapshot["marketability"];
  missingInformation: string[];
  generatedAt: string;
};

export type TradeSideSnapshot = {
  vehicle: SnapshotVehicle | null;
  tradeAllowance?: number | null;
  agreedSalePrice?: number | null;
  currentAskingB2B?: number | null;
  currentAskingRetail?: number | null;
  daysInDealerInventory?: number | null;
  marketActivity: MarketActivitySnapshot | null;
  pricePosition?: MarketActivitySnapshot["pricePosition"];
  matchingCustomers: { count: number; scope: "dealer_local" };
  marketability: MarketActivitySnapshot["marketability"] | null;
};

export type TradeComparisonFact = {
  key:
    | "outgoing_more_demanded"
    | "incoming_more_demanded"
    | "incoming_more_supply_less_demand"
    | "outgoing_more_supply_less_demand"
    | "incoming_has_matching_customers"
    | "outgoing_has_matching_customers"
    | "similar_marketability";
  supported: boolean;
  text: string;
};

export type TradeDecisionSnapshot = {
  decisionId: string;
  incoming: TradeSideSnapshot;
  outgoing: TradeSideSnapshot;
  comparison: {
    coverage: DataCoverage;
    facts: TradeComparisonFact[];
  };
  financial: {
    incomingAgreedPrice: number | null;
    outgoingAgreedPrice: number | null;
    customerCashDifference: number | null;
    outgoingAgreedPriceMissing: boolean;
    cashDifferenceSemantic: "outgoing_agreed_minus_incoming_agreed";
  };
  missingInformation: string[];
  generatedAt: string;
};

export type DecisionSnapshotResult =
  | {
      ok: true;
      workspaceActive: false;
      reason: "decision_terminal" | "not_found";
      decision: VehicleDecisionView | null;
      generatedAt: string;
    }
  | {
      ok: true;
      workspaceActive: true;
      kind: "PURCHASE";
      decision: VehicleDecisionView;
      purchase: PurchaseDecisionSnapshot;
      trade: null;
      generatedAt: string;
    }
  | {
      ok: true;
      workspaceActive: true;
      kind: "TRADE";
      decision: VehicleDecisionView;
      purchase: null;
      trade: TradeDecisionSnapshot;
      generatedAt: string;
    };

function snapshotVehicle(row: {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
}): SnapshotVehicle {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    year: row.year,
    trim: row.trim,
  };
}

function daysSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

function purchaseMissing(input: {
  incomingAskPrice: number | null;
  coverage: DataCoverage;
}): string[] {
  const missing: string[] = [];
  if (input.incomingAskPrice == null) missing.push("incomingAskPrice");
  if (input.coverage !== "SUFFICIENT") missing.push("market_sample");
  return missing;
}

function tradeComparison(
  incoming: MarketActivitySnapshot | null,
  outgoing: MarketActivitySnapshot | null
): TradeDecisionSnapshot["comparison"] {
  const facts: TradeComparisonFact[] = [];
  const both =
    incoming != null &&
    outgoing != null &&
    incoming.dataCoverage === "SUFFICIENT" &&
    outgoing.dataCoverage === "SUFFICIENT";
  const coverage: DataCoverage = both
    ? "SUFFICIENT"
    : incoming == null || outgoing == null
      ? "INSUFFICIENT"
      : "LIMITED";

  if (both && incoming && outgoing) {
    const inDemand = incoming.demand.count ?? 0;
    const outDemand = outgoing.demand.count ?? 0;
    const inSupply = incoming.supply.count ?? 0;
    const outSupply = outgoing.supply.count ?? 0;
    if (outDemand > inDemand) {
      facts.push({
        key: "outgoing_more_demanded",
        supported: true,
        text: "הרכב שאתה מוכר מבוקש יותר מהרכב שאתה מקבל",
      });
    } else if (inDemand > outDemand) {
      facts.push({
        key: "incoming_more_demanded",
        supported: true,
        text: "הרכב שאתה מקבל מבוקש יותר מהרכב שאתה מוכר",
      });
    }
    if (inSupply > outSupply && inDemand < outDemand) {
      facts.push({
        key: "incoming_more_supply_less_demand",
        supported: true,
        text: "לרכב שאתה מקבל יש כרגע יותר היצע ופחות ביקוש",
      });
    }
    if (outSupply > inSupply && outDemand < inDemand) {
      facts.push({
        key: "outgoing_more_supply_less_demand",
        supported: true,
        text: "לרכב שאתה מוכר יש כרגע יותר היצע ופחות ביקוש",
      });
    }
    if (incoming.marketability.band === outgoing.marketability.band) {
      facts.push({
        key: "similar_marketability",
        supported: true,
        text: "הסחירות של שני הרכבים דומה כרגע",
      });
    }
  }

  if ((incoming?.customerMatches.count ?? 0) > 0) {
    facts.push({
      key: "incoming_has_matching_customers",
      supported: true,
      text: `יש לך ${incoming!.customerMatches.count} לקוחות שמתאימים לרכב שאתה מקבל`,
    });
  }
  if ((outgoing?.customerMatches.count ?? 0) > 0) {
    facts.push({
      key: "outgoing_has_matching_customers",
      supported: true,
      text: `יש לך ${outgoing!.customerMatches.count} לקוחות שמתאימים לרכב שאתה מוכר`,
    });
  }

  return { coverage, facts };
}

export function assemblePurchaseSnapshot(input: {
  decision: VehicleDecisionView;
  vehicle: SnapshotVehicle;
  marketActivity: MarketActivitySnapshot;
}): PurchaseDecisionSnapshot {
  return {
    decisionId: input.decision.id,
    vehicle: input.vehicle,
    incomingAskPrice: input.decision.incomingAskPrice,
    marketActivity: input.marketActivity,
    comparablePriceRange: input.marketActivity.comparablePriceRange,
    pricePosition: input.marketActivity.pricePosition,
    matchingCustomers: input.marketActivity.customerMatches,
    marketability: input.marketActivity.marketability,
    missingInformation: purchaseMissing({
      incomingAskPrice: input.decision.incomingAskPrice,
      coverage: input.marketActivity.dataCoverage,
    }),
    generatedAt: input.marketActivity.generatedAt,
  };
}

export function assembleTradeSnapshot(input: {
  decision: VehicleDecisionView;
  incomingVehicle: SnapshotVehicle;
  outgoingVehicle: SnapshotVehicle | null;
  incomingActivity: MarketActivitySnapshot;
  outgoingActivity: MarketActivitySnapshot | null;
  outgoingDaysInInventory: number | null;
  outgoingAskingB2B: number | null;
  outgoingAskingRetail: number | null;
}): TradeDecisionSnapshot {
  const incomingAgreed = input.decision.incomingAgreedPrice;
  const outgoingAgreed = input.decision.outgoingAgreedPrice;
  const missing: string[] = [];
  if (incomingAgreed == null) missing.push("incomingAgreedPrice");
  if (!input.decision.outgoingVehicleId) missing.push("outgoingVehicleId");
  if (outgoingAgreed == null) missing.push("outgoingAgreedPrice");
  if (input.incomingActivity.dataCoverage !== "SUFFICIENT") {
    missing.push("incoming_market_sample");
  }
  if (!input.outgoingActivity || input.outgoingActivity.dataCoverage !== "SUFFICIENT") {
    missing.push("outgoing_market_sample");
  }

  return {
    decisionId: input.decision.id,
    incoming: {
      vehicle: input.incomingVehicle,
      tradeAllowance: incomingAgreed,
      marketActivity: input.incomingActivity,
      pricePosition: input.incomingActivity.pricePosition,
      matchingCustomers: input.incomingActivity.customerMatches,
      marketability: input.incomingActivity.marketability,
    },
    outgoing: {
      vehicle: input.outgoingVehicle,
      agreedSalePrice: outgoingAgreed,
      currentAskingB2B: input.outgoingAskingB2B,
      currentAskingRetail: input.outgoingAskingRetail,
      daysInDealerInventory: input.outgoingDaysInInventory,
      marketActivity: input.outgoingActivity,
      matchingCustomers: input.outgoingActivity?.customerMatches ?? {
        count: 0,
        scope: "dealer_local",
      },
      marketability: input.outgoingActivity?.marketability ?? null,
    },
    comparison: tradeComparison(input.incomingActivity, input.outgoingActivity),
    financial: {
      incomingAgreedPrice: incomingAgreed,
      outgoingAgreedPrice: outgoingAgreed,
      customerCashDifference:
        incomingAgreed != null && outgoingAgreed != null
          ? outgoingAgreed - incomingAgreed
          : null,
      outgoingAgreedPriceMissing: outgoingAgreed == null,
      cashDifferenceSemantic: "outgoing_agreed_minus_incoming_agreed",
    },
    missingInformation: missing,
    generatedAt: input.incomingActivity.generatedAt,
  };
}

export async function getDecisionSnapshot(input: {
  dealerId: string;
  vehicleId: string;
}): Promise<DecisionSnapshotResult> {
  const generatedAt = new Date().toISOString();
  const decision = await getDecisionForVehicle(input);
  if (!decision) {
    return {
      ok: true,
      workspaceActive: false,
      reason: "not_found",
      decision: null,
      generatedAt,
    };
  }
  if (decision.status !== "OPEN") {
    return {
      ok: true,
      workspaceActive: false,
      reason: "decision_terminal",
      decision,
      generatedAt,
    };
  }

  const incoming = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: input.dealerId },
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      trim: true,
    },
  });
  if (!incoming) {
    return {
      ok: true,
      workspaceActive: false,
      reason: "not_found",
      decision,
      generatedAt,
    };
  }

  const incomingActivity = await collectMarketActivity({
    dealerId: input.dealerId,
    subject: { vehicleId: incoming.id },
    subjectPrice:
      decision.type === "TRADE"
        ? decision.incomingAgreedPrice ?? decision.incomingAskPrice
        : decision.incomingAskPrice,
    vehicleRef: snapshotVehicle(incoming),
  });

  if (decision.type === "PURCHASE") {
    return {
      ok: true,
      workspaceActive: true,
      kind: "PURCHASE",
      decision,
      purchase: assemblePurchaseSnapshot({
        decision,
        vehicle: snapshotVehicle(incoming),
        marketActivity: incomingActivity,
      }),
      trade: null,
      generatedAt: incomingActivity.generatedAt,
    };
  }

  let outgoingVehicle: SnapshotVehicle | null = null;
  let outgoingActivity: MarketActivitySnapshot | null = null;
  let outgoingDaysInInventory: number | null = null;
  let outgoingAskingB2B: number | null = null;
  let outgoingAskingRetail: number | null = null;

  if (decision.outgoingVehicleId) {
    const outgoing = await prisma.vehicle.findFirst({
      where: {
        id: decision.outgoingVehicleId,
        dealerId: input.dealerId,
      },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        trim: true,
        createdAt: true,
        dealerRelationship: true,
        b2bPrice: true,
        retailPrice: true,
        status: true,
      },
    });
    if (outgoing) {
      outgoingVehicle = snapshotVehicle(outgoing);
      outgoingAskingB2B = outgoing.b2bPrice;
      outgoingAskingRetail = outgoing.retailPrice;
      if (isOwnedInventoryRelationship(outgoing.dealerRelationship)) {
        outgoingDaysInInventory = daysSince(outgoing.createdAt);
      }
      outgoingActivity = await collectMarketActivity({
        dealerId: input.dealerId,
        subject: { vehicleId: outgoing.id },
        subjectPrice: decision.outgoingAgreedPrice ?? outgoing.b2bPrice,
        vehicleRef: outgoingVehicle,
      });
    }
  }

  return {
    ok: true,
    workspaceActive: true,
    kind: "TRADE",
    decision,
    purchase: null,
    trade: assembleTradeSnapshot({
      decision,
      incomingVehicle: snapshotVehicle(incoming),
      outgoingVehicle,
      incomingActivity,
      outgoingActivity,
      outgoingDaysInInventory,
      outgoingAskingB2B,
      outgoingAskingRetail,
    }),
    generatedAt: incomingActivity.generatedAt,
  };
}

/**
 * Agent 4.1 — Exchange Intelligence, private matching, market watches.
 * Scoped to THIS dealerId. Network reads use privacy-safe aggregates only.
 */
import "server-only";
import {
  runExchangeIntelligenceEngine,
  type ExchangeIntelAction,
  type ExchangeIntelSubject,
} from "@/services/exchange-intelligence/engine";
import {
  matchDemandToMyInventory,
  matchPrivateVehicleToMyDemands,
} from "@/services/matching/private-matching";
import {
  createMarketWatch,
  listMarketWatches,
} from "@/services/market-watch/watches";

export const EXCHANGE_AGENT_TOOL_NAMES = [
  "run_exchange_intelligence",
  "private_match_vehicle_to_my_demands",
  "private_match_demand_to_my_inventory",
  "list_my_market_watches",
  "create_market_watch",
] as const;

export type ExchangeAgentToolName = (typeof EXCHANGE_AGENT_TOOL_NAMES)[number];

export function isExchangeAgentTool(
  name: string
): name is ExchangeAgentToolName {
  return (EXCHANGE_AGENT_TOOL_NAMES as readonly string[]).includes(name);
}

const ENGINE_ACTIONS = new Set<string>([
  "MARKET_OVERVIEW",
  "CHECK_DEMAND",
  "CHECK_SUPPLY",
  "COMPARE_SIMILAR",
  "CHECK_BUY_PRICE",
  "CHECK_LIQUIDITY",
  "CHECK_TRADE_RISK",
  "MATCH_MY_CUSTOMERS",
]);

function parseIntelSubject(
  args: Record<string, unknown>
): ExchangeIntelSubject | null {
  if (typeof args.vehicleId === "string" && args.vehicleId.trim()) {
    return { vehicleId: args.vehicleId.trim() };
  }
  if (typeof args.demandId === "string" && args.demandId.trim()) {
    return { demandId: args.demandId.trim() };
  }
  const make = typeof args.make === "string" ? args.make.trim() : "";
  const model = typeof args.model === "string" ? args.model.trim() : "";
  if (make && model) {
    return {
      make,
      model,
      yearMin: typeof args.yearMin === "number" ? args.yearMin : null,
      yearMax: typeof args.yearMax === "number" ? args.yearMax : null,
      fuel: typeof args.fuel === "string" ? args.fuel : null,
      engine: typeof args.engine === "string" ? args.engine : null,
    };
  }
  return null;
}

function stripPrivateMatchPhones<T extends { matches: Array<Record<string, unknown>> }>(
  result: T
): T {
  return {
    ...result,
    matches: result.matches.map((m) => {
      const { customerPhone: _p, ...rest } = m;
      return rest;
    }),
  };
}

export async function executeExchangeAgentTool(
  name: ExchangeAgentToolName,
  dealerId: string,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  if (name === "run_exchange_intelligence") {
    const action = String(args.action ?? "MARKET_OVERVIEW");
    if (!ENGINE_ACTIONS.has(action)) {
      return { ok: false, error: "invalid_action" };
    }
    const subject = parseIntelSubject(args);
    if (!subject) {
      return { ok: false, error: "subject_required" };
    }
    const offeredPrice =
      typeof args.offeredPrice === "number" ? args.offeredPrice : null;
    const result = await runExchangeIntelligenceEngine({
      dealerId,
      action: action as ExchangeIntelAction,
      subject,
      offeredPrice,
      includeCustomerPhone: false,
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      intelligence: result,
      note: "Anonymous network aggregates only. Never invent counts when insufficientData is true.",
    };
  }

  if (name === "private_match_vehicle_to_my_demands") {
    const vehicleId = String(args.vehicleId ?? "").trim();
    if (!vehicleId) return { ok: false, error: "vehicleId_required" };
    const result = await matchPrivateVehicleToMyDemands({ dealerId, vehicleId });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ...stripPrivateMatchPhones(result),
      note: "Private match within THIS dealer only. Customer phone is never returned to the model.",
    };
  }

  if (name === "private_match_demand_to_my_inventory") {
    const demandId = String(args.demandId ?? "").trim();
    if (!demandId) return { ok: false, error: "demandId_required" };
    const result = await matchDemandToMyInventory({ dealerId, demandId });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ...result,
      note: "Private match: THIS dealer demand vs own ACTIVE inventory (incl. PRIVATE). No network publish.",
    };
  }

  if (name === "list_my_market_watches") {
    const rows = await listMarketWatches(dealerId);
    return {
      ok: true,
      count: rows.length,
      watches: rows.map((w) => ({
        id: w.id,
        queryMake: w.queryMake,
        queryModel: w.queryModel,
        yearMin: w.yearMin,
        yearMax: w.yearMax,
        active: w.active,
        createdAt: w.createdAt.toISOString(),
        lastEvaluatedAt: w.lastEvaluatedAt?.toISOString() ?? null,
        lastNotifiedAt: w.lastNotifiedAt?.toISOString() ?? null,
      })),
      note: "Own watches only. Alerts use anonymous network snapshots.",
    };
  }

  if (name === "create_market_watch") {
    const queryMake = String(args.queryMake ?? args.make ?? "").trim();
    const queryModel = String(args.queryModel ?? args.model ?? "").trim();
    if (!queryMake || !queryModel) {
      return { ok: false, error: "make_model_required" };
    }
    const watch = await createMarketWatch({
      dealerId,
      queryMake,
      queryModel,
      yearMin: typeof args.yearMin === "number" ? args.yearMin : null,
      yearMax: typeof args.yearMax === "number" ? args.yearMax : null,
    });
    return {
      ok: true,
      watch: {
        id: watch.id,
        queryMake: watch.queryMake,
        queryModel: watch.queryModel,
        yearMin: watch.yearMin,
        yearMax: watch.yearMax,
        active: watch.active,
        createdAt: watch.createdAt.toISOString(),
      },
      note: "Watch saved for THIS dealer. Does not expose other dealers.",
    };
  }

  return { ok: false, error: "unknown_tool" };
}

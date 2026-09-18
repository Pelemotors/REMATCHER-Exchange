import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  matchDemandToMyInventory,
  matchPrivateVehicleToMyDemands,
} from "@/services/matching/private-matching";
import { getNetworkIntelligenceSnapshot } from "@/services/network-intelligence";
import {
  runExchangeIntelligenceEngine,
  type ExchangeIntelAction,
} from "@/services/exchange-intelligence/engine";

export const dynamic = "force-dynamic";

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

function parseSubject(body: Record<string, unknown>) {
  const subject = body.subject;
  if (subject && typeof subject === "object" && !Array.isArray(subject)) {
    return subject as Record<string, unknown>;
  }
  if (typeof body.vehicleId === "string" && body.vehicleId) {
    return { vehicleId: body.vehicleId };
  }
  if (typeof body.demandId === "string" && body.demandId) {
    return { demandId: body.demandId };
  }
  if (typeof body.make === "string" && typeof body.model === "string") {
    return {
      make: body.make,
      model: body.model,
      yearMin: body.yearMin,
      yearMax: body.yearMax,
      fuel: body.fuel,
      engine: body.engine,
    };
  }
  return null;
}

/** Thin wrap of Web POST /api/intelligence */
export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "private_match") {
    const result = await matchPrivateVehicleToMyDemands({
      dealerId: principal.dealerId,
      vehicleId: String(body.vehicleId ?? ""),
    });
    if (!result.ok) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    return v1Json(ctx, result);
  }

  if (action === "private_demand_match") {
    const result = await matchDemandToMyInventory({
      dealerId: principal.dealerId,
      demandId: String(body.demandId ?? ""),
    });
    if (!result.ok) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    return v1Json(ctx, result);
  }

  if (action === "network_intel") {
    const snap = await getNetworkIntelligenceSnapshot({
      dealerId: principal.dealerId,
      make: (body.make as string | null | undefined) ?? null,
      model: (body.model as string | null | undefined) ?? null,
      yearMin: (body.yearMin as number | null | undefined) ?? null,
      yearMax: (body.yearMax as number | null | undefined) ?? null,
    });
    return v1Json(ctx, snap);
  }

  if (ENGINE_ACTIONS.has(action)) {
    const subjectRaw = parseSubject(body);
    if (!subjectRaw) {
      return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
    }
    const subject =
      "vehicleId" in subjectRaw && subjectRaw.vehicleId
        ? { vehicleId: String(subjectRaw.vehicleId) }
        : "demandId" in subjectRaw && subjectRaw.demandId
          ? { demandId: String(subjectRaw.demandId) }
          : {
              make: String(subjectRaw.make ?? ""),
              model: String(subjectRaw.model ?? ""),
              yearMin:
                typeof subjectRaw.yearMin === "number" ? subjectRaw.yearMin : null,
              yearMax:
                typeof subjectRaw.yearMax === "number" ? subjectRaw.yearMax : null,
              fuel:
                typeof subjectRaw.fuel === "string" ? subjectRaw.fuel : null,
              engine:
                typeof subjectRaw.engine === "string" ? subjectRaw.engine : null,
            };

    const offeredPrice =
      typeof body.offeredPrice === "number" ? body.offeredPrice : null;

    const result = await runExchangeIntelligenceEngine({
      dealerId: principal.dealerId,
      action: action as ExchangeIntelAction,
      subject,
      offeredPrice,
      includeCustomerPhone: true,
    });
    if (!result.ok) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    return v1Json(ctx, result);
  }

  return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
}

import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { matchPrivateVehicleToMyDemands } from "@/services/matching/private-matching";
import { getNetworkIntelligenceSnapshot } from "@/services/network-intelligence";

export const dynamic = "force-dynamic";

/** Thin wrap of Web POST /api/intelligence */
export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Record<string, unknown>;

  if (body.action === "private_match") {
    const result = await matchPrivateVehicleToMyDemands({
      dealerId: principal.dealerId,
      vehicleId: String(body.vehicleId ?? ""),
    });
    if (!result.ok) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    return v1Json(ctx, result);
  }

  if (body.action === "network_intel") {
    const snap = await getNetworkIntelligenceSnapshot({
      dealerId: principal.dealerId,
      make: (body.make as string | null | undefined) ?? null,
      model: (body.model as string | null | undefined) ?? null,
      yearMin: (body.yearMin as number | null | undefined) ?? null,
      yearMax: (body.yearMax as number | null | undefined) ?? null,
    });
    return v1Json(ctx, snap);
  }

  return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
}

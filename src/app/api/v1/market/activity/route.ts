import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { collectMarketActivity } from "@/services/market/activity";
import type { ExchangeIntelSubject } from "@/services/exchange-intelligence/engine";

export const dynamic = "force-dynamic";

/**
 * Canonical Market Activity for OWNED / EXTERNAL / Demand / make-model.
 * Decision snapshots reuse the same collectMarketActivity service.
 */
export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const url = new URL(req.url);
  const vehicleId = url.searchParams.get("vehicleId")?.trim() || "";
  const demandId = url.searchParams.get("demandId")?.trim() || "";
  const make = url.searchParams.get("make")?.trim() || "";
  const model = url.searchParams.get("model")?.trim() || "";
  const yearMin = url.searchParams.get("yearMin");
  const yearMax = url.searchParams.get("yearMax");
  const subjectPriceRaw = url.searchParams.get("subjectPrice");

  let subject: ExchangeIntelSubject | null = null;
  if (vehicleId) subject = { vehicleId };
  else if (demandId) subject = { demandId };
  else if (make && model) {
    subject = {
      make,
      model,
      yearMin: yearMin ? Number(yearMin) : null,
      yearMax: yearMax ? Number(yearMax) : null,
    };
  }
  if (!subject) return v1Error(ctx, "VALIDATION_INVALID_REQUEST");

  const subjectPrice =
    subjectPriceRaw && /^\d+$/.test(subjectPriceRaw)
      ? Number(subjectPriceRaw)
      : null;

  const activity = await collectMarketActivity({
    dealerId: principal.dealerId,
    subject,
    subjectPrice,
  });
  return v1Json(ctx, {
    marketActivity: activity,
    generatedAt: activity.generatedAt,
    freshness: { mode: "recompute", generatedAt: activity.generatedAt },
  });
}

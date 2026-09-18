import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Json } from "@/lib/api-v1/respond";
import { getMarketPulse } from "@/services/market/pulse";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const url = new URL(req.url);
  const make = url.searchParams.get("make");
  const model = url.searchParams.get("model");
  const yearMinRaw = url.searchParams.get("yearMin");
  const yearMaxRaw = url.searchParams.get("yearMax");
  const yearMin =
    yearMinRaw && /^\d+$/.test(yearMinRaw) ? Number(yearMinRaw) : null;
  const yearMax =
    yearMaxRaw && /^\d+$/.test(yearMaxRaw) ? Number(yearMaxRaw) : null;

  const pulse = await getMarketPulse(principal.dealerId, {
    make,
    model,
    yearMin,
    yearMax,
  });
  return v1Json(ctx, pulse);
}

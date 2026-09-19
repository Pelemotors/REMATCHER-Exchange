import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Json } from "@/lib/api-v1/respond";
import { getCatalogAnalyticsForDealer } from "@/services/catalog/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const url = new URL(req.url);
  const range = url.searchParams.get("range") === "7d" ? "7d" : "30d";
  const analytics = await getCatalogAnalyticsForDealer({
    dealerId: principal.dealerId,
    range,
  });
  return v1Json(ctx, analytics);
}

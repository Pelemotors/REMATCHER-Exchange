import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Json } from "@/lib/api-v1/respond";
import { getDealerUsageSummary } from "@/services/commercial/reveal-usage";

export const dynamic = "force-dynamic";

/** Thin wrap of Web GET /api/commercial/usage — principal.dealerId only. */
export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const usage = await getDealerUsageSummary(principal.dealerId);
  return v1Json(ctx, usage);
}

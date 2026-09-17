/**
 * DealerOpportunity (proactive attention feed) — NOT SellerOpportunity.
 * SellerOpportunity (bilateral interest) lives at /api/v1/opportunities.
 * Thin wrap of Web /api/dealer-opportunities.
 */
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  dismissDealerOpportunity,
  listOpenDealerOpportunities,
  refreshDealerOpportunitySources,
} from "@/services/opportunities/dealer-opportunity";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  await refreshDealerOpportunitySources(principal.dealerId).catch(
    () => undefined
  );
  const rows = await listOpenDealerOpportunities(principal.dealerId);
  return v1Json(ctx, { opportunities: rows });
}

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { action?: string; id?: string };

  if (body.action === "dismiss") {
    const row = await dismissDealerOpportunity(
      principal.dealerId,
      String(body.id ?? "")
    );
    if (!row) return v1Error(ctx, "RESOURCE_NOT_FOUND");
    return v1Json(ctx, row);
  }
  if (body.action === "refresh") {
    const result = await refreshDealerOpportunitySources(principal.dealerId);
    const rows = await listOpenDealerOpportunities(principal.dealerId);
    return v1Json(ctx, { ...result, opportunities: rows });
  }
  return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
}

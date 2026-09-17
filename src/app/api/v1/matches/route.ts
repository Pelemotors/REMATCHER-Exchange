import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Json } from "@/lib/api-v1/respond";
import { listBuyerMatches } from "@/services/matching/list-buyer-matches";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const url = new URL(req.url);
  const demandId = url.searchParams.get("demandId") ?? undefined;
  const limitRaw = Number(url.searchParams.get("limit") ?? "30") || 30;
  const limit = Math.min(100, Math.max(1, limitRaw));

  const rows = await listBuyerMatches(principal.dealerId, {
    demandId,
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return v1Json(ctx, {
    items,
    page: {
      limit,
      nextCursor: null,
      hasMore,
      sort: "score:desc",
    },
  });
}

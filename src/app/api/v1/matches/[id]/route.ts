import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { getBuyerMatchForDealer } from "@/services/matching/list-buyer-matches";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;
  const match = await getBuyerMatchForDealer(principal.dealerId, id);
  if (!match) return v1Error(ctx, "RESOURCE_NOT_FOUND");
  return v1Json(ctx, match);
}

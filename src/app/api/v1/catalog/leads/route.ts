import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Json } from "@/lib/api-v1/respond";
import { listCatalogLeadsForDealer } from "@/services/catalog/leads";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const result = await listCatalogLeadsForDealer({ dealerId: principal.dealerId });
  return v1Json(ctx, result);
}

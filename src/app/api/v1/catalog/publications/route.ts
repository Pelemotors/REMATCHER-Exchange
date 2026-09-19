import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { replaceCatalogPublications } from "@/services/catalog/catalog-service";
import { catalogDomainToV1 } from "@/services/catalog/v1-errors";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { vehicleIds?: unknown };
  if (!Array.isArray(body.vehicleIds) || body.vehicleIds.some((id) => typeof id !== "string")) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  const result = await replaceCatalogPublications({
    dealerId: principal.dealerId,
    vehicleIds: body.vehicleIds as string[],
  });
  if (!result.ok) {
    return v1Error(ctx, catalogDomainToV1(result.error));
  }
  return v1Json(ctx, result);
}

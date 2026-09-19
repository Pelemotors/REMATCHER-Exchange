import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { updateCatalogPublicationForDealer } from "@/services/catalog/catalog-service";
import { catalogDomainToV1 } from "@/services/catalog/v1-errors";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { publicId } = await params;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Record<string, unknown>;
  const result = await updateCatalogPublicationForDealer({
    dealerId: principal.dealerId,
    publicId,
    showPrice: typeof body.showPrice === "boolean" ? body.showPrice : undefined,
    showMonthlyFinance:
      typeof body.showMonthlyFinance === "boolean"
        ? body.showMonthlyFinance
        : undefined,
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
    publicDescription:
      body.publicDescription === undefined
        ? undefined
        : (body.publicDescription as string | null),
  });
  if (!result.ok) {
    return v1Error(ctx, catalogDomainToV1(result.error), result.message);
  }
  return v1Json(ctx, result);
}

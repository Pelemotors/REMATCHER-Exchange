import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { getCatalogForDealer } from "@/services/catalog/catalog-service";
import { issueCatalogPreviewToken } from "@/services/catalog/preview-token";
import { catalogPublicUrl } from "@/services/catalog/public-url";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const catalog = await getCatalogForDealer(principal.dealerId);
  if (!catalog) return v1Error(ctx, "CATALOG_NOT_FOUND");
  const issued = issueCatalogPreviewToken({
    catalogId: catalog.id,
    dealerId: principal.dealerId,
  });
  if ("error" in issued) {
    return v1Error(ctx, "SERVER_INTERNAL");
  }
  const previewUrl = `${catalogPublicUrl(catalog.slug)}?preview=${encodeURIComponent(issued.token)}`;
  return v1Json(ctx, { token: issued.token, exp: issued.exp, previewUrl });
}

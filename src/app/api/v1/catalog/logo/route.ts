import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { saveCatalogLogo } from "@/services/catalog/catalog-service";
import { isAllowedImageMime } from "@/lib/media/storage";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  if (!isAllowedImageMime(file.type || "image/jpeg")) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await saveCatalogLogo({ dealerId: principal.dealerId, bytes });
  if (!result.ok) return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  return v1Json(ctx, result);
}

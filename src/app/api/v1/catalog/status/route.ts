import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { setCatalogStatus } from "@/services/catalog/catalog-service";
import { catalogDomainToV1 } from "@/services/catalog/v1-errors";
import type { CatalogStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { status?: unknown; action?: unknown };
  const raw = String(body.status ?? body.action ?? "").toUpperCase();
  const statusMap: Record<string, CatalogStatus> = {
    ENABLE: "ENABLED",
    ENABLED: "ENABLED",
    DISABLE: "DISABLED",
    DISABLED: "DISABLED",
    DRAFT: "DRAFT",
  };
  const status = statusMap[raw];
  if (!status) return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  const result = await setCatalogStatus(principal.dealerId, status);
  if (!result.ok) {
    return v1Error(
      ctx,
      catalogDomainToV1(result.error),
      "message" in result ? result.message : undefined
    );
  }
  return v1Json(ctx, result);
}

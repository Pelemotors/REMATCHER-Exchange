import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  createOrUpdateCatalog,
  getCatalogForDealer,
  setCatalogStatus,
} from "@/services/catalog/catalog-service";
import type { CatalogStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Thin wrap of Web GET /api/catalog/me */
export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const catalog = await getCatalogForDealer(principal.dealerId);
  return v1Json(ctx, { catalog });
}

/** Thin wrap of Web POST /api/catalog/me (upsert / enable / disable / draft). */
export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Record<string, unknown>;

  if (
    body.action === "enable" ||
    body.action === "disable" ||
    body.action === "draft"
  ) {
    const statusMap: Record<string, CatalogStatus> = {
      enable: "ENABLED",
      disable: "DISABLED",
      draft: "DRAFT",
    };
    const result = await setCatalogStatus(
      principal.dealerId,
      statusMap[String(body.action)]
    );
    if (!result.ok) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    return v1Json(ctx, result);
  }

  const result = await createOrUpdateCatalog(principal.dealerId, {
    slug: body.slug as string | undefined,
    displayName: body.displayName as string | undefined,
    phone: body.phone as string | undefined,
    whatsapp: body.whatsapp as string | undefined,
    address: body.address as string | undefined,
    description: body.description as string | undefined,
    logoUrl: body.logoUrl as string | undefined,
  });

  if (!result.ok) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  return v1Json(ctx, result);
}

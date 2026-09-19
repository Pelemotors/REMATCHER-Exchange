import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  createOrUpdateCatalog,
  getCatalogForDealer,
  setCatalogStatus,
  type CatalogSettingsInput,
} from "@/services/catalog/catalog-service";
import { catalogDomainToV1 } from "@/services/catalog/v1-errors";
import type { CatalogStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

function brandingFromBody(body: Record<string, unknown>): CatalogSettingsInput {
  return {
    slug: typeof body.slug === "string" ? body.slug : undefined,
    displayName: typeof body.displayName === "string" ? body.displayName : undefined,
    phone: body.phone === undefined ? undefined : (body.phone as string | null),
    whatsapp:
      body.whatsapp === undefined ? undefined : (body.whatsapp as string | null),
    address: body.address === undefined ? undefined : (body.address as string | null),
    description:
      body.description === undefined ? undefined : (body.description as string | null),
    logoUrl: body.logoUrl === undefined ? undefined : (body.logoUrl as string | null),
    coverImageUrl:
      body.coverImageUrl === undefined
        ? undefined
        : (body.coverImageUrl as string | null),
    themeKey: typeof body.themeKey === "string" ? body.themeKey : undefined,
    allowSearchIndexing:
      typeof body.allowSearchIndexing === "boolean"
        ? body.allowSearchIndexing
        : undefined,
    cityLabel:
      body.cityLabel === undefined ? undefined : (body.cityLabel as string | null),
    openingHoursJson:
      body.openingHoursJson === undefined
        ? undefined
        : (body.openingHoursJson as CatalogSettingsInput["openingHoursJson"]),
  };
}

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const catalog = await getCatalogForDealer(principal.dealerId);
  return v1Json(ctx, { catalog });
}

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
      return v1Error(
        ctx,
        catalogDomainToV1(result.error),
        "message" in result ? result.message : undefined
      );
    }
    return v1Json(ctx, result);
  }

  const result = await createOrUpdateCatalog(
    principal.dealerId,
    brandingFromBody(body)
  );
  if (!result.ok) {
    return v1Error(ctx, catalogDomainToV1(result.error), result.message);
  }
  return v1Json(ctx, result);
}

export async function PATCH(req: Request) {
  return POST(req);
}

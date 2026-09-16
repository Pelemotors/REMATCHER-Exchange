import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import {
  createOrUpdateCatalog,
  getCatalogForDealer,
  setCatalogStatus,
} from "@/services/catalog/catalog-service";
import type { CatalogStatus } from "@prisma/client";

export async function GET() {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const dealerId = auth.session.user.dealerId!;
  const catalog = await getCatalogForDealer(dealerId);
  return NextResponse.json({ catalog });
}

export async function POST(req: Request) {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const dealerId = auth.session.user.dealerId!;
  const body = await req.json().catch(() => ({}));

  if (body.action === "enable" || body.action === "disable" || body.action === "draft") {
    const statusMap: Record<string, CatalogStatus> = {
      enable: "ENABLED",
      disable: "DISABLED",
      draft: "DRAFT",
    };
    const result = await setCatalogStatus(dealerId, statusMap[body.action]);
    if (!result.ok) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  }

  const result = await createOrUpdateCatalog(dealerId, {
    slug: body.slug,
    displayName: body.displayName,
    phone: body.phone,
    whatsapp: body.whatsapp,
    address: body.address,
    description: body.description,
    logoUrl: body.logoUrl,
  });

  if (!result.ok) {
    const status =
      result.error === "slug_taken" || result.error?.startsWith("slug_")
        ? 400
        : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { requireDealerSession } from "@/lib/auth-guards";
import { isSlugAvailable } from "@/services/catalog/catalog-service";
import { validateCatalogSlug } from "@/services/catalog/slug";

export async function GET(req: Request) {
  const auth = await requireDealerSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const validation = validateCatalogSlug(slug);
  if (!validation.ok) {
    return NextResponse.json({
      available: false,
      slug: null,
      reason: validation.code,
    });
  }

  const available = await isSlugAvailable(validation.slug);
  return NextResponse.json({
    available,
    slug: validation.slug,
    reason: available ? null : "slug_taken",
  });
}

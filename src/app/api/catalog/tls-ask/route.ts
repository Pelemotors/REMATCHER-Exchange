import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { catalogSlugFromHost } from "@/services/catalog/slug";

/**
 * Caddy on-demand TLS ask endpoint.
 * Returns 200 only for existing dealer catalog hosts so ACME is not open-ended.
 * Query: ?domain=galeria-test.rematcher.co.il
 */
export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain");
  const slug = catalogSlugFromHost(domain);
  if (!slug) {
    return new NextResponse("forbidden", { status: 404 });
  }
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!catalog) {
    return new NextResponse("unknown", { status: 404 });
  }
  return new NextResponse("ok", { status: 200 });
}

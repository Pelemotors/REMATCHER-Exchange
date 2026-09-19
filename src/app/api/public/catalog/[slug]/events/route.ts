import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPublicCatalogBySlug } from "@/services/catalog/catalog-service";
import { recordCatalogEvent } from "@/services/catalog/events";
import { isPublicCatalogEventType } from "@/services/catalog/event-types";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isPublicCatalogEventType(body.eventType)) {
    return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }
  const catalog = await getPublicCatalogBySlug(slug);
  if (!catalog) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let publicationId: string | null = null;
  let vehicleId: string | null = null;
  if (typeof body.publicId === "string" && body.publicId) {
    const pub = await prisma.catalogPublication.findFirst({
      where: { catalogId: catalog.id, publicId: body.publicId },
      select: { id: true, vehicleId: true },
    });
    if (pub) {
      publicationId = pub.id;
      vehicleId = pub.vehicleId;
    }
  }

  await recordCatalogEvent({
    catalogId: catalog.id,
    eventType: body.eventType,
    publicationId,
    vehicleId,
    clientEventId: typeof body.clientEventId === "string" ? body.clientEventId : null,
    sessionHash: typeof body.sessionHash === "string" ? body.sessionHash : null,
    referrerHost: typeof body.referrerHost === "string" ? body.referrerHost : req.headers.get("referer"),
    utmSource: typeof body.utmSource === "string" ? body.utmSource : null,
    utmMedium: typeof body.utmMedium === "string" ? body.utmMedium : null,
    utmCampaign: typeof body.utmCampaign === "string" ? body.utmCampaign : null,
  });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPublicCatalogBySlug } from "@/services/catalog/catalog-service";
import {
  catalogVehicleWhatsAppHref,
  pickCatalogWhatsAppNumber,
} from "@/services/catalog/whatsapp-interest";
import { recordCatalogEvent } from "@/services/catalog/events";
import { CATALOG_ELIGIBLE_RELATIONSHIPS } from "@/services/catalog/eligibility";
import { catalogPublicUrl } from "@/services/catalog/public-url";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; publicId: string }> }
) {
  const { slug, publicId } = await params;
  const catalog = await getPublicCatalogBySlug(slug);
  if (!catalog) {
    return NextResponse.redirect(catalogPublicUrl(slug), 302);
  }
  const pub = await prisma.catalogPublication.findFirst({
    where: {
      catalogId: catalog.id,
      publicId,
      isActive: true,
      vehicle: {
        status: "ACTIVE",
        dealerRelationship: { in: CATALOG_ELIGIBLE_RELATIONSHIPS },
      },
    },
    include: {
      vehicle: {
        select: { make: true, model: true, year: true, trim: true },
      },
    },
  });
  const contact = pickCatalogWhatsAppNumber(
    catalog.whatsapp,
    catalog.phone,
    catalog.dealer?.phone
  );
  if (!pub || !contact) {
    return NextResponse.redirect(catalogPublicUrl(slug), 302);
  }

  await recordCatalogEvent({
    catalogId: catalog.id,
    eventType: "WHATSAPP_CLICK",
    publicationId: pub.id,
    vehicleId: pub.vehicleId,
  });

  const href = catalogVehicleWhatsAppHref(contact, {
    title: [pub.vehicle.make, pub.vehicle.model, pub.vehicle.trim].filter(Boolean).join(" ") || "רכב",
    make: pub.vehicle.make,
    model: pub.vehicle.model,
    year: pub.vehicle.year,
    slug: catalog.slug,
    publicRef: publicId.slice(0, 16),
  });
  if (!href) {
    return NextResponse.redirect(catalogPublicUrl(slug), 302);
  }
  return NextResponse.redirect(href, 302);
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { checkCatalogPublishEligibility } from "@/services/catalog/eligibility";
import { newCatalogPublicId } from "@/services/catalog/public-id";
import { CATALOG_ELIGIBLE_RELATIONSHIPS } from "@/services/catalog/eligibility";

/**
 * SOLD / ARCHIVED / blocked relationship → inactive catalog listing.
 * Idempotent. Call from sold/archive/relationship writers only.
 */
export async function reconcileCatalogPublicationForVehicle(vehicleId: string) {
  const pubs = await prisma.catalogPublication.findMany({
    where: { vehicleId, isActive: true },
    include: {
      vehicle: {
        select: {
          id: true,
          status: true,
          dealerRelationship: true,
          dealerId: true,
          catalogOverride: true,
        },
      },
    },
  });
  if (pubs.length === 0) return { updated: 0 };

  let updated = 0;
  for (const pub of pubs) {
    const eligibility = checkCatalogPublishEligibility(
      pub.vehicle,
      pub.vehicle.dealerId
    );
    if (eligibility.ok) continue;
    await prisma.catalogPublication.update({
      where: { id: pub.id },
      data: { isActive: false, unpublishedAt: new Date() },
    });
    updated += 1;
  }
  return { updated };
}

/** MANUAL publishes only FORCE_INCLUDE. Auto policy publishes all eligible except FORCE_EXCLUDE. */
export function shouldAutoPublishVehicle(input: {
  publicationPolicy: "MANUAL" | "ALL_ELIGIBLE_ACTIVE_INVENTORY";
  catalogOverride: "DEFAULT_FROM_POLICY" | "FORCE_EXCLUDE" | "FORCE_INCLUDE";
  eligible: boolean;
}): boolean {
  if (!input.eligible) return false;
  if (input.catalogOverride === "FORCE_EXCLUDE") return false;
  if (input.catalogOverride === "FORCE_INCLUDE") return true;
  return input.publicationPolicy === "ALL_ELIGIBLE_ACTIVE_INVENTORY";
}

/**
 * Desired-state reconcile for one dealer.
 * MANUAL: only deactivate ineligible publications + honor FORCE_INCLUDE.
 * ALL_ELIGIBLE_ACTIVE_INVENTORY: also publish eligible owned inventory.
 * FORCE_INCLUDE cannot bypass eligibility/privacy.
 */
export async function reconcileCatalogForDealer(dealerId: string) {
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId },
  });
  if (!catalog) return { published: 0, unpublished: 0, policy: null };

  const vehicles = await prisma.vehicle.findMany({
    where: { dealerId },
    select: {
      id: true,
      status: true,
      dealerRelationship: true,
      dealerId: true,
      catalogOverride: true,
    },
  });

  let published = 0;
  let unpublished = 0;

  for (const vehicle of vehicles) {
    const eligibility = checkCatalogPublishEligibility(vehicle, dealerId);
    const existing = await prisma.catalogPublication.findUnique({
      where: {
        catalogId_vehicleId: { catalogId: catalog.id, vehicleId: vehicle.id },
      },
    });

    if (!eligibility.ok) {
      if (existing?.isActive) {
        await prisma.catalogPublication.update({
          where: { id: existing.id },
          data: { isActive: false, unpublishedAt: new Date() },
        });
        unpublished += 1;
      }
      continue;
    }

    const shouldPublish = shouldAutoPublishVehicle({
      publicationPolicy: catalog.publicationPolicy,
      catalogOverride: vehicle.catalogOverride,
      eligible:
        eligibility.ok &&
        CATALOG_ELIGIBLE_RELATIONSHIPS.includes(vehicle.dealerRelationship),
    });

    if (!shouldPublish) continue;

    await prisma.catalogPublication.upsert({
      where: {
        catalogId_vehicleId: { catalogId: catalog.id, vehicleId: vehicle.id },
      },
      create: {
        catalogId: catalog.id,
        vehicleId: vehicle.id,
        publicId: newCatalogPublicId(),
        isActive: true,
        publishedAt: new Date(),
      },
      update: {
        isActive: true,
        unpublishedAt: null,
      },
    });
    if (!existing?.isActive) published += 1;
  }

  return { published, unpublished, policy: catalog.publicationPolicy };
}

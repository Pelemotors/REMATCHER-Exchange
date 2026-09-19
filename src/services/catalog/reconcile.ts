import "server-only";
import { prisma } from "@/lib/prisma";
import { checkCatalogPublishEligibility } from "@/services/catalog/eligibility";

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

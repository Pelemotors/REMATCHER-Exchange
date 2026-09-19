import "server-only";
import { prisma } from "@/lib/prisma";
import { checkCatalogPublishEligibility } from "@/services/catalog/eligibility";
import { catalogPublicVehicleUrl } from "@/services/catalog/public-url";
import { resolveOutboundShare } from "@/services/sharing/sharing-service";
import {
  isOwnedInventoryRelationship,
  vehicleCapabilities,
} from "@/services/vehicles/vehicle-capabilities";
import { isNetworkSupplyEligible } from "@/services/vehicles/relationship-visibility";

export async function getVehicleExposure(input: {
  dealerId: string;
  vehicleId: string;
}) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: input.dealerId },
  });
  if (!vehicle) return { ok: false as const, error: "not_found" as const };

  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId: input.dealerId },
    include: {
      publications: {
        where: { vehicleId: vehicle.id, isActive: true },
        take: 1,
      },
    },
  });
  const publication = catalog?.publications[0] ?? null;
  const capabilities = vehicleCapabilities(vehicle);
  const catalogElig = checkCatalogPublishEligibility(
    {
      status: vehicle.status,
      dealerRelationship: vehicle.dealerRelationship,
      dealerId: vehicle.dealerId,
      catalogOverride: vehicle.catalogOverride,
    },
    input.dealerId
  );

  const share = await resolveOutboundShare({
    dealerId: input.dealerId,
    kind: "VEHICLE",
    resourceId: vehicle.id,
  });

  const reviewOrExternal =
    !isOwnedInventoryRelationship(vehicle.dealerRelationship);
  const publicUrl =
    catalog?.status === "ENABLED" && publication
      ? catalogPublicVehicleUrl(catalog.slug, publication.publicId)
      : null;

  return {
    ok: true as const,
    generatedAt: new Date().toISOString(),
    vehicleId: vehicle.id,
    network: {
      eligible: isNetworkSupplyEligible(vehicle),
      visibility: vehicle.visibility,
      blockedReason: reviewOrExternal
        ? "review_or_external"
        : vehicle.status !== "ACTIVE"
          ? "not_active"
          : !vehicle.mediaReady
            ? "media_not_ready"
            : vehicle.visibility !== "ANONYMOUS_NETWORK"
              ? "not_published"
              : null,
      canPublish: capabilities.canPublishToNetwork,
    },
    catalog: {
      catalogEnabled: catalog?.status === "ENABLED",
      published: Boolean(publication),
      publicationPolicy: catalog?.publicationPolicy ?? "MANUAL",
      vehicleOverride: vehicle.catalogOverride,
      publicUrl,
      blockedReason: catalogElig.ok ? null : catalogElig.code,
      canPublish: capabilities.canPublishToCatalog && catalogElig.ok,
    },
    share: {
      shareable: capabilities.canOutboundShare,
      url: share.ok ? share.payload.url : null,
      requiresPublicCatalog: true,
    },
  };
}

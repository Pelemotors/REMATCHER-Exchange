import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  DealerVehicleRelationship,
  VehicleVisibility,
} from "@prisma/client";

/** Relationships that may be published to ANONYMOUS_NETWORK when explicitly set. */
export const NETWORK_ELIGIBLE_RELATIONSHIPS: DealerVehicleRelationship[] = [
  "OWNED",
  "INVENTORY",
];

export function isNetworkSupplyEligible(vehicle: {
  status: string;
  mediaReady: boolean;
  visibility: VehicleVisibility;
  dealerRelationship: DealerVehicleRelationship;
}): boolean {
  return (
    vehicle.status === "ACTIVE" &&
    vehicle.mediaReady === true &&
    vehicle.visibility === "ANONYMOUS_NETWORK" &&
    NETWORK_ELIGIBLE_RELATIONSHIPS.includes(vehicle.dealerRelationship)
  );
}

/** Prisma where clause for network matching supply. */
export function networkSupplyWhere(
  excludeDealerId: string,
  allowSyntheticMarket = false
) {
  return {
    status: "ACTIVE" as const,
    mediaReady: true,
    visibility: "ANONYMOUS_NETWORK" as const,
    dealerRelationship: { in: NETWORK_ELIGIBLE_RELATIONSHIPS },
    dealerId: { not: excludeDealerId },
    ...(allowSyntheticMarket
      ? {}
      : { dealer: { marketMode: { not: "SYNTHETIC" as const } } }),
  };
}

export async function setVehicleRelationship(params: {
  dealerId: string;
  vehicleId: string;
  relationship: DealerVehicleRelationship;
}) {
  const v = await prisma.vehicle.findFirst({
    where: { id: params.vehicleId, dealerId: params.dealerId },
  });
  if (!v) return { ok: false as const, error: "not_found" };

  // Converting to non-owned must force PRIVATE (cannot stay network as offered/trade-in)
  const forcePrivate = !NETWORK_ELIGIBLE_RELATIONSHIPS.includes(params.relationship);
  const updated = await prisma.vehicle.update({
    where: { id: v.id },
    data: {
      dealerRelationship: params.relationship,
      ...(forcePrivate ? { visibility: "PRIVATE" } : {}),
    },
  });
  return { ok: true as const, vehicle: updated };
}

/**
 * Explicit publication — never inferred from relationship or Share.
 */
export async function publishVehicleToNetwork(params: {
  dealerId: string;
  vehicleId: string;
}) {
  const v = await prisma.vehicle.findFirst({
    where: { id: params.vehicleId, dealerId: params.dealerId },
  });
  if (!v) return { ok: false as const, error: "not_found" };
  if (!NETWORK_ELIGIBLE_RELATIONSHIPS.includes(v.dealerRelationship)) {
    return {
      ok: false as const,
      error: "relationship_not_publishable",
      message: "רק רכב בבעלות/מלאי ניתן לפרסם לרשת. Offer/Trade-in נשארים פרטיים.",
    };
  }
  if (!v.mediaReady) {
    return {
      ok: false as const,
      error: "media_not_ready",
      message: "נדרשות תמונות חוץ+פנים לפני פרסום לרשת.",
    };
  }
  if (v.status !== "ACTIVE") {
    return { ok: false as const, error: "not_active" };
  }
  const updated = await prisma.vehicle.update({
    where: { id: v.id },
    data: { visibility: "ANONYMOUS_NETWORK" },
  });
  const { rematchAfterInventoryMutation } = await import(
    "@/services/matching/inventory-rematch"
  );
  await rematchAfterInventoryMutation({
    vehicleId: updated.id,
    sellerDealerId: params.dealerId,
  });
  return { ok: true as const, vehicle: updated };
}

export async function removeVehicleFromNetwork(params: {
  dealerId: string;
  vehicleId: string;
}) {
  const v = await prisma.vehicle.findFirst({
    where: { id: params.vehicleId, dealerId: params.dealerId },
  });
  if (!v) return { ok: false as const, error: "not_found" };
  const updated = await prisma.vehicle.update({
    where: { id: v.id },
    data: { visibility: "PRIVATE" },
  });
  return { ok: true as const, vehicle: updated };
}

/**
 * Candidate / offer → Owned inventory. Does NOT auto-publish.
 */
export async function convertToOwnedInventory(params: {
  dealerId: string;
  vehicleId: string;
}) {
  const v = await prisma.vehicle.findFirst({
    where: { id: params.vehicleId, dealerId: params.dealerId },
  });
  if (!v) return { ok: false as const, error: "not_found" };
  const updated = await prisma.vehicle.update({
    where: { id: v.id },
    data: {
      dealerRelationship: "OWNED",
      // Keep PRIVATE unless already ANONYMOUS_NETWORK — never force publish
      visibility: v.visibility === "ANONYMOUS_NETWORK" ? "ANONYMOUS_NETWORK" : "PRIVATE",
    },
  });
  return { ok: true as const, vehicle: updated };
}

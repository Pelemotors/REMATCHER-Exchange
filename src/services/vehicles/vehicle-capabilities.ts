import type { DealerVehicleRelationship } from "@prisma/client";

/** Relationships that count as the dealer's real stock. */
export const OWNED_INVENTORY_RELATIONSHIPS: DealerVehicleRelationship[] = [
  "OWNED",
  "INVENTORY",
];

/** In review — not stock. Never treat as owned inventory. */
export const REVIEW_RELATIONSHIPS: DealerVehicleRelationship[] = [
  "OFFERED_TO_ME",
  "TRADE_IN_CANDIDATE",
];

export type VehicleCapabilityFlags = {
  canPublishToNetwork: boolean;
  canPublishToCatalog: boolean;
  canOutboundShare: boolean;
  canMarkSold: boolean;
  canConvertToOwned: boolean;
  canRunMarketChecks: boolean;
  canEdit: boolean;
  canArchive: boolean;
};

export function isOwnedInventoryRelationship(
  relationship: string | null | undefined
): boolean {
  return (
    relationship === "OWNED" || relationship === "INVENTORY"
  );
}

export function isReviewRelationship(
  relationship: string | null | undefined
): boolean {
  return (
    relationship === "OFFERED_TO_ME" ||
    relationship === "TRADE_IN_CANDIDATE"
  );
}

export function isConvertibleToOwned(
  relationship: string | null | undefined
): boolean {
  return isReviewRelationship(relationship);
}

/**
 * Single presentation + service policy for vehicle actions.
 * Backend mutations still re-check these flags; UI must not invent extras.
 */
export function vehicleCapabilities(input: {
  dealerRelationship?: string | null;
  status?: string | null;
}): VehicleCapabilityFlags {
  const rel = input.dealerRelationship ?? null;
  const status = (input.status ?? "ACTIVE").toUpperCase();
  const active = status === "ACTIVE";
  const owned = isOwnedInventoryRelationship(rel);
  const review = isReviewRelationship(rel);

  if (rel === "EXTERNAL") {
    return {
      canPublishToNetwork: false,
      canPublishToCatalog: false,
      canOutboundShare: false,
      canMarkSold: false,
      canConvertToOwned: false,
      canRunMarketChecks: true,
      canEdit: false,
      canArchive: false,
    };
  }

  return {
    canPublishToNetwork: owned && active,
    canPublishToCatalog: owned && active,
    canOutboundShare: owned && active,
    canMarkSold: owned && active,
    canConvertToOwned: review && active,
    canRunMarketChecks: Boolean(rel) && status !== "ARCHIVED",
    canEdit: (owned || review) && status !== "ARCHIVED",
    canArchive: owned && active,
  };
}

export function relationshipBadgeHe(
  relationship: string | null | undefined
): string | null {
  switch (relationship) {
    case "OFFERED_TO_ME":
      return "שוקל לקנות";
    case "TRADE_IN_CANDIDATE":
      return "טרייד מלקוח";
    default:
      return null;
  }
}

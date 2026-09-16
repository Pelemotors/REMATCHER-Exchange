import type { DealerVehicleRelationship } from "@prisma/client";

/** Relationships allowed for explicit catalog publication (never auto). */
export const CATALOG_ELIGIBLE_RELATIONSHIPS: DealerVehicleRelationship[] = [
  "OWNED",
  "INVENTORY",
];

/** Never publish these to a public catalog. */
export const CATALOG_BLOCKED_RELATIONSHIPS: DealerVehicleRelationship[] = [
  "OFFERED_TO_ME",
  "TRADE_IN_CANDIDATE",
  "EXTERNAL",
];

export type CatalogEligibilityInput = {
  status: string;
  dealerRelationship: DealerVehicleRelationship;
  dealerId: string;
};

export type CatalogEligibilityResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * Pure eligibility — OWNED does not auto-mean public; blocked relationships never publish.
 * EXTERNAL_VEHICLE in product language maps to Prisma enum EXTERNAL.
 */
export function checkCatalogPublishEligibility(
  vehicle: CatalogEligibilityInput,
  dealerId: string
): CatalogEligibilityResult {
  if (vehicle.dealerId !== dealerId) {
    return {
      ok: false,
      code: "not_found",
      message: "הרכב לא נמצא במלאי שלך.",
    };
  }
  if (vehicle.status !== "ACTIVE") {
    return {
      ok: false,
      code: "not_active",
      message: "רק רכב פעיל ניתן לפרסם בקטלוג.",
    };
  }
  if (CATALOG_BLOCKED_RELATIONSHIPS.includes(vehicle.dealerRelationship)) {
    return {
      ok: false,
      code: "relationship_not_publishable",
      message:
        "Offer / Trade-in / External לא מתפרסמים בקטלוג ציבורי — רק בעלות או מלאי.",
    };
  }
  if (!CATALOG_ELIGIBLE_RELATIONSHIPS.includes(vehicle.dealerRelationship)) {
    return {
      ok: false,
      code: "relationship_not_publishable",
      message: "סוג הקשר לרכב לא מאפשר פרסום לקטלוג.",
    };
  }
  return { ok: true };
}

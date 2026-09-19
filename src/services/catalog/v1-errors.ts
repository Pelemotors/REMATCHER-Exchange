import type { V1ErrorCode } from "@/lib/api-v1/errors";

export function catalogDomainToV1(error: string | undefined): V1ErrorCode {
  switch (error) {
    case "not_found":
    case "catalog_required":
    case "catalog_not_found":
      return "CATALOG_NOT_FOUND";
    case "slug_taken":
      return "CATALOG_SLUG_TAKEN";
    case "slug_reserved":
      return "CATALOG_SLUG_RESERVED";
    case "slug_invalid":
    case "slug_too_short":
    case "slug_too_long":
    case "slug_required":
      return "CATALOG_SLUG_INVALID";
    case "no_contact_method":
      return "CATALOG_NO_CONTACT_METHOD";
    case "no_published_vehicles":
      return "CATALOG_NO_PUBLISHED_VEHICLES";
    case "relationship_not_publishable":
    case "not_active":
    case "not_eligible":
      return "CATALOG_VEHICLE_NOT_ELIGIBLE";
    case "publication_not_found":
    case "not_published":
      return "CATALOG_PUBLICATION_NOT_FOUND";
    case "invalid_phone":
      return "CATALOG_INVALID_PHONE";
    case "rate_limited":
      return "CATALOG_LEAD_RATE_LIMITED";
    case "retail_price_required":
    case "display_name_required":
      return "VALIDATION_FAILED";
    default:
      return "VALIDATION_INVALID_REQUEST";
  }
}

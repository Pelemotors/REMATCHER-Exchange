export const PUBLIC_CATALOG_EVENT_TYPES = [
  "CATALOG_VIEW",
  "VEHICLE_VIEW",
  "PHONE_CLICK",
] as const;

export const SERVER_ONLY_CATALOG_EVENT_TYPES = [
  "WHATSAPP_CLICK",
  "LEAD_SUBMITTED",
] as const;

export type PublicCatalogEventType = (typeof PUBLIC_CATALOG_EVENT_TYPES)[number];
export type ServerCatalogEventType =
  | PublicCatalogEventType
  | (typeof SERVER_ONLY_CATALOG_EVENT_TYPES)[number];

export function isPublicCatalogEventType(
  value: unknown
): value is PublicCatalogEventType {
  return (
    typeof value === "string" &&
    (PUBLIC_CATALOG_EVENT_TYPES as readonly string[]).includes(value)
  );
}

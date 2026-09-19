import { randomBytes } from "node:crypto";

/** Opaque URL-safe public listing id. Never equal to internal vehicleId. */
export function newCatalogPublicId(): string {
  return randomBytes(12).toString("base64url");
}

export function isLikelyInternalId(value: string): boolean {
  return value.length >= 20 && !value.includes("-");
}

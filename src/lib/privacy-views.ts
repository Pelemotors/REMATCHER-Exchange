/** Privacy-safe DTOs — no dealer identity / private commercial data before Reveal */

function provenanceValue(provenance: unknown, key: string): string | number | null {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return null;
  const value = (provenance as Record<string, unknown>)[key];
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) {
    const inner = (value as { value?: unknown }).value;
    if (typeof inner === "string" || typeof inner === "number") return inner;
  }
  return null;
}

function provenanceArray(provenance: unknown, key: string): string[] {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return [];
  const value = (provenance as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

export function toBuyerMatchView(vehicle: {
  make: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  mileage: number | null;
  color: string | null;
  region: string | null;
  b2bPrice?: number | null;
  ownershipHand: number | null;
  ownershipType?: string | null;
  dealerId: string;
  fieldProvenance?: unknown;
}) {
  return {
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    year: vehicle.year,
    mileage: vehicle.mileage,
    color: vehicle.color,
    region: vehicle.region,
    ownershipHand: vehicle.ownershipHand,
    ownershipType:
      vehicle.ownershipType ??
      (provenanceValue(vehicle.fieldProvenance, "ownershipType") as string | null) ?? null,
    fuelType:
      (provenanceValue(vehicle.fieldProvenance, "fuel") as string | null) ??
      (provenanceValue(vehicle.fieldProvenance, "fuelType") as string | null),
    engineDisplacementCc:
      (provenanceValue(vehicle.fieldProvenance, "engineDisplacementCc") as number | null) ?? null,
    features: provenanceArray(vehicle.fieldProvenance, "features"),
    verifiedDealer: true,
    // Explicitly omit: b2bPrice, sellerFloor, dealerId, commercial internals
  };
}

export function toSellerOpportunityView(
  demand: { confirmedJson: unknown },
  evaluation: unknown
) {
  const json = (demand.confirmedJson ?? {}) as Record<string, unknown>;
  return {
    demandSummary: {
      make: json.make,
      model: json.model,
      yearMin: json.yearMin,
      trimPreference: json.trimPreference,
      // Never expose buyer budget / hard max / stretch to Seller
    },
    budgetRelationship: json.budgetMax != null ? "relationship_only" : null,
    evaluation,
    buyerIdentity: null,
  };
}

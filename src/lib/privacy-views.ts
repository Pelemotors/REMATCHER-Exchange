/** Privacy-safe DTOs — no dealer identity before Reveal */

export function toBuyerMatchView(vehicle: {
  make: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  mileage: number | null;
  color: string | null;
  region: string | null;
  b2bPrice: number | null;
  ownershipHand: number | null;
  dealerId: string;
}) {
  return {
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    year: vehicle.year,
    mileage: vehicle.mileage,
    color: vehicle.color,
    region: vehicle.region,
    b2bPrice: vehicle.b2bPrice,
    ownershipHand: vehicle.ownershipHand,
    verifiedDealer: true,
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
      budgetMax: json.budgetMax,
      trimPreference: json.trimPreference,
    },
    budgetRelationship: json.budgetMax ? "relationship_only" : null,
    evaluation,
    buyerIdentity: null,
  };
}

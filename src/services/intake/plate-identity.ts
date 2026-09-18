import "server-only";
import type { GovLookupState } from "@/services/identity/gov-vehicle";
import type { GovVehicleIdentity } from "@/services/identity/gov-vehicle";
import { toPrismaJson } from "@/lib/prisma-json";
import type { Prisma } from "@prisma/client";

export type PlateIdentityState =
  | "PLATE_MISSING"
  | "PLATE_FOUND_GOV_FOUND"
  | "PLATE_FOUND_GOV_NOT_FOUND"
  | "PLATE_FOUND_GOV_UNAVAILABLE"
  | "PLATE_FOUND_GOV_INVALID";

export function derivePlateIdentityState(input: {
  plateNormalized?: string | null;
  govState?: string | null;
}): PlateIdentityState {
  if (!input.plateNormalized?.trim()) return "PLATE_MISSING";
  switch (input.govState) {
    case "FOUND":
      return "PLATE_FOUND_GOV_FOUND";
    case "NOT_FOUND":
      return "PLATE_FOUND_GOV_NOT_FOUND";
    case "UNAVAILABLE":
      return "PLATE_FOUND_GOV_UNAVAILABLE";
    case "INVALID_PLATE":
      return "PLATE_FOUND_GOV_INVALID";
    default:
      return "PLATE_FOUND_GOV_NOT_FOUND";
  }
}

/** Prisma update payload after GOV lookup when plate is already normalized. */
export function govLookupUpdateForKnownPlate(params: {
  govState: GovLookupState;
  plateNormalized: string;
  govIdentity: GovVehicleIdentity | null;
  provenance: Record<string, unknown>;
  lowOcr: boolean;
}): {
  govState: GovLookupState;
  govIdentityJson?: Prisma.InputJsonValue;
  govLookedUpAt: Date;
  status: "READY" | "NEEDS_INFO";
  reviewStatus: "NONE" | "PENDING";
  missingFields: Prisma.InputJsonValue;
  confidenceBand: string;
  conflictsJson?: Prisma.InputJsonValue;
  fieldProvenance?: Prisma.InputJsonValue;
} {
  const { govState, plateNormalized, govIdentity, provenance, lowOcr } = params;

  if (govState === "FOUND" && govIdentity) {
    return {
      govState,
      govIdentityJson: toPrismaJson(govIdentity),
      govLookedUpAt: new Date(),
      status: "READY",
      reviewStatus: "NONE",
      missingFields: toPrismaJson([]),
      confidenceBand: "HIGH",
      fieldProvenance: toPrismaJson({
        ...provenance,
        govIdentity: { source: "GOV", confidence: 1 },
      }),
    };
  }

  const plateKnownNonFound =
    govState === "NOT_FOUND" ||
    govState === "UNAVAILABLE" ||
    govState === "INVALID_PLATE";

  if (plateKnownNonFound) {
    return {
      govState,
      govLookedUpAt: new Date(),
      status: "READY",
      reviewStatus: "NONE",
      missingFields: toPrismaJson([]),
      confidenceBand: lowOcr ? "LOW" : "MEDIUM",
      conflictsJson: toPrismaJson([
        {
          type: "gov_plate_unverified",
          plate: plateNormalized,
          govState,
        },
      ]),
    };
  }

  return {
    govState,
    govLookedUpAt: new Date(),
    status: "NEEDS_INFO",
    reviewStatus: "PENDING",
    missingFields: toPrismaJson([]),
    confidenceBand: lowOcr ? "LOW" : "MEDIUM",
  };
}

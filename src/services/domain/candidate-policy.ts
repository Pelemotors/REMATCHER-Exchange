/**
 * Canonical Candidate domain policy — derived business state only.
 * No schema migration. Storage fields remain as-is.
 */
import "server-only";
import type { Prisma } from "@prisma/client";

export const ALLOWED_BUYER_BANDS = ["STRONG", "GOOD", "ALTERNATIVE"] as const;

/** Prisma where-clause for buyer-visible Qualified Candidates (server gate). */
export const BUYER_VISIBLE_MATCH_WHERE = {
  status: "VALIDATED" as const,
  resolutionState: "RESOLVED" as const,
  scoreBand: { in: [...ALLOWED_BUYER_BANDS] },
} satisfies Prisma.CandidateMatchWhereInput;

export type BlockingRequirementCode =
  | "PRICE"
  | "MILEAGE"
  | "YEAR"
  | "TRIM"
  | "COLOR"
  | "FUEL"
  | "DRIVETRAIN"
  | "TRANSMISSION"
  | "SEATS"
  | "HAND"
  | "REGION"
  | "AVAILABILITY"
  | "VEHICLE_IDENTITY"
  | "OTHER";

export type CandidateLifecycleState =
  | "HIDDEN_PARTIAL"
  | "HIDDEN_VALIDATING"
  | "QUALIFIED"
  | "WAITING_BUYER"
  | "WAITING_SELLER"
  | "MUTUAL"
  | "REVEALED"
  | "CLOSED";

const FIELD_TO_CODE: Record<string, BlockingRequirementCode> = {
  price: "PRICE",
  mileage: "MILEAGE",
  year: "YEAR",
  trim: "TRIM",
  color: "COLOR",
  fuel: "FUEL",
  drivetrain: "DRIVETRAIN",
  transmission: "TRANSMISSION",
  seats: "SEATS",
  hand: "HAND",
  region: "REGION",
  vehicleIdentity: "VEHICLE_IDENTITY",
};

export function mapBlockingFieldToCode(field: string): BlockingRequirementCode {
  return FIELD_TO_CODE[field] ?? "OTHER";
}

/**
 * "May REMATCHER involve the Buyer right now?"
 * Pure policy — callers still enforce tenancy separately.
 */
export function canPresentCandidateToBuyer(input: {
  status: string;
  resolutionState: string;
  scoreBand: string | null | undefined;
  demandStatus?: string | null;
  vehicleStatus?: string | null;
}): boolean {
  if (input.demandStatus && input.demandStatus !== "ACTIVE") return false;
  if (
    input.vehicleStatus &&
    (input.vehicleStatus === "SOLD" || input.vehicleStatus === "ARCHIVED")
  ) {
    return false;
  }
  if (input.status !== "VALIDATED") return false;
  if (input.resolutionState !== "RESOLVED") return false;
  if (
    !input.scoreBand ||
    !(ALLOWED_BUYER_BANDS as readonly string[]).includes(input.scoreBand)
  ) {
    return false;
  }
  return true;
}

/** What currently prevents Qualification (internal codes only). */
export function getBlockingRequirementsForCandidate(input: {
  resolutionState: string;
  status: string;
  decisionBlockingUnknowns?: unknown;
  openEnrichmentFields?: string[];
  pendingValidationTypes?: string[];
}): BlockingRequirementCode[] {
  const codes = new Set<BlockingRequirementCode>();

  const unknowns = Array.isArray(input.decisionBlockingUnknowns)
    ? (input.decisionBlockingUnknowns as string[])
    : [];
  for (const f of unknowns) codes.add(mapBlockingFieldToCode(f));

  for (const f of input.openEnrichmentFields ?? []) {
    codes.add(mapBlockingFieldToCode(f));
  }

  for (const t of input.pendingValidationTypes ?? []) {
    if (t === "AVAILABILITY") codes.add("AVAILABILITY");
    if (t === "B2B_PRICE") codes.add("PRICE");
  }

  if (
    input.resolutionState === "NEEDS_INFORMATION" &&
    codes.size === 0
  ) {
    codes.add("OTHER");
  }

  if (
    input.status === "PENDING_VALIDATION" &&
    !codes.has("AVAILABILITY") &&
    !codes.has("PRICE")
  ) {
    codes.add("AVAILABILITY");
  }

  return [...codes];
}

/**
 * Derived lifecycle for diagnostics / admin — not a DB column.
 */
export function getCandidateLifecycleState(input: {
  status: string;
  resolutionState: string;
  scoreBand?: string | null;
  demandStatus?: string | null;
  vehicleStatus?: string | null;
  buyerInterestStatus?: string | null;
  sellerOpportunityStatus?: string | null;
  sellerInterestStatus?: string | null;
  hasMutual?: boolean;
  hasReveal?: boolean;
}): CandidateLifecycleState {
  if (
    input.vehicleStatus === "SOLD" ||
    input.vehicleStatus === "ARCHIVED" ||
    input.demandStatus === "CANCELLED" ||
    input.demandStatus === "EXPIRED" ||
    input.status === "REJECTED" ||
    input.status === "HIDDEN"
  ) {
    return "CLOSED";
  }

  if (input.hasReveal) return "REVEALED";
  if (input.hasMutual) return "MUTUAL";

  if (
    input.sellerInterestStatus === "INTERESTED" &&
    input.buyerInterestStatus === "INTERESTED"
  ) {
    return "MUTUAL";
  }

  if (input.buyerInterestStatus === "INTERESTED") {
    return "WAITING_SELLER";
  }

  if (
    canPresentCandidateToBuyer({
      status: input.status,
      resolutionState: input.resolutionState,
      scoreBand: input.scoreBand,
      demandStatus: input.demandStatus,
      vehicleStatus: input.vehicleStatus,
    })
  ) {
    return "QUALIFIED";
  }

  if (input.status === "PENDING_VALIDATION") {
    return "HIDDEN_VALIDATING";
  }

  if (input.resolutionState === "NEEDS_INFORMATION") {
    return "HIDDEN_PARTIAL";
  }

  return "CLOSED";
}

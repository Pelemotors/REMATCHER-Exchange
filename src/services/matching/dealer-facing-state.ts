import type { CandidateLifecycleState } from "@/services/domain/candidate-policy";

/** Dealer-facing match state — never expose BuyerInterest / SellerOpportunity names. */
export type DealerFacingMatchState =
  | "MATCH_FOUND"
  | "WAITING_OTHER_SIDE"
  | "CONTACT_READY"
  | "NOT_RELEVANT"
  | "CLOSED";

export function toDealerFacingMatchState(input: {
  lifecycle: CandidateLifecycleState;
  buyerInterestStatus?: string | null;
  sellerInterestStatus?: string | null;
}): DealerFacingMatchState {
  if (input.buyerInterestStatus === "REJECTED" || input.sellerInterestStatus === "REJECTED") {
    return "NOT_RELEVANT";
  }
  if (input.lifecycle === "REVEALED" || input.lifecycle === "MUTUAL") {
    return "CONTACT_READY";
  }
  if (input.lifecycle === "WAITING_SELLER") return "WAITING_OTHER_SIDE";
  if (input.lifecycle === "QUALIFIED" || input.lifecycle === "WAITING_BUYER") {
    return "MATCH_FOUND";
  }
  return "CLOSED";
}

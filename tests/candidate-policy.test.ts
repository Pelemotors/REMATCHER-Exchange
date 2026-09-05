/**
 * Canonical Candidate policy — visibility / blockers / lifecycle.
 */
import { describe, expect, it } from "vitest";
import {
  canPresentCandidateToBuyer,
  getBlockingRequirementsForCandidate,
  getCandidateLifecycleState,
  BUYER_VISIBLE_MATCH_WHERE,
} from "@/services/domain/candidate-policy";

describe("canPresentCandidateToBuyer", () => {
  it("allows only VALIDATED + RESOLVED + allowed band", () => {
    expect(
      canPresentCandidateToBuyer({
        status: "VALIDATED",
        resolutionState: "RESOLVED",
        scoreBand: "GOOD",
        demandStatus: "ACTIVE",
        vehicleStatus: "ACTIVE",
      })
    ).toBe(true);
  });

  it("hides NEEDS_INFORMATION / Partial", () => {
    expect(
      canPresentCandidateToBuyer({
        status: "VALIDATED",
        resolutionState: "NEEDS_INFORMATION",
        scoreBand: null,
        demandStatus: "ACTIVE",
        vehicleStatus: "ACTIVE",
      })
    ).toBe(false);
  });

  it("hides PENDING_VALIDATION", () => {
    expect(
      canPresentCandidateToBuyer({
        status: "PENDING_VALIDATION",
        resolutionState: "RESOLVED",
        scoreBand: "STRONG",
        demandStatus: "ACTIVE",
        vehicleStatus: "ACTIVE",
      })
    ).toBe(false);
  });

  it("hides SOLD / inactive demand", () => {
    expect(
      canPresentCandidateToBuyer({
        status: "VALIDATED",
        resolutionState: "RESOLVED",
        scoreBand: "STRONG",
        demandStatus: "ACTIVE",
        vehicleStatus: "SOLD",
      })
    ).toBe(false);
    expect(
      canPresentCandidateToBuyer({
        status: "VALIDATED",
        resolutionState: "RESOLVED",
        scoreBand: "STRONG",
        demandStatus: "CANCELLED",
        vehicleStatus: "ACTIVE",
      })
    ).toBe(false);
  });

  it("hides HIDDEN band / NO_MATCH style", () => {
    expect(
      canPresentCandidateToBuyer({
        status: "VALIDATED",
        resolutionState: "RESOLVED",
        scoreBand: "HIDDEN",
        demandStatus: "ACTIVE",
        vehicleStatus: "ACTIVE",
      })
    ).toBe(false);
  });
});

describe("getBlockingRequirementsForCandidate", () => {
  it("maps decisionBlockingUnknowns + validation types", () => {
    const codes = getBlockingRequirementsForCandidate({
      resolutionState: "NEEDS_INFORMATION",
      status: "CANDIDATE",
      decisionBlockingUnknowns: ["mileage", "price", "drivetrain"],
      pendingValidationTypes: ["AVAILABILITY"],
    });
    expect(codes).toEqual(
      expect.arrayContaining(["MILEAGE", "PRICE", "DRIVETRAIN", "AVAILABILITY"])
    );
  });
});

describe("getCandidateLifecycleState", () => {
  it("derives QUALIFIED / WAITING_SELLER / REVEALED / HIDDEN_PARTIAL", () => {
    expect(
      getCandidateLifecycleState({
        status: "VALIDATED",
        resolutionState: "RESOLVED",
        scoreBand: "GOOD",
        demandStatus: "ACTIVE",
        vehicleStatus: "ACTIVE",
      })
    ).toBe("QUALIFIED");

    expect(
      getCandidateLifecycleState({
        status: "VALIDATED",
        resolutionState: "RESOLVED",
        scoreBand: "GOOD",
        demandStatus: "ACTIVE",
        vehicleStatus: "ACTIVE",
        buyerInterestStatus: "INTERESTED",
      })
    ).toBe("WAITING_SELLER");

    expect(
      getCandidateLifecycleState({
        status: "VALIDATED",
        resolutionState: "RESOLVED",
        scoreBand: "GOOD",
        demandStatus: "ACTIVE",
        vehicleStatus: "ACTIVE",
        hasMutual: true,
        hasReveal: true,
      })
    ).toBe("REVEALED");

    expect(
      getCandidateLifecycleState({
        status: "CANDIDATE",
        resolutionState: "NEEDS_INFORMATION",
        demandStatus: "ACTIVE",
        vehicleStatus: "ACTIVE",
      })
    ).toBe("HIDDEN_PARTIAL");
  });
});

describe("BUYER_VISIBLE_MATCH_WHERE", () => {
  it("matches Qualified gate shape", () => {
    expect(BUYER_VISIBLE_MATCH_WHERE.status).toBe("VALIDATED");
    expect(BUYER_VISIBLE_MATCH_WHERE.resolutionState).toBe("RESOLVED");
    expect(BUYER_VISIBLE_MATCH_WHERE.scoreBand).toEqual({
      in: ["STRONG", "GOOD", "ALTERNATIVE"],
    });
  });
});

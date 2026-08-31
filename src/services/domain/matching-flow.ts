import { prisma } from "@/lib/prisma";
import { getProductConfig } from "@/config/product";
import { explainMatch } from "@/services/ai";
import {
  demandProfileFromConstraints,
  evaluateMatch,
  scoreBandToEnum,
} from "@/services/matching/engine";
import {
  createNotification,
  logAppEvent,
  notifyDealerUsers,
} from "@/services/notifications";
import { toPrismaJson } from "@/lib/prisma-json";
import { addDays } from "date-fns";
import {
  toBuyerMatchView,
  toSellerOpportunityView,
} from "@/lib/privacy-views";
import { COPY, BRAND } from "@/config/brand";
import { createRevealFromMutualInterest } from "@/services/commercial/reveal-flow";

export { toBuyerMatchView, toSellerOpportunityView };

export async function runMatchingForDemand(demandId: string) {
  const demand = await prisma.demand.findUnique({
    where: { id: demandId, status: "ACTIVE" },
    include: { constraints: true },
  });
  if (!demand || !demand.confirmedJson) return [];

  const profile = demandProfileFromConstraints(
    demand.constraints,
    demand.confirmedJson
  );

  const vehicles = await prisma.vehicle.findMany({
    where: {
      status: "ACTIVE",
      dealerId: { not: demand.dealerId },
      b2bPrice: { not: null },
    },
  });

  const results = [];

  for (const vehicle of vehicles) {
    const evaluation = evaluateMatch(vehicle, profile);
    if (evaluation.overallBand === "HIDDEN") continue;

    const explanation = await explainMatch(evaluation);
    const needsValidation =
      vehicle.freshnessState === "STALE" ||
      vehicle.freshnessState === "VALIDATION_REQUIRED" ||
      vehicle.freshnessState === "UNKNOWN";

    const status = needsValidation ? "PENDING_VALIDATION" : "VALIDATED";

    const match = await prisma.candidateMatch.upsert({
      where: {
        demandId_vehicleId: { demandId, vehicleId: vehicle.id },
      },
      create: {
        demandId,
        vehicleId: vehicle.id,
        status,
        score: evaluation.score,
        scoreBand: scoreBandToEnum(evaluation.overallBand),
        hardPassed: evaluation.hardPassed,
        evaluationJson: toPrismaJson(evaluation),
        explanationJson: toPrismaJson(explanation),
        explanationText: explanation.summary,
      },
      update: {
        status,
        score: evaluation.score,
        scoreBand: scoreBandToEnum(evaluation.overallBand),
        hardPassed: evaluation.hardPassed,
        evaluationJson: toPrismaJson(evaluation),
        explanationJson: toPrismaJson(explanation),
        explanationText: explanation.summary,
      },
    });

    if (needsValidation && status === "PENDING_VALIDATION") {
      const existing = await prisma.validationEvent.findFirst({
        where: {
          candidateMatchId: match.id,
          type: "AVAILABILITY",
          status: "PENDING",
        },
      });
      if (!existing) {
        await prisma.validationEvent.create({
          data: {
            type: "AVAILABILITY",
            vehicleId: vehicle.id,
            dealerId: vehicle.dealerId,
            candidateMatchId: match.id,
            status: "PENDING",
          },
        });
        await notifyDealerUsers(vehicle.dealerId, {
          type: "VALIDATION_REQUEST",
          title: "נדרש אימות",
          body: COPY.validationAvailability,
          link: `/validations`,
          entityType: "validation",
          entityId: match.id,
        });
      }
    }

    if (status === "VALIDATED") {
      await notifyDealerUsers(demand.dealerId, {
        type: "BUYER_MATCH",
        title:
          evaluation.overallBand === "STRONG"
            ? COPY.matchStrong
            : COPY.matchPossible,
        body: explanation.summary,
        link: `/matches`,
        entityType: "match",
        entityId: match.id,
      });
    }

    await logAppEvent({
      eventType: "candidate_match_created",
      entityType: "CandidateMatch",
      entityId: match.id,
      dealerId: demand.dealerId,
    });

    results.push(match);
  }

  return results;
}

export async function confirmAvailabilityValidation(
  validationId: string,
  dealerId: string,
  available: boolean
) {
  const validation = await prisma.validationEvent.findFirst({
    where: { id: validationId, dealerId, type: "AVAILABILITY" },
    include: { candidateMatch: true, vehicle: true },
  });
  if (!validation) throw new Error("NOT_FOUND");

  // I-04: Validation ≠ Interest
  await prisma.validationEvent.update({
    where: { id: validationId },
    data: {
      status: available ? "CONFIRMED" : "REJECTED",
      response: available ? "available" : "sold",
      respondedAt: new Date(),
    },
  });

  if (!available) {
    await prisma.vehicle.update({
      where: { id: validation.vehicleId },
      data: { status: "SOLD" },
    });
    if (validation.candidateMatchId) {
      await prisma.candidateMatch.update({
        where: { id: validation.candidateMatchId },
        data: { status: "REJECTED" },
      });
    }
    return;
  }

  await prisma.vehicle.update({
    where: { id: validation.vehicleId },
    data: {
      lastAvailabilityConfirmedAt: new Date(),
      freshnessState: "FRESH",
    },
  });

  if (validation.candidateMatchId) {
    const match = validation.candidateMatch!;
    let newStatus = "VALIDATED";

    if (!validation.vehicle.b2bPrice) {
      newStatus = "PENDING_VALIDATION";
      await prisma.validationEvent.create({
        data: {
          type: "B2B_PRICE",
          vehicleId: validation.vehicleId,
          dealerId,
          candidateMatchId: match.id,
          status: "PENDING",
        },
      });
    } else {
      await prisma.candidateMatch.update({
        where: { id: match.id },
        data: { status: "VALIDATED" },
      });
      const demand = await prisma.demand.findUnique({
        where: { id: match.demandId },
      });
      if (demand) {
        await notifyDealerUsers(demand.dealerId, {
          type: "BUYER_MATCH",
          title: "נמצאה התאמה",
          body: "התאמה מאומתת זמינה לצפייה",
          link: `/matches/${match.id}`,
          entityType: "match",
          entityId: match.id,
        });
      }
    }

    if (newStatus === "PENDING_VALIDATION") {
      await prisma.candidateMatch.update({
        where: { id: match.id },
        data: { status: "PENDING_VALIDATION" },
      });
    }
  }
}

export async function recordBuyerInterest(params: {
  candidateMatchId: string;
  dealerId: string;
  userId: string;
  status: "INTERESTED" | "REJECTED" | "NO_RESPONSE";
  rejectReason?: string;
}) {
  const match = await prisma.candidateMatch.findFirst({
    where: {
      id: params.candidateMatchId,
      demand: { dealerId: params.dealerId },
      status: "VALIDATED",
    },
    include: { demand: true, vehicle: true },
  });
  if (!match) throw new Error("NOT_FOUND");

  const interest = await prisma.buyerInterest.upsert({
    where: {
      candidateMatchId_dealerId: {
        candidateMatchId: params.candidateMatchId,
        dealerId: params.dealerId,
      },
    },
    create: {
      demandId: match.demandId,
      dealerId: params.dealerId,
      candidateMatchId: params.candidateMatchId,
      userId: params.userId,
      status: params.status,
      rejectReason: params.rejectReason,
    },
    update: {
      status: params.status,
      rejectReason: params.rejectReason,
    },
  });

  await logAppEvent({
    eventType:
      params.status === "INTERESTED"
        ? "buyer_interested"
        : params.status === "REJECTED"
          ? "buyer_rejected"
          : "buyer_no_response",
    entityType: "BuyerInterest",
    entityId: interest.id,
    dealerId: params.dealerId,
  });

  // I-05: Opportunity only after Buyer Interest
  if (params.status === "INTERESTED") {
    const existingOpp = await prisma.sellerOpportunity.findUnique({
      where: { candidateMatchId: params.candidateMatchId },
    });
    if (!existingOpp) {
      const opp = await prisma.sellerOpportunity.create({
        data: {
          candidateMatchId: params.candidateMatchId,
          buyerInterestId: interest.id,
          vehicleId: match.vehicleId,
        },
      });

      await notifyDealerUsers(match.vehicle.dealerId, {
        type: "SELLER_OPPORTUNITY",
        title: COPY.opportunity,
        body: "סוחר מאומת ברשת הביע עניין ברכב שלך",
        link: `/opportunities`,
        entityType: "opportunity",
        entityId: opp.id,
      });

      await logAppEvent({
        eventType: "seller_opportunity_created",
        entityType: "SellerOpportunity",
        entityId: opp.id,
        dealerId: match.vehicle.dealerId,
      });
    }
  }

  return interest;
}

export async function recordSellerInterest(params: {
  opportunityId: string;
  dealerId: string;
  userId: string;
  status: "INTERESTED" | "REJECTED" | "NO_RESPONSE";
  rejectReason?: string;
}) {
  const opp = await prisma.sellerOpportunity.findFirst({
    where: {
      id: params.opportunityId,
      vehicle: { dealerId: params.dealerId },
    },
    include: {
      buyerInterest: { include: { demand: true } },
      vehicle: true,
      candidateMatch: true,
    },
  });
  if (!opp) throw new Error("NOT_FOUND");

  const sellerInterest = await prisma.sellerInterest.upsert({
    where: { opportunityId: params.opportunityId },
    create: {
      opportunityId: params.opportunityId,
      dealerId: params.dealerId,
      userId: params.userId,
      status: params.status,
      rejectReason: params.rejectReason,
    },
    update: {
      status: params.status,
      rejectReason: params.rejectReason,
    },
  });

  await prisma.sellerOpportunity.update({
    where: { id: params.opportunityId },
    data: {
      status:
        params.status === "INTERESTED"
          ? "INTERESTED"
          : params.status === "REJECTED"
            ? "REJECTED"
            : "NO_RESPONSE",
    },
  });

  // Mutual Interest → Reveal (deterministic gate §39-40)
  if (
    params.status === "INTERESTED" &&
    opp.buyerInterest.status === "INTERESTED"
  ) {
    let mutual = await prisma.mutualInterest.findUnique({
      where: { sellerInterestId: sellerInterest.id },
    });
    if (!mutual) {
      mutual = await prisma.mutualInterest.create({
        data: { sellerInterestId: sellerInterest.id },
      });
      await logAppEvent({
        eventType: "mutual_interest_created",
        entityType: "MutualInterest",
        entityId: mutual.id,
      });
    }

    const reveal = await createRevealFromMutualInterest({
      mutualInterestId: mutual.id,
      sellerInterestId: sellerInterest.id,
      buyerDealerId: opp.buyerInterest.dealerId,
      sellerDealerId: params.dealerId,
      candidateMatchId: opp.candidateMatchId,
    });

    return { sellerInterest, mutual, reveal };
  }

  return { sellerInterest };
}

export function computeDemandExpiry() {
  return addDays(new Date(), 3);
}

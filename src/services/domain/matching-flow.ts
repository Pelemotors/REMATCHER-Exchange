import { prisma } from "@/lib/prisma";
import { getProductConfig } from "@/config/product";
import { explainMatch } from "@/services/ai";
import {
  scoreBandToEnum,
} from "@/services/matching/engine";
import {
  evaluateMatchV2,
  matchBandV2ToScoreBand,
  MATCH_ENGINE_VERSION,
} from "@/services/matching/engine-v2";
import {
  ensureSearchIntentForDemand,
  parseStructuredIntent,
} from "@/services/matching/search-intent-service";
import { emitExchangeEvent } from "@/services/exchange/events";
import { upsertMatchExchangeCase } from "@/services/exchange/cases";
import { runExchangeIntelligenceShadow } from "@/services/exchange/intelligence-shadow";
import {
  createNotification,
  logAppEvent,
  notifyDealerUsers,
} from "@/services/notifications";
import { notifyExpiringDemands, notifyFreshnessAttention } from "@/services/notifications/product-events";
import { toPrismaJson } from "@/lib/prisma-json";
import { addDays } from "date-fns";
import {
  toBuyerMatchView,
  toSellerOpportunityView,
} from "@/lib/privacy-views";
import { computeFreshnessState } from "@/services/inventory/freshness";
import { COPY, BRAND } from "@/config/brand";

import { createRevealFromMutualInterest } from "@/services/commercial/reveal-flow";

export async function runMatchingForDemand(demandId: string) {
  const demand = await prisma.demand.findUnique({
    where: { id: demandId, status: "ACTIVE" },
    include: { constraints: true },
  });
  if (!demand || !demand.confirmedJson) return [];

  await expireStaleDemands(demand.dealerId);
  await notifyExpiringDemands(demand.dealerId);

  const intentVersion = await ensureSearchIntentForDemand(demandId);
  const structuredIntent = parseStructuredIntent(
    intentVersion?.structuredIntent
  );

  const vehicles = await prisma.vehicle.findMany({
    where: {
      status: "ACTIVE",
      dealerId: { not: demand.dealerId },
    },
  });

  const results = [];

  for (const vehicle of vehicles) {
    const freshnessState = computeFreshnessState(vehicle);
    if (freshnessState !== vehicle.freshnessState) {
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { freshnessState },
      });
      vehicle.freshnessState = freshnessState;
      if (
        freshnessState === "STALE" ||
        freshnessState === "VALIDATION_REQUIRED"
      ) {
        const title = `${vehicle.make ?? ""} ${vehicle.model ?? ""} ${vehicle.year ?? ""}`.trim();
        await notifyFreshnessAttention(vehicle.dealerId, vehicle.id, title || "רכב");
      }
    }

    const evaluationV2 = evaluateMatchV2({
      vehicle,
      intent: structuredIntent,
      searchIntentVersionId: intentVersion?.id,
    });
    if (evaluationV2.band === "NO_MATCH") continue;

    // Compat evaluation shape for explainer / legacy consumers
    const evaluation = {
      overallBand: matchBandV2ToScoreBand(evaluationV2.band),
      score: evaluationV2.score,
      hardPassed: evaluationV2.hardPassed,
      fieldResults: evaluationV2.dimensions.map((d) => ({
        field: d.field,
        result:
          d.status === "MATCH" || d.status === "OPEN"
            ? ("MATCH" as const)
            : d.status === "UNKNOWN"
              ? ("UNKNOWN" as const)
              : ("MISMATCH" as const),
        label: d.field,
        detail: d.detail,
      })),
      gaps: [...evaluationV2.compromises, ...evaluationV2.unknowns],
      fits: evaluationV2.fits,
    };

    const explanation = await explainMatch(evaluation);
    const needsAvailability =
      vehicle.freshnessState === "STALE" ||
      vehicle.freshnessState === "VALIDATION_REQUIRED" ||
      vehicle.freshnessState === "UNKNOWN";
    const needsB2bPrice = vehicle.b2bPrice == null;
    const needsCriticalVerification = evaluationV2.verificationRequired;

    let status: "PENDING_VALIDATION" | "VALIDATED" =
      needsAvailability || needsB2bPrice || needsCriticalVerification
        ? "PENDING_VALIDATION"
        : "VALIDATED";

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
        searchIntentVersionId: intentVersion?.id ?? null,
        engineVersion: MATCH_ENGINE_VERSION,
        matchBandV2: evaluationV2.band,
        evaluationV2Json: toPrismaJson(evaluationV2),
      },
      update: {
        status,
        score: evaluation.score,
        scoreBand: scoreBandToEnum(evaluation.overallBand),
        hardPassed: evaluation.hardPassed,
        evaluationJson: toPrismaJson(evaluation),
        explanationJson: toPrismaJson(explanation),
        explanationText: explanation.summary,
        searchIntentVersionId: intentVersion?.id ?? null,
        engineVersion: MATCH_ENGINE_VERSION,
        matchBandV2: evaluationV2.band,
        evaluationV2Json: toPrismaJson(evaluationV2),
      },
    });

    await emitExchangeEvent({
      eventType: "MATCH_CREATED",
      dealerId: demand.dealerId,
      demandId,
      vehicleId: vehicle.id,
      candidateMatchId: match.id,
      evidenceType: "SYSTEM_OBSERVED",
      privacyClass: "DEALER_SCOPED",
      eventData: {
        band: evaluationV2.band,
        engineVersion: MATCH_ENGINE_VERSION,
        searchIntentVersionId: intentVersion?.id,
      },
      idempotencyKey: `match-created:${demandId}:${vehicle.id}:${intentVersion?.id ?? "legacy"}`,
    });

    await upsertMatchExchangeCase({
      dealerId: demand.dealerId,
      demandId,
      vehicleId: vehicle.id,
      candidateMatchId: match.id,
      searchIntentVersionId: intentVersion?.id,
      demandSnapshot: { id: demand.id, status: demand.status },
      vehicleSnapshot: {
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        mileage: vehicle.mileage,
        color: vehicle.color,
        trim: vehicle.trim,
        b2bPrice: vehicle.b2bPrice,
        retailPrice: vehicle.retailPrice,
        region: vehicle.region,
        freshnessState: vehicle.freshnessState,
      },
      matchEvaluationSnapshot: evaluationV2,
      searchIntentSnapshot: structuredIntent,
      rationale: explanation.summary,
    });

    // Shadow intelligence — never changes visibility
    if (status === "VALIDATED" || status === "PENDING_VALIDATION") {
      void runExchangeIntelligenceShadow({
        candidateMatchId: match.id,
        intent: structuredIntent,
        engine: evaluationV2,
        vehicle,
      }).catch(() => undefined);
    }

    if (needsAvailability && status === "PENDING_VALIDATION") {
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
          title: COPY.validationContext,
          body: "יש ביקוש רלוונטי לרכב שלך — הוא עדיין זמין?",
          link: `/validations?focus=${match.id}`,
          entityType: "validation",
          entityId: match.id,
        });
        await logAppEvent({
          eventType: "validation_requested",
          entityType: "ValidationEvent",
          entityId: match.id,
          dealerId: vehicle.dealerId,
          metadata: { type: "AVAILABILITY" },
        });
      }
    } else if (needsB2bPrice && status === "PENDING_VALIDATION") {
      const existing = await prisma.validationEvent.findFirst({
        where: {
          candidateMatchId: match.id,
          type: "B2B_PRICE",
          status: "PENDING",
        },
      });
      if (!existing) {
        await prisma.validationEvent.create({
          data: {
            type: "B2B_PRICE",
            vehicleId: vehicle.id,
            dealerId: vehicle.dealerId,
            candidateMatchId: match.id,
            status: "PENDING",
          },
        });
        await notifyDealerUsers(vehicle.dealerId, {
          type: "VALIDATION_REQUEST",
          title: COPY.validationContext,
          body: "נדרש מחיר B2B להמשך התאמה",
          link: `/validations?focus=${match.id}`,
          entityType: "validation",
          entityId: match.id,
        });
        await logAppEvent({
          eventType: "validation_requested",
          entityType: "ValidationEvent",
          entityId: match.id,
          dealerId: vehicle.dealerId,
          metadata: { type: "B2B_PRICE" },
        });
      }
    }

    if (status === "VALIDATED") {
      await notifyDealerUsers(demand.dealerId, {
        type: "BUYER_MATCH",
        title:
          evaluation.overallBand === "STRONG" || evaluation.overallBand === "GOOD"
            ? "נמצאה התאמה גבוהה לחיפוש שלך"
            : COPY.matchPossible,
        body: explanation.summary,
        link: `/matches?focus=${match.id}`,
        entityType: "match",
        entityId: match.id,
      });
      await emitExchangeEvent({
        eventType: "MATCH_PRESENTED",
        dealerId: demand.dealerId,
        demandId,
        vehicleId: vehicle.id,
        candidateMatchId: match.id,
        evidenceType: "SYSTEM_OBSERVED",
        privacyClass: "DEALER_SCOPED",
        idempotencyKey: `match-presented:${match.id}:${intentVersion?.id ?? "x"}`,
      });
      await logAppEvent({
        eventType: "match_validated",
        entityType: "CandidateMatch",
        entityId: match.id,
        dealerId: demand.dealerId,
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
    await logAppEvent({
      eventType: "vehicle_marked_sold",
      entityType: "Vehicle",
      entityId: validation.vehicleId,
      dealerId,
      metadata: { source: "availability_validation" },
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

  await logAppEvent({
    eventType: "vehicle_confirmed_available",
    entityType: "Vehicle",
    entityId: validation.vehicleId,
    dealerId,
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
          title: "נמצאה התאמה גבוהה לחיפוש שלך",
          body: "התאמה מאומתת זמינה לצפייה",
          link: `/matches?focus=${match.id}`,
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

  try {
    const { emitExchangeEvent } = await import("@/services/exchange/events");
    const { closeExchangeCaseOutcome } = await import(
      "@/services/exchange/cases"
    );
    if (params.status === "INTERESTED") {
      await emitExchangeEvent({
        eventType: "MATCH_INTERESTED",
        dealerId: params.dealerId,
        demandId: match.demandId,
        vehicleId: match.vehicleId,
        candidateMatchId: match.id,
        evidenceType: "SYSTEM_OBSERVED",
        privacyClass: "DEALER_SCOPED",
        idempotencyKey: `match-interested:${match.id}:${params.dealerId}`,
      });
    } else if (params.status === "REJECTED") {
      await emitExchangeEvent({
        eventType: "MATCH_DECLINED",
        dealerId: params.dealerId,
        demandId: match.demandId,
        vehicleId: match.vehicleId,
        candidateMatchId: match.id,
        evidenceType: "SYSTEM_OBSERVED",
        reason: params.rejectReason ?? null,
        privacyClass: "DEALER_SCOPED",
        idempotencyKey: `match-declined:${match.id}:${params.dealerId}`,
      });
      const irrelevant =
        /לא מה שחיפש|irrelevant|לא רלוונט|בכלל לא/i.test(
          params.rejectReason ?? ""
        );
      await closeExchangeCaseOutcome({
        candidateMatchId: match.id,
        relevanceOutcome: irrelevant ? "IRRELEVANT" : "UNKNOWN",
        transactionOutcome: "NO_DEAL",
        outcomeReasonCategory: irrelevant ? "SPEC_MISMATCH" : "DEALER_DECISION",
        evidenceType: "SYSTEM_OBSERVED",
      });
    }
  } catch {
    // non-blocking
  }

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
        link: `/opportunities?focus=${opp.id}`,
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

  await logAppEvent({
    eventType:
      params.status === "INTERESTED"
        ? "seller_interested"
        : params.status === "REJECTED"
          ? "seller_rejected"
          : "seller_no_response",
    entityType: "SellerInterest",
    entityId: sellerInterest.id,
    dealerId: params.dealerId,
  });

  // Mutual Interest → Reveal (deterministic gate §39-40)
  if (
    params.status === "INTERESTED" &&
    opp.buyerInterest.status === "INTERESTED"
  ) {
    try {
      const { emitExchangeEvent } = await import("@/services/exchange/events");
      await emitExchangeEvent({
        eventType: "MATCH_MUTUAL_INTEREST",
        dealerId: params.dealerId,
        vehicleId: opp.vehicleId,
        candidateMatchId: opp.candidateMatchId,
        evidenceType: "BILATERAL_CONFIRMED",
        privacyClass: "DEALER_SCOPED",
        idempotencyKey: `match-mutual:${opp.candidateMatchId}`,
      });
    } catch {
      // non-blocking
    }
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

export async function expireStaleDemands(dealerId?: string) {
  const now = new Date();
  const demands = await prisma.demand.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: now },
      ...(dealerId ? { dealerId } : {}),
    },
  });
  for (const d of demands) {
    await prisma.demand.update({
      where: { id: d.id },
      data: { status: "EXPIRED" },
    });
    await notifyDealerUsers(d.dealerId, {
      type: "DEMAND_EXPIRY",
      title: "חיפוש פג תוקף",
      body: "חיפוש פעיל הסתיים — אפשר לחדש או לפתוח חדש",
      link: `/demand?edit=${d.id}`,
      entityType: "demand",
      entityId: d.id,
    });
    await logAppEvent({
      eventType: "demand_expired",
      entityType: "Demand",
      entityId: d.id,
      dealerId: d.dealerId,
    });
  }
  return demands.length;
}

export { toBuyerMatchView, toSellerOpportunityView };

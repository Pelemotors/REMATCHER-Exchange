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
import { recordActivationMilestone } from "@/services/activation/milestones";
import { isKillSwitchOn } from "@/config/kill-switches";

export async function runMatchingForDemand(demandId: string) {
  if (isKillSwitchOn("matching_new")) {
    return [];
  }
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
    if (
      evaluationV2.resolutionState === "RESOLVED" &&
      evaluationV2.band === "NO_MATCH"
    ) {
      // Invalidate any previously visible candidate (e.g. price changed after enrichment)
      const existing = await prisma.candidateMatch.findUnique({
        where: {
          demandId_vehicleId: { demandId, vehicleId: vehicle.id },
        },
      });
      if (existing) {
        await prisma.candidateMatch.update({
          where: { id: existing.id },
          data: {
            status: "HIDDEN",
            scoreBand: "NO_MATCH",
            matchBandV2: "NO_MATCH",
            resolutionState: "RESOLVED",
            hardPassed: false,
            score: evaluationV2.score,
            engineVersion: MATCH_ENGINE_VERSION,
            evaluationV2Json: toPrismaJson(evaluationV2),
            decisionBlockingUnknowns: toPrismaJson([]),
            explanationText: "אין התאמה מסחרית לאחר עדכון הפרטים",
          },
        });
        await emitExchangeEvent({
          eventType: "MATCH_INVALIDATED",
          dealerId: demand.dealerId,
          demandId,
          vehicleId: vehicle.id,
          candidateMatchId: existing.id,
          evidenceType: "SYSTEM_OBSERVED",
          privacyClass: "DEALER_SCOPED",
          eventData: {
            reason: "no_match_after_reeval",
            engineVersion: MATCH_ENGINE_VERSION,
          },
          idempotencyKey: `match-invalidated:${demandId}:${vehicle.id}:${vehicle.updatedAt.toISOString()}`,
        });
        const { cancelOpenRequestsForVehicleDemand } = await import(
          "@/services/matching/information-request"
        );
        await cancelOpenRequestsForVehicleDemand({
          vehicleId: vehicle.id,
          demandId,
        });
      }
      continue;
    }

    const isPotential =
      evaluationV2.resolutionState === "NEEDS_INFORMATION";

    // Compat evaluation shape for explainer / legacy consumers
    const evaluation = {
      overallBand: isPotential
        ? ("HIDDEN" as const)
        : matchBandV2ToScoreBand(evaluationV2.band),
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
      gaps: [
        ...evaluationV2.compromises,
        ...evaluationV2.unknowns,
        ...(evaluationV2.whyPotential ? [evaluationV2.whyPotential] : []),
      ],
      fits: evaluationV2.knownFits.length
        ? evaluationV2.knownFits
        : evaluationV2.fits,
    };

    const explanation = isPotential
      ? {
          summary:
            evaluationV2.whyPotential ??
            "התאמה אפשרית — חסרים כמה פרטים כדי לדעת אם היא מתאימה.",
          fits: evaluationV2.knownFits,
          gaps: evaluationV2.decisionBlockingUnknowns.map(
            (f) => `חסר: ${f}`
          ),
        }
      : await explainMatch(evaluation);

    const needsAvailability =
      !isPotential &&
      (vehicle.freshnessState === "STALE" ||
        vehicle.freshnessState === "VALIDATION_REQUIRED" ||
        vehicle.freshnessState === "UNKNOWN");
    const needsB2bPrice = !isPotential && vehicle.b2bPrice == null;

    let status: "CANDIDATE" | "PENDING_VALIDATION" | "VALIDATED" = isPotential
      ? "CANDIDATE"
      : needsAvailability || needsB2bPrice
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
        resolutionState: evaluationV2.resolutionState,
        decisionBlockingUnknowns: toPrismaJson(
          evaluationV2.decisionBlockingUnknowns
        ),
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
        resolutionState: evaluationV2.resolutionState,
        decisionBlockingUnknowns: toPrismaJson(
          evaluationV2.decisionBlockingUnknowns
        ),
      },
    });

    if (isPotential) {
      await emitExchangeEvent({
        eventType: "POTENTIAL_MATCH_IDENTIFIED",
        dealerId: demand.dealerId,
        demandId,
        vehicleId: vehicle.id,
        candidateMatchId: match.id,
        evidenceType: "SYSTEM_OBSERVED",
        privacyClass: "DEALER_SCOPED",
        eventData: {
          decisionBlockingUnknowns: evaluationV2.decisionBlockingUnknowns,
          whyPotential: evaluationV2.whyPotential,
          searchIntentVersionId: intentVersion?.id,
        },
        idempotencyKey: `potential-match:${demandId}:${vehicle.id}:${intentVersion?.id ?? "legacy"}`,
      });
      // Exchange-initiated seller enrichment — buyer never sees Potential
      try {
        const { ensureExchangeInitiatedEnrichment } = await import(
          "@/services/matching/information-request"
        );
        await ensureExchangeInitiatedEnrichment({
          candidateMatchId: match.id,
        });
      } catch {
        // non-blocking — Candidate remains hidden from buyer
      }
    } else {
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
    }

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

    // Controlled Live Intelligence — ranking assist; Hard/NO_MATCH remain deterministic
    if (!isPotential && (status === "VALIDATED" || status === "PENDING_VALIDATION")) {
      try {
        const { applyControlledIntelligenceRanking } = await import(
          "@/services/exchange/intelligence-live"
        );
        const live = await applyControlledIntelligenceRanking({
          candidateMatchId: match.id,
          intent: structuredIntent,
          engine: evaluationV2,
          vehicle,
        });
        if (live.usedLive && live.adjustedScore !== match.score) {
          await prisma.candidateMatch.update({
            where: { id: match.id },
            data: { score: live.adjustedScore },
          });
          match.score = live.adjustedScore;
        }
      } catch {
        // fallback: deterministic score already stored
      }
    }

    if (isPotential) {
      // Hidden from buyer until Qualified — enrichment already requested above
      results.push(match);
      continue;
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
      // Missing private matching price — Exchange-initiated enrichment; not buyer-visible
      try {
        const { ensureExchangeInitiatedEnrichment } = await import(
          "@/services/matching/information-request"
        );
        await ensureExchangeInitiatedEnrichment({
          candidateMatchId: match.id,
          fieldsOverride: ["price"],
        });
      } catch {
        // non-blocking
      }
    }

    if (status === "VALIDATED") {
      await notifyDealerUsers(demand.dealerId, {
        type: "BUYER_MATCH",
        title:
          evaluation.overallBand === "STRONG" || evaluation.overallBand === "GOOD"
            ? "נמצאה התאמה רלוונטית לחיפוש שלך"
            : COPY.matchPossible,
        body: "רוצה להתקדם עם הרכב הזה?",
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
      void recordActivationMilestone({
        dealerId: demand.dealerId,
        milestone: "FIRST_MATCH_PRESENTED",
        entityType: "CandidateMatch",
        entityId: match.id,
      }).catch(() => undefined);
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
    const { markVehicleSoldForDealer } = await import(
      "@/services/inventory/mark-sold"
    );
    await markVehicleSoldForDealer({
      dealerId,
      vehicleId: validation.vehicleId,
      source: "availability_validation",
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
      try {
        const { ensureExchangeInitiatedEnrichment } = await import(
          "@/services/matching/information-request"
        );
        await ensureExchangeInitiatedEnrichment({
          candidateMatchId: match.id,
          fieldsOverride: ["price"],
        });
      } catch {
        // non-blocking
      }
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
        void recordActivationMilestone({
          dealerId: demand.dealerId,
          milestone: "FIRST_MATCH_PRESENTED",
          entityType: "CandidateMatch",
          entityId: match.id,
        }).catch(() => undefined);
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
  if (params.status === "INTERESTED" && isKillSwitchOn("interest_new")) {
    throw new Error("INTEREST_DISABLED");
  }
  const match = await prisma.candidateMatch.findFirst({
    where: {
      id: params.candidateMatchId,
      demand: { dealerId: params.dealerId },
      status: "VALIDATED",
      resolutionState: "RESOLVED",
      scoreBand: { in: ["STRONG", "GOOD", "ALTERNATIVE"] },
    },
    include: { demand: true, vehicle: true },
  });
  if (!match) throw new Error("NOT_FOUND");
  if (match.vehicle.status === "SOLD" || match.vehicle.status === "ARCHIVED") {
    throw new Error("VEHICLE_UNAVAILABLE");
  }

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

  if (params.status === "INTERESTED") {
    void recordActivationMilestone({
      dealerId: params.dealerId,
      milestone: "FIRST_BUYER_INTEREST",
      userId: params.userId,
      entityType: "BuyerInterest",
      entityId: interest.id,
    }).catch(() => undefined);
  }

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
        body: COPY.opportunityPushBody,
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
      void recordActivationMilestone({
        dealerId: match.vehicle.dealerId,
        milestone: "FIRST_SELLER_OPPORTUNITY",
        entityType: "SellerOpportunity",
        entityId: opp.id,
      }).catch(() => undefined);
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
  if (params.status === "INTERESTED" && isKillSwitchOn("interest_new")) {
    throw new Error("INTEREST_DISABLED");
  }
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
  if (opp.vehicle.status === "SOLD" || opp.vehicle.status === "ARCHIVED") {
    throw new Error("VEHICLE_UNAVAILABLE");
  }

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
    metadata: params.rejectReason
      ? { rejectReason: params.rejectReason }
      : undefined,
  });

  // Seller decline — SOLD uses canonical path only
  if (
    params.status === "REJECTED" &&
    isSellerDeclineSold(params.rejectReason)
  ) {
    const { markVehicleSoldForDealer } = await import(
      "@/services/inventory/mark-sold"
    );
    await markVehicleSoldForDealer({
      dealerId: params.dealerId,
      vehicleId: opp.vehicleId,
      source: "seller_opportunity_decline",
    });
    return { sellerInterest, vehicleSold: true };
  }

  // Mutual Interest → Reveal (deterministic gate §39-40)
  if (
    params.status === "INTERESTED" &&
    opp.buyerInterest.status === "INTERESTED"
  ) {
    // Live eligibility — stale Push must not create invalid Mutual
    const [liveVehicle, liveDemand, liveCandidate] = await Promise.all([
      prisma.vehicle.findUnique({
        where: { id: opp.vehicleId },
        select: { status: true },
      }),
      prisma.demand.findUnique({
        where: { id: opp.buyerInterest.demandId },
        select: { status: true },
      }),
      prisma.candidateMatch.findUnique({
        where: { id: opp.candidateMatchId },
        select: { status: true },
      }),
    ]);

    const demandOk = liveDemand?.status === "ACTIVE";
    const vehicleEligible =
      liveVehicle != null &&
      liveVehicle.status !== "SOLD" &&
      liveVehicle.status !== "ARCHIVED";
    const candidateOk =
      liveCandidate?.status === "VALIDATED" ||
      liveCandidate?.status === "PENDING_VALIDATION";

    if (!demandOk || !vehicleEligible || !candidateOk) {
      return {
        sellerInterest,
        error: "stale_opportunity",
        reason: !demandOk
          ? "demand_ineligible"
          : !vehicleEligible
            ? "vehicle_unavailable"
            : "candidate_invalidated",
      };
    }

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
      try {
        mutual = await prisma.mutualInterest.create({
          data: { sellerInterestId: sellerInterest.id },
        });
        await logAppEvent({
          eventType: "mutual_interest_created",
          entityType: "MutualInterest",
          entityId: mutual.id,
        });
        void recordActivationMilestone({
          dealerId: opp.buyerInterest.dealerId,
          milestone: "FIRST_MUTUAL_INTEREST",
          entityType: "MutualInterest",
          entityId: mutual.id,
        }).catch(() => undefined);
        void recordActivationMilestone({
          dealerId: params.dealerId,
          milestone: "FIRST_MUTUAL_INTEREST",
          userId: params.userId,
          entityType: "MutualInterest",
          entityId: mutual.id,
        }).catch(() => undefined);
      } catch {
        mutual = await prisma.mutualInterest.findUnique({
          where: { sellerInterestId: sellerInterest.id },
        });
        if (!mutual) throw new Error("MUTUAL_CREATE_FAILED");
      }
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

function isSellerDeclineSold(reason?: string) {
  if (!reason) return false;
  return /sold|נמכר|already_sold|vehicle_sold/i.test(reason);
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
    try {
      const { cancelOpenRequestsForDemand } = await import(
        "@/services/matching/information-request"
      );
      await cancelOpenRequestsForDemand(d.id);
    } catch {
      // non-blocking
    }
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

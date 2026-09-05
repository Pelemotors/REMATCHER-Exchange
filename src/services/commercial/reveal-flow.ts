import { prisma } from "@/lib/prisma";
import { COPY } from "@/config/brand";
import { getProductConfig } from "@/config/product";
import { recordRevealUsageBothSides } from "@/services/commercial/reveal-usage";
import { notifyDealerUsers, logAppEvent } from "@/services/notifications";
import { toPrismaJson } from "@/lib/prisma-json";
import { recordActivationMilestone } from "@/services/activation/milestones";
import { isKillSwitchOn } from "@/config/kill-switches";

export async function createRevealFromMutualInterest(params: {
  mutualInterestId: string;
  sellerInterestId: string;
  buyerDealerId: string;
  sellerDealerId: string;
  candidateMatchId?: string;
}) {
  const existing = await prisma.reveal.findUnique({
    where: { mutualInterestId: params.mutualInterestId },
  });
  if (existing) {
    return existing;
  }
  if (isKillSwitchOn("reveal")) {
    throw new Error("REVEAL_DISABLED");
  }

  const [buyerDealer, sellerDealer, match] = await Promise.all([
    prisma.dealer.findUnique({ where: { id: params.buyerDealerId } }),
    prisma.dealer.findUnique({ where: { id: params.sellerDealerId } }),
    params.candidateMatchId
      ? prisma.candidateMatch.findUnique({
          where: { id: params.candidateMatchId },
          include: { vehicle: true, demand: true },
        })
      : null,
  ]);

  const config = getProductConfig();
  const reveal = await prisma.reveal.create({
    data: {
      mutualInterestId: params.mutualInterestId,
      buyerDealerId: params.buyerDealerId,
      sellerDealerId: params.sellerDealerId,
      candidateMatchId: params.candidateMatchId,
      buyerContactJson: toPrismaJson({
        businessName: buyerDealer?.businessName,
        contactName: buyerDealer?.contactName,
        phone: buyerDealer?.phone,
      }),
      sellerContactJson: toPrismaJson({
        businessName: sellerDealer?.businessName,
        contactName: sellerDealer?.contactName,
        phone: sellerDealer?.phone,
      }),
      matchSummaryJson: match
        ? toPrismaJson({
            make: match.vehicle.make,
            model: match.vehicle.model,
            year: match.vehicle.year,
            b2bPrice: match.vehicle.b2bPrice,
            scoreBand: match.scoreBand,
            explanation: match.explanationText,
          })
        : undefined,
    },
  });

  await recordRevealUsageBothSides(
    reveal.id,
    params.buyerDealerId,
    params.sellerDealerId
  );

  const notifyPayload = {
    type: "MUTUAL_INTEREST" as const,
    title: COPY.mutualInterest,
    body: `${COPY.reveal} — ${COPY.revealSub}`,
    link: `/reveals/${reveal.id}`,
    entityType: "reveal",
    entityId: reveal.id,
  };

  await notifyDealerUsers(params.buyerDealerId, notifyPayload);
  await notifyDealerUsers(params.sellerDealerId, notifyPayload);

  try {
    const { emitExchangeEvent } = await import("@/services/exchange/events");
    await emitExchangeEvent({
      eventType: "MATCH_REVEALED",
      dealerId: params.buyerDealerId,
      candidateMatchId: params.candidateMatchId ?? null,
      evidenceType: "BILATERAL_CONFIRMED",
      privacyClass: "DEALER_SCOPED",
      eventData: { revealId: reveal.id },
      idempotencyKey: `match-revealed:${reveal.id}`,
    });
  } catch {
    // non-blocking
  }

  await logAppEvent({
    eventType: "reveal_created",
    entityType: "Reveal",
    entityId: reveal.id,
    metadata: {
      buyerDealerId: params.buyerDealerId,
      sellerDealerId: params.sellerDealerId,
      billingEvent: "reveal_created",
    },
  });

  void recordActivationMilestone({
    dealerId: params.buyerDealerId,
    milestone: "FIRST_REVEAL",
    entityType: "Reveal",
    entityId: reveal.id,
  }).catch(() => undefined);
  void recordActivationMilestone({
    dealerId: params.sellerDealerId,
    milestone: "FIRST_REVEAL",
    entityType: "Reveal",
    entityId: reveal.id,
  }).catch(() => undefined);

  return reveal;
}

export async function submitOutcome(params: {
  revealId: string;
  dealerId: string;
  status:
    | "DEAL_CLOSED"
    | "STILL_IN_PROGRESS"
    | "PRICE_DIDNT_WORK"
    | "VEHICLE_DIDNT_FIT"
    | "DID_NOT_PROGRESS";
  notes?: string;
}) {
  const reveal = await prisma.reveal.findFirst({
    where: {
      id: params.revealId,
      OR: [
        { buyerDealerId: params.dealerId },
        { sellerDealerId: params.dealerId },
      ],
    },
    include: {
      outcome: true,
      mutualInterest: {
        include: {
          sellerInterest: {
            include: {
              opportunity: {
                include: {
                  candidateMatch: { include: { vehicle: true, demand: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!reveal) throw new Error("FORBIDDEN");
  if (reveal.outcome) {
    const updated = await prisma.outcome.update({
      where: { id: reveal.outcome.id },
      data: {
        status: params.status,
        notes: params.notes,
        reportedByDealerId: params.dealerId,
        reportedAt: new Date(),
      },
    });
    await logAppEvent({
      eventType: "outcome_updated",
      entityType: "Outcome",
      entityId: updated.id,
      dealerId: params.dealerId,
      metadata: { revealId: params.revealId, status: params.status },
    });
    if (params.status === "DEAL_CLOSED") {
      void recordActivationMilestone({
        dealerId: reveal.buyerDealerId,
        milestone: "FIRST_REPORTED_DEAL",
        entityType: "Outcome",
        entityId: updated.id,
      }).catch(() => undefined);
      void recordActivationMilestone({
        dealerId: reveal.sellerDealerId,
        milestone: "FIRST_REPORTED_DEAL",
        entityType: "Outcome",
        entityId: updated.id,
      }).catch(() => undefined);
    }
    return updated;
  }

  const match =
    reveal.mutualInterest.sellerInterest.opportunity.candidateMatch;
  const evaluation = match.evaluationJson as {
    score?: number;
    gaps?: string[];
  } | null;

  const outcome = await prisma.outcome.create({
    data: {
      revealId: params.revealId,
      status: params.status,
      notes: params.notes,
      reportedByDealerId: params.dealerId,
      candidateMatchId: match.id,
      demandId: match.demandId,
      vehicleId: match.vehicleId,
      buyerDealerId: reveal.buyerDealerId,
      sellerDealerId: reveal.sellerDealerId,
      matchScore: match.score ?? undefined,
      scoreBand: match.scoreBand ?? undefined,
      freshnessState: match.vehicle.freshnessState,
      learningJson: toPrismaJson({
        evaluation,
        reportedStatus: params.status,
      }),
    },
  });

  await logAppEvent({
    eventType: "outcome_received",
    entityType: "Outcome",
    entityId: outcome.id,
    dealerId: params.dealerId,
    metadata: { revealId: params.revealId, status: params.status },
  });

  if (params.status === "DEAL_CLOSED") {
    void recordActivationMilestone({
      dealerId: reveal.buyerDealerId,
      milestone: "FIRST_REPORTED_DEAL",
      entityType: "Outcome",
      entityId: outcome.id,
    }).catch(() => undefined);
    void recordActivationMilestone({
      dealerId: reveal.sellerDealerId,
      milestone: "FIRST_REPORTED_DEAL",
      entityType: "Outcome",
      entityId: outcome.id,
    }).catch(() => undefined);
  }

  return outcome;
}

export async function getRevealForDealer(revealId: string, dealerId: string) {
  const reveal = await prisma.reveal.findFirst({
    where: {
      id: revealId,
      OR: [{ buyerDealerId: dealerId }, { sellerDealerId: dealerId }],
    },
    include: {
      outcome: true,
      usages: true,
      mutualInterest: {
        include: {
          sellerInterest: {
            include: {
              opportunity: {
                include: {
                  candidateMatch: {
                    include: { vehicle: true, demand: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!reveal) throw new Error("FORBIDDEN");

  const isBuyer = reveal.buyerDealerId === dealerId;
  const counterparty = isBuyer
    ? (reveal.sellerContactJson as Record<string, string>)
    : (reveal.buyerContactJson as Record<string, string>);

  return {
    id: reveal.id,
    revealedAt: reveal.revealedAt,
    isBuyer,
    counterparty,
    matchSummary: reveal.matchSummaryJson,
    outcome: reveal.outcome,
    hasUsageRecorded: reveal.usages.some((u) => u.dealerId === dealerId),
  };
}

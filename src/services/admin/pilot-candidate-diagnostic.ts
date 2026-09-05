/**
 * Admin-only pilot diagnostics — "what happened to this Candidate?"
 * Never expose to dealers. Never use for authorization.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import {
  canPresentCandidateToBuyer,
  getBlockingRequirementsForCandidate,
  getCandidateLifecycleState,
  mapBlockingFieldToCode,
} from "@/services/domain/candidate-policy";

export async function getPilotCandidateDiagnostic(candidateMatchId: string) {
  const match = await prisma.candidateMatch.findUnique({
    where: { id: candidateMatchId },
    include: {
      demand: {
        select: {
          id: true,
          status: true,
          dealerId: true,
          confirmedJson: true,
          createdAt: true,
          expiresAt: true,
        },
      },
      vehicle: {
        select: {
          id: true,
          status: true,
          dealerId: true,
          make: true,
          model: true,
          year: true,
          mileage: true,
          b2bPrice: true,
          freshnessState: true,
          updatedAt: true,
        },
      },
      buyerInterests: {
        select: { id: true, status: true, createdAt: true, dealerId: true },
        take: 5,
      },
      sellerOpportunities: {
        include: {
          sellerInterest: {
            include: {
              mutualInterest: {
                include: { reveal: { select: { id: true, revealedAt: true } } },
              },
            },
          },
        },
        take: 1,
      },
      informationRequests: {
        where: { status: "OPEN" },
        select: {
          id: true,
          status: true,
          requestedFields: true,
          createdAt: true,
          updatedAt: true,
        },
        take: 10,
      },
      validationEvents: {
        where: { status: "PENDING" },
        select: { id: true, type: true, status: true, requestedAt: true },
        take: 10,
      },
    },
  });

  if (!match) return null;

  const openFields = new Set<string>();
  for (const r of match.informationRequests) {
    const arr = Array.isArray(r.requestedFields)
      ? (r.requestedFields as string[])
      : [];
    for (const f of arr) openFields.add(f);
  }

  const blockers = getBlockingRequirementsForCandidate({
    resolutionState: match.resolutionState,
    status: match.status,
    decisionBlockingUnknowns: match.decisionBlockingUnknowns,
    openEnrichmentFields: [...openFields],
    pendingValidationTypes: match.validationEvents.map((v) => v.type),
  });

  const buyerInterest = match.buyerInterests[0] ?? null;
  const opp = match.sellerOpportunities[0] ?? null;
  const sellerInterest = opp?.sellerInterest ?? null;
  const mutual = sellerInterest?.mutualInterest ?? null;
  const reveal = mutual?.reveal ?? null;

  const lifecycle = getCandidateLifecycleState({
    status: match.status,
    resolutionState: match.resolutionState,
    scoreBand: match.scoreBand,
    demandStatus: match.demand.status,
    vehicleStatus: match.vehicle.status,
    buyerInterestStatus: buyerInterest?.status,
    sellerOpportunityStatus: opp?.status,
    sellerInterestStatus: sellerInterest?.status,
    hasMutual: Boolean(mutual),
    hasReveal: Boolean(reveal),
  });

  const notifications = await prisma.notification.findMany({
    where: {
      OR: [
        { entityType: "match", entityId: match.id },
        { entityType: "vehicle", entityId: match.vehicleId },
        { entityType: "opportunity", entityId: opp?.id ?? "__none__" },
        { entityType: "reveal", entityId: reveal?.id ?? "__none__" },
        { entityType: "validation", entityId: match.id },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 40,
    select: {
      id: true,
      type: true,
      title: true,
      createdAt: true,
      link: true,
      entityType: true,
      entityId: true,
    },
  });

  const events = await prisma.appEvent.findMany({
    where: {
      OR: [
        { entityId: match.id },
        { entityType: "CandidateMatch", entityId: match.id },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 80,
    select: {
      id: true,
      eventType: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      source: true,
    },
  });

  const outcome = reveal
    ? await prisma.outcome.findUnique({
        where: { revealId: reveal.id },
        select: { id: true, status: true, reportedAt: true },
      })
    : null;

  return {
    candidateMatchId: match.id,
    lifecycle,
    canPresentToBuyer: canPresentCandidateToBuyer({
      status: match.status,
      resolutionState: match.resolutionState,
      scoreBand: match.scoreBand,
      demandStatus: match.demand.status,
      vehicleStatus: match.vehicle.status,
    }),
    blockers,
    technical: {
      status: match.status,
      resolutionState: match.resolutionState,
      scoreBand: match.scoreBand,
      decisionBlockingUnknowns: match.decisionBlockingUnknowns,
    },
    demand: {
      id: match.demand.id,
      status: match.demand.status,
      dealerId: match.demand.dealerId,
      createdAt: match.demand.createdAt,
      expiresAt: match.demand.expiresAt,
      // Admin may see demand summary keys only — not dump private budgets in plain text
      summaryKeys: Object.keys(
        (match.demand.confirmedJson as Record<string, unknown>) ?? {}
      ),
    },
    vehicle: {
      id: match.vehicle.id,
      status: match.vehicle.status,
      dealerId: match.vehicle.dealerId,
      title: [match.vehicle.make, match.vehicle.model, match.vehicle.year]
        .filter(Boolean)
        .join(" "),
      mileage: match.vehicle.mileage,
      hasPrivatePrice: match.vehicle.b2bPrice != null,
      // Never return numeric private price to browser admin payloads if avoidable —
      // admin needs presence for diagnosis; omit value to reduce accidental leak.
      freshnessState: match.vehicle.freshnessState,
      updatedAt: match.vehicle.updatedAt,
    },
    enrichment: {
      openRequests: match.informationRequests.map((r) => ({
        id: r.id,
        fields: Array.isArray(r.requestedFields)
          ? (r.requestedFields as string[]).map(mapBlockingFieldToCode)
          : [],
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    },
    validations: match.validationEvents,
    buyerInterest: buyerInterest
      ? {
          id: buyerInterest.id,
          status: buyerInterest.status,
          createdAt: buyerInterest.createdAt,
        }
      : null,
    sellerOpportunity: opp
      ? { id: opp.id, status: opp.status, createdAt: opp.createdAt }
      : null,
    sellerInterest: sellerInterest
      ? {
          id: sellerInterest.id,
          status: sellerInterest.status,
          createdAt: sellerInterest.createdAt,
        }
      : null,
    mutual: mutual
      ? { id: mutual.id, createdAt: mutual.createdAt }
      : null,
    reveal: reveal
      ? { id: reveal.id, revealedAt: reveal.revealedAt }
      : null,
    outcome,
    notifications,
    events,
  };
}

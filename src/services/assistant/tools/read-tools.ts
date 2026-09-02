import "server-only";
import { prisma } from "@/lib/prisma";
import {
  getEnrichedDemandsForDealer,
  getExpiringDemandsForDealer,
  getPendingActionsForDealer,
} from "@/services/demand/demand-queries";
import { getDealerUsageSummary } from "@/services/commercial/reveal-usage";
import { confirmedFromJson, demandTitle } from "@/lib/demand-display";
import type { ReadToolName } from "./registry";

export async function executeReadTool(
  tool: ReadToolName,
  dealerId: string
): Promise<unknown> {
  switch (tool) {
    case "getMyExchangeState": {
      const [pending, demands, usage, validations, matches, opportunities] =
        await Promise.all([
          getPendingActionsForDealer(dealerId),
          getEnrichedDemandsForDealer(dealerId, { lightweight: true }),
          getDealerUsageSummary(dealerId),
          prisma.validationEvent.count({
            where: { dealerId, status: "PENDING" },
          }),
          prisma.candidateMatch.count({
            where: {
              demand: { dealerId },
              status: "VALIDATED",
              buyerInterests: { none: { dealerId } },
            },
          }),
          prisma.sellerOpportunity.count({
            where: { vehicle: { dealerId }, status: "OPEN" },
          }),
        ]);
      const active = demands.filter((d) =>
        ["ACTIVE", "EXPIRING"].includes(d.uxStatus)
      );
      const expiring = active.filter((d) => d.uxStatus === "EXPIRING");
      return {
        activeDemands: active.length,
        expiringDemands: expiring.length,
        pendingActions: pending.total,
        pendingValidations: validations,
        authorizedMatches: matches,
        openOpportunities: opportunities,
        pendingOutcomes: await prisma.reveal.count({
          where: {
            OR: [{ buyerDealerId: dealerId }, { sellerDealerId: dealerId }],
            outcome: null,
            revealedAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        }),
        connectionsRemaining:
          usage.planSlug === "onboarding"
            ? Math.max(0, usage.freeAllowance - usage.freeUsed)
            : Math.max(0, usage.monthlyAllowance - usage.monthlyUsed),
      };
    }
    case "getMyActiveDemands": {
      const demands = await getEnrichedDemandsForDealer(dealerId, {
        lightweight: true,
      });
      return demands
        .filter((d) => ["ACTIVE", "EXPIRING"].includes(d.uxStatus))
        .map((d) => ({
          id: d.id,
          title: d.title,
          uxStatus: d.uxStatus,
          daysLeft: d.daysLeft,
          reflection: d.reflection,
        }));
    }
    case "getMyExpiringDemands":
      return getExpiringDemandsForDealer(dealerId);
    case "getMyPendingActions":
      return getPendingActionsForDealer(dealerId);
    case "getMyPendingValidations": {
      const events = await prisma.validationEvent.findMany({
        where: { dealerId, status: "PENDING" },
        include: {
          vehicle: { select: { make: true, model: true, year: true } },
        },
        orderBy: { requestedAt: "desc" },
        take: 10,
      });
      return events.map((e) => ({
        id: e.id,
        title: `${e.vehicle.make ?? ""} ${e.vehicle.model ?? ""} ${e.vehicle.year ?? ""}`.trim(),
      }));
    }
    case "getMyCommercialStatus":
      return getDealerUsageSummary(dealerId);
    case "getMyOpportunities": {
      const count = await prisma.sellerOpportunity.count({
        where: { vehicle: { dealerId }, status: "OPEN" },
      });
      return { count, href: "/opportunities" };
    }
    case "getMyAuthorizedMatches": {
      const count = await prisma.candidateMatch.count({
        where: {
          demand: { dealerId },
          status: "VALIDATED",
          buyerInterests: { none: { dealerId } },
        },
      });
      return { count, href: "/matches" };
    }
    case "getMyInventoryRequiringAttention": {
      const vehicles = await prisma.vehicle.findMany({
        where: {
          dealerId,
          status: "ACTIVE",
          OR: [
            { freshnessState: { in: ["STALE", "VALIDATION_REQUIRED", "UNKNOWN"] } },
          ],
        },
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          freshnessState: true,
        },
        take: 10,
        orderBy: { updatedAt: "desc" },
      });
      return vehicles.map((v) => ({
        id: v.id,
        title: `${v.make ?? ""} ${v.model ?? ""} ${v.year ?? ""}`.trim(),
        freshnessState: v.freshnessState,
      }));
    }
    case "getMyStaleInventory": {
      const vehicles = await prisma.vehicle.findMany({
        where: { dealerId, status: "ACTIVE", freshnessState: "STALE" },
        select: { id: true, make: true, model: true, year: true },
        take: 10,
      });
      return vehicles.map((v) => ({
        id: v.id,
        title: `${v.make ?? ""} ${v.model ?? ""} ${v.year ?? ""}`.trim(),
      }));
    }
    case "getMyReveals": {
      const reveals = await prisma.reveal.findMany({
        where: {
          OR: [{ buyerDealerId: dealerId }, { sellerDealerId: dealerId }],
        },
        orderBy: { revealedAt: "desc" },
        take: 5,
        include: { outcome: true },
      });
      return reveals.map((r) => ({
        id: r.id,
        href: `/reveals/${r.id}`,
        hasOutcome: Boolean(r.outcome),
        revealedAt: r.revealedAt.toISOString(),
      }));
    }
    case "getMyPendingOutcomes": {
      const reveals = await prisma.reveal.findMany({
        where: {
          OR: [{ buyerDealerId: dealerId }, { sellerDealerId: dealerId }],
          outcome: null,
          revealedAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { revealedAt: "asc" },
        take: 5,
      });
      return reveals.map((r) => ({
        id: r.id,
        href: `/reveals/${r.id}`,
        daysOpen: Math.floor(
          (Date.now() - r.revealedAt.getTime()) / (24 * 60 * 60 * 1000)
        ),
      }));
    }
    default:
      return null;
  }
}

export async function getDemandByIdForDealer(dealerId: string, demandId: string) {
  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId },
  });
  if (!demand) return null;
  const confirmed = confirmedFromJson(demand.confirmedJson);
  return {
    id: demand.id,
    title: demandTitle(confirmed),
    status: demand.status,
    expiresAt: demand.expiresAt?.toISOString() ?? null,
  };
}

export async function executeToolsParallel(
  tools: ReadToolName[],
  dealerId: string
): Promise<{
  results: Record<string, unknown>;
  durations: Record<string, number>;
  errors: Record<string, string>;
  partialFailure: boolean;
}> {
  const results: Record<string, unknown> = {};
  const durations: Record<string, number> = {};
  const errors: Record<string, string> = {};

  await Promise.all(
    tools.map(async (tool) => {
      const start = Date.now();
      try {
        results[tool] = await executeReadTool(tool, dealerId);
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        errors[tool] = message;
        results[tool] = null;
      } finally {
        durations[tool] = Date.now() - start;
      }
    })
  );

  return {
    results,
    durations,
    errors,
    partialFailure: Object.keys(errors).length > 0,
  };
}

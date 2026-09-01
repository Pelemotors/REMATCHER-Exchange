import "server-only";
import { prisma } from "@/lib/prisma";
import {
  getEnrichedDemandsForDealer,
  getExpiringDemandsForDealer,
  getPendingActionsForDealer,
} from "@/services/demand/demand-queries";
import { getDealerUsageSummary } from "@/services/commercial/reveal-usage";
import { confirmedFromJson, demandTitle } from "@/lib/demand-display";

export type ReadToolName =
  | "getMyExchangeState"
  | "getMyActiveDemands"
  | "getMyExpiringDemands"
  | "getMyPendingActions"
  | "getMyPendingValidations"
  | "getMyCommercialStatus"
  | "getMyOpportunities"
  | "getMyAuthorizedMatches";

export async function executeReadTool(
  tool: ReadToolName,
  dealerId: string
): Promise<unknown> {
  switch (tool) {
    case "getMyExchangeState": {
      const [pending, demands, usage] = await Promise.all([
        getPendingActionsForDealer(dealerId),
        getEnrichedDemandsForDealer(dealerId),
        getDealerUsageSummary(dealerId),
      ]);
      const active = demands.filter((d) =>
        ["ACTIVE", "EXPIRING"].includes(d.uxStatus)
      );
      return {
        activeDemands: active.length,
        pendingActions: pending.total,
        connectionsRemaining:
          usage.planSlug === "onboarding"
            ? Math.max(0, usage.freeAllowance - usage.freeUsed)
            : Math.max(0, usage.monthlyAllowance - usage.monthlyUsed),
      };
    }
    case "getMyActiveDemands": {
      const demands = await getEnrichedDemandsForDealer(dealerId);
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

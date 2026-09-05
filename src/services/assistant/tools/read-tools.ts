import "server-only";
import { prisma } from "@/lib/prisma";
import {
  getEnrichedDemandsForDealer,
  getExpiringDemandsForDealer,
  getPendingActionsForDealer,
} from "@/services/demand/demand-queries";
import { getDealerUsageSummary } from "@/services/commercial/reveal-usage";
import { confirmedFromJson, demandTitle, formatSearchDisplayLabel } from "@/lib/demand-display";
import type { ReadToolName } from "./registry";

/** Dealer-facing labels for Agent — never expose FRESH/STALE/B2B enums verbatim. */
function freshnessLabelHe(state: string | null | undefined): string {
  switch (state) {
    case "FRESH":
      return "מעודכן";
    case "STALE":
      return "דורש רענון";
    case "VALIDATION_REQUIRED":
      return "דורש אימות זמינות";
    case "UNKNOWN":
      return "סטטוס לא ברור";
    default:
      return "לא צוין";
  }
}

function agentVehicleView(v: {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage?: number | null;
  b2bPrice?: number | null;
  retailPrice?: number | null;
  freshnessState?: string | null;
  ownershipHand?: number | null;
}) {
  return {
    id: v.id,
    title: `${v.make ?? ""} ${v.model ?? ""} ${v.year ?? ""}`.trim(),
    make: v.make,
    model: v.model,
    year: v.year,
    mileage: v.mileage ?? null,
    retailPrice: v.retailPrice ?? null,
    dealerPrice: v.b2bPrice ?? null,
    freshness: freshnessLabelHe(v.freshnessState),
    ownershipHand: v.ownershipHand ?? null,
  };
}

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
    case "getMyInventory": {
      const LIST_TAKE = 20;
      const [activeCount, vehicles] = await Promise.all([
        prisma.vehicle.count({ where: { dealerId, status: "ACTIVE" } }),
        prisma.vehicle.findMany({
          where: { dealerId, status: "ACTIVE" },
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            mileage: true,
            b2bPrice: true,
            retailPrice: true,
            freshnessState: true,
            ownershipHand: true,
          },
          orderBy: { updatedAt: "desc" },
          take: LIST_TAKE,
        }),
      ]);
      return {
        activeCount,
        totalCount: activeCount,
        returnedCount: vehicles.length,
        hasMore: activeCount > vehicles.length,
        vehicles: vehicles.map((v) => agentVehicleView(v)),
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
          title: formatSearchDisplayLabel(d.confirmed),
          uxStatus: d.uxStatus,
          daysLeft: d.daysLeft,
          reflection: d.reflection,
          displayLabel: formatSearchDisplayLabel(d.confirmed),
        }));
    }
    case "getMyExpiringDemands":
      return getExpiringDemandsForDealer(dealerId);
    case "getMyPendingActions":
      return getPendingActionsForDealer(dealerId);
    case "getMyPendingValidations": {
      const where = { dealerId, status: "PENDING" as const };
      const [totalCount, events] = await Promise.all([
        prisma.validationEvent.count({ where }),
        prisma.validationEvent.findMany({
          where,
          include: {
            vehicle: { select: { make: true, model: true, year: true } },
          },
          orderBy: { requestedAt: "desc" },
          take: 10,
        }),
      ]);
      return {
        totalCount,
        returnedCount: events.length,
        hasMore: totalCount > events.length,
        items: events.map((e) => ({
          id: e.id,
          title: `${e.vehicle.make ?? ""} ${e.vehicle.model ?? ""} ${e.vehicle.year ?? ""}`.trim(),
          href: `/validations?focus=${e.id}`,
        })),
      };
    }
    case "getMyCommercialStatus":
      return getDealerUsageSummary(dealerId);
    case "getMyOpportunities": {
      const where = { vehicle: { dealerId }, status: "OPEN" as const };
      const [totalCount, opps] = await Promise.all([
        prisma.sellerOpportunity.count({ where }),
        prisma.sellerOpportunity.findMany({
          where,
          include: {
            vehicle: {
              select: { id: true, make: true, model: true, year: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
      ]);
      return {
        totalCount,
        returnedCount: opps.length,
        hasMore: totalCount > opps.length,
        count: totalCount,
        items: opps.map((o) => ({
          id: o.id,
          href: `/opportunities?focus=${o.id}`,
          vehicleTitle:
            `${o.vehicle.make ?? ""} ${o.vehicle.model ?? ""} ${o.vehicle.year ?? ""}`.trim(),
          note: "סוחר מאומת ברשת הביע עניין",
        })),
      };
    }
    case "getMyAuthorizedMatches": {
      const { BUYER_VISIBLE_MATCH_WHERE } = await import(
        "@/services/domain/candidate-policy"
      );
      const where = {
        demand: { dealerId },
        ...BUYER_VISIBLE_MATCH_WHERE,
      };
      const [totalCount, matches] = await Promise.all([
        prisma.candidateMatch.count({ where }),
        prisma.candidateMatch.findMany({
          where,
          include: {
            vehicle: true,
            demand: { select: { id: true, confirmedJson: true } },
          },
          orderBy: { score: "desc" },
          take: 8,
        }),
      ]);
      const { toBuyerMatchView } = await import("@/lib/privacy-views");
      const { demandTitle, confirmedFromJson } = await import(
        "@/lib/demand-display"
      );
      return {
        totalCount,
        returnedCount: matches.length,
        hasMore: totalCount > matches.length,
        items: matches.map((m) => ({
          id: m.id,
          href: `/matches?focus=${m.id}`,
          status: m.status,
          scoreBand: m.scoreBand,
          explanation: m.explanationText,
          demandTitle: demandTitle(confirmedFromJson(m.demand.confirmedJson)),
          demandId: m.demand.id,
          vehicle: toBuyerMatchView(m.vehicle),
        })),
      };
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
        freshness: freshnessLabelHe(v.freshnessState),
        href: `/inventory?focus=${v.id}`,
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
      return reveals.map((r) => {
        const summary = (r.matchSummaryJson ?? {}) as Record<string, unknown>;
        const other =
          r.buyerDealerId === dealerId
            ? (r.sellerContactJson as Record<string, unknown> | null)
            : (r.buyerContactJson as Record<string, unknown> | null);
        return {
          id: r.id,
          href: `/reveals/${r.id}`,
          hasOutcome: Boolean(r.outcome),
          revealedAt: r.revealedAt.toISOString(),
          counterpart: other?.businessName ?? "סוחר מאומת",
          vehicle: [summary.make, summary.model, summary.year]
            .filter(Boolean)
            .join(" "),
        };
      });
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

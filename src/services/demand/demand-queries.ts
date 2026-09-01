import { prisma } from "@/lib/prisma";
import type { DemandStatus } from "@prisma/client";
import {
  confirmedFromJson,
  computeDemandUxStatus,
  daysUntilExpiry,
  demandReflectionText,
  demandStatusLabel,
  demandSubtitle,
  demandTags,
  demandTitle,
  type DemandUxStatus,
} from "@/lib/demand-display";

export interface EnrichedDemand {
  id: string;
  status: string;
  uxStatus: DemandUxStatus;
  statusLabel: string;
  rawText: string;
  title: string;
  subtitle: string;
  tags: string[];
  reflection: string;
  daysLeft: number | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  renewedAt: string | null;
  confirmed: ReturnType<typeof confirmedFromJson>;
  authorizedMatchCount: number;
  hasAuthorizedMatch: boolean;
  matchHint: string | null;
}

export async function getEnrichedDemandsForDealer(
  dealerId: string,
  options?: { includeHistory?: boolean; lightweight?: boolean }
): Promise<EnrichedDemand[]> {
  const statuses: DemandStatus[] = options?.includeHistory
    ? ["ACTIVE", "EXPIRED", "CANCELLED", "PENDING_CONFIRMATION", "DRAFT"]
    : ["ACTIVE", "EXPIRED"];

  const demands = await prisma.demand.findMany({
    where: { dealerId, status: { in: statuses } },
    orderBy: { updatedAt: "desc" },
  });

  const matchCountMap = new Map<string, number>();
  if (!options?.lightweight && demands.length > 0) {
    const counts = await prisma.candidateMatch.groupBy({
      by: ["demandId"],
      where: {
        demandId: { in: demands.map((d) => d.id) },
        status: "VALIDATED",
        buyerInterests: { none: { dealerId } },
      },
      _count: { _all: true },
    });
    for (const row of counts) {
      matchCountMap.set(row.demandId, row._count._all);
    }
  }

  const results: EnrichedDemand[] = [];

  for (const d of demands) {
    const confirmed = confirmedFromJson(d.confirmedJson);
    const uxStatus = computeDemandUxStatus(d.status, d.expiresAt);
    const daysLeft = daysUntilExpiry(d.expiresAt);

    const authorizedMatchCount = options?.lightweight
      ? 0
      : (matchCountMap.get(d.id) ?? 0);

    const hasAuthorizedMatch = authorizedMatchCount > 0;
    const matchHint = hasAuthorizedMatch
      ? "נמצאה התאמה רלוונטית"
      : uxStatus === "ACTIVE" || uxStatus === "EXPIRING"
        ? "החיפוש פעיל. כרגע אין התאמה מאומתת להצגה."
        : null;

    results.push({
      id: d.id,
      status: d.status,
      uxStatus,
      statusLabel: demandStatusLabel(uxStatus),
      rawText: d.rawText,
      title: demandTitle(confirmed),
      subtitle: demandSubtitle(confirmed),
      tags: demandTags(confirmed),
      reflection: demandReflectionText(confirmed, uxStatus, daysLeft),
      daysLeft,
      expiresAt: d.expiresAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      renewedAt: d.renewedAt?.toISOString() ?? null,
      confirmed,
      authorizedMatchCount,
      hasAuthorizedMatch,
      matchHint,
    });
  }

  return results;
}

export async function getPendingActionsForDealer(dealerId: string) {
  const [matches, validations, expiringDemands, opportunities] =
    await Promise.all([
      prisma.candidateMatch.count({
        where: {
          demand: { dealerId },
          status: "VALIDATED",
          buyerInterests: { none: { dealerId } },
        },
      }),
      prisma.validationEvent.count({
        where: { dealerId, status: "PENDING" },
      }),
      prisma.demand.count({
        where: {
          dealerId,
          status: "ACTIVE",
          expiresAt: {
            lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
            gte: new Date(),
          },
        },
      }),
      prisma.sellerOpportunity.count({
        where: { vehicle: { dealerId }, status: "OPEN" },
      }),
    ]);

  const items: Array<{
    type: string;
    label: string;
    count: number;
    href: string;
    urgent?: boolean;
  }> = [];

  if (matches > 0) {
    items.push({
      type: "match",
      label: "התאמות חדשות לבדיקה",
      count: matches,
      href: "/matches",
    });
  }
  if (validations > 0) {
    items.push({
      type: "validation",
      label: "רכבים שדורשים אישור זמינות",
      count: validations,
      href: "/validations",
      urgent: true,
    });
  }
  if (expiringDemands > 0) {
    items.push({
      type: "demand_expiry",
      label: "חיפושים שעומדים להסתיים",
      count: expiringDemands,
      href: "/demand",
      urgent: true,
    });
  }
  if (opportunities > 0) {
    items.push({
      type: "opportunity",
      label: "יש עניין ברכבים שלך",
      count: opportunities,
      href: "/opportunities",
    });
  }

  return { items, total: items.reduce((s, i) => s + i.count, 0) };
}

export async function getExpiringDemandsForDealer(dealerId: string) {
  const demands = await prisma.demand.findMany({
    where: {
      dealerId,
      status: "ACTIVE",
      expiresAt: {
        lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
        gte: new Date(),
      },
    },
    orderBy: { expiresAt: "asc" },
  });

  return demands.map((d) => {
    const confirmed = confirmedFromJson(d.confirmedJson);
    const uxStatus = computeDemandUxStatus(d.status, d.expiresAt);
    const daysLeft = daysUntilExpiry(d.expiresAt);
    return {
      id: d.id,
      title: demandTitle(confirmed),
      subtitle: demandSubtitle(confirmed),
      uxStatus,
      daysLeft,
      expiresAt: d.expiresAt?.toISOString() ?? null,
    };
  });
}

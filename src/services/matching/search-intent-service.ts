/**
 * Search Intent versioning service.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { toPrismaJson } from "@/lib/prisma-json";
import { legacyToSearchIntent, searchIntentToLegacyConfirmed } from "@/services/matching/legacy-search-intent-adapter";
import {
  summarizeIntentHe,
  type StructuredSearchIntent,
} from "@/services/matching/search-intent-types";
import { emitExchangeEvent } from "@/services/exchange/events";

export async function getActiveSearchIntent(demandId: string) {
  const demand = await prisma.demand.findUnique({
    where: { id: demandId },
    include: {
      activeSearchIntentVersion: true,
      constraints: true,
    },
  });
  if (!demand) return null;
  if (demand.activeSearchIntentVersion) {
    return demand.activeSearchIntentVersion;
  }
  // Lazy legacy adapter — create ACTIVE version once
  const adapted = legacyToSearchIntent(demand.confirmedJson, demand.constraints);
  return createAndActivateSearchIntent({
    demandId,
    structuredIntent: adapted.structuredIntent,
    naturalLanguageSummary: adapted.naturalLanguageSummary,
    source: "legacy_adapter",
    confirm: demand.status === "ACTIVE",
  });
}

export async function createAndActivateSearchIntent(params: {
  demandId: string;
  structuredIntent: StructuredSearchIntent;
  naturalLanguageSummary?: string;
  source?: string;
  confirm?: boolean;
}) {
  const latest = await prisma.searchIntentVersion.findFirst({
    where: { demandId: params.demandId },
    orderBy: { version: "desc" },
  });
  const version = (latest?.version ?? 0) + 1;
  const summary =
    params.naturalLanguageSummary?.trim() ||
    summarizeIntentHe(params.structuredIntent);

  const created = await prisma.$transaction(async (tx) => {
    if (params.confirm) {
      await tx.searchIntentVersion.updateMany({
        where: {
          demandId: params.demandId,
          status: "ACTIVE",
        },
        data: { status: "SUPERSEDED" },
      });
    }
    const row = await tx.searchIntentVersion.create({
      data: {
        demandId: params.demandId,
        version,
        status: params.confirm ? "ACTIVE" : "DRAFT",
        source: params.source ?? "agent",
        naturalLanguageSummary: summary,
        structuredIntent: toPrismaJson(params.structuredIntent),
        confirmedAt: params.confirm ? new Date() : null,
      },
    });
    if (params.confirm) {
      await tx.demand.update({
        where: { id: params.demandId },
        data: {
          activeSearchIntentVersionId: row.id,
          confirmedJson: toPrismaJson(
            searchIntentToLegacyConfirmed(params.structuredIntent)
          ) as Prisma.InputJsonValue,
          confirmedAt: new Date(),
        },
      });
    }
    return row;
  });

  if (params.confirm) {
    await emitExchangeEvent({
      eventType: version === 1 ? "DEMAND_CREATED" : "DEMAND_UPDATED",
      dealerId: (
        await prisma.demand.findUnique({
          where: { id: params.demandId },
          select: { dealerId: true },
        })
      )?.dealerId,
      demandId: params.demandId,
      evidenceType: "SYSTEM_OBSERVED",
      privacyClass: "DEALER_SCOPED",
      eventData: {
        searchIntentVersionId: created.id,
        version: created.version,
      },
      idempotencyKey: `demand-intent:${params.demandId}:v${created.version}`,
    });
  }

  return created;
}

export async function ensureSearchIntentForDemand(demandId: string) {
  return getActiveSearchIntent(demandId);
}

export function parseStructuredIntent(json: unknown): StructuredSearchIntent {
  const raw = (json ?? {}) as Partial<StructuredSearchIntent>;
  return {
    ...raw,
    schemaVersion: 2,
  };
}

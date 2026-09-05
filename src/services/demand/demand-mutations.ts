import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import type { DemandConfirmed } from "@/lib/demand-display";
import { demandTitle } from "@/lib/demand-display";
import type { ParsedDemand } from "@/lib/schemas/ai";
import {
  computeDemandExpiry,
  runMatchingForDemand,
} from "@/services/domain/matching-flow";
import { logAppEvent } from "@/services/notifications";
import { recordActivationMilestone } from "@/services/activation/milestones";

async function rebuildDemandConstraintsFromParsed(
  demandId: string,
  parsed: ParsedDemand | null
) {
  await prisma.demandConstraint.deleteMany({ where: { demandId } });

  for (const ex of parsed?.exclusions ?? []) {
    await prisma.demandConstraint.create({
      data: {
        demandId,
        field: ex.field,
        constraintType: "EXCLUSION",
        value: toPrismaJson(ex),
        source: "user_confirmed",
      },
    });
  }
  for (const hc of parsed?.hardConstraints ?? []) {
    await prisma.demandConstraint.create({
      data: {
        demandId,
        field: hc.field,
        constraintType: "HARD",
        value: toPrismaJson(hc),
        source: "user_confirmed",
      },
    });
  }
  for (const sp of parsed?.softPreferences ?? []) {
    await prisma.demandConstraint.create({
      data: {
        demandId,
        field: sp.field,
        constraintType: "SOFT",
        value: toPrismaJson(sp),
        source: "user_confirmed",
      },
    });
  }
}

export async function persistDemandDraftForDealer(params: {
  dealerId: string;
  rawText: string;
  parsed: ParsedDemand | Record<string, unknown>;
  confirmed: DemandConfirmed;
}) {
  const demand = await prisma.demand.create({
    data: {
      dealerId: params.dealerId,
      status: "PENDING_CONFIRMATION",
      rawText: params.rawText,
      parsedJson: toPrismaJson(params.parsed),
      confirmedJson: toPrismaJson(params.confirmed),
      parsedAt: new Date(),
    },
  });
  await logAppEvent({
    eventType: "demand_created",
    entityType: "Demand",
    entityId: demand.id,
    dealerId: params.dealerId,
  });
  void recordActivationMilestone({
    dealerId: params.dealerId,
    milestone: "FIRST_DEMAND_CREATED",
    entityType: "Demand",
    entityId: demand.id,
  }).catch(() => undefined);
  return demand;
}

export async function updateDemandForDealer(params: {
  dealerId: string;
  demandId: string;
  confirmed: DemandConfirmed;
}) {
  const demand = await prisma.demand.findFirst({
    where: { id: params.demandId, dealerId: params.dealerId },
  });
  if (!demand) return { ok: false as const, error: "not_found" as const };
  if (!["ACTIVE", "EXPIRED", "PENDING_CONFIRMATION", "DRAFT"].includes(demand.status)) {
    return { ok: false as const, error: "cannot_edit" as const };
  }

  const reactivatingExpired = demand.status === "EXPIRED";
  const updated = await prisma.demand.update({
    where: { id: params.demandId },
    data: {
      confirmedJson: toPrismaJson(params.confirmed),
      updatedAt: new Date(),
      status: reactivatingExpired ? "ACTIVE" : demand.status,
      ...(reactivatingExpired ? { expiresAt: computeDemandExpiry() } : {}),
    },
  });

  const parsed = demand.parsedJson as ParsedDemand | null;
  await rebuildDemandConstraintsFromParsed(params.demandId, parsed);

  await logAppEvent({
    eventType: "demand_updated",
    entityType: "Demand",
    entityId: params.demandId,
    dealerId: params.dealerId,
    metadata: { fields: Object.keys(params.confirmed ?? {}) },
  });

  if (updated.status === "ACTIVE") {
    const { legacyToSearchIntent } = await import(
      "@/services/matching/legacy-search-intent-adapter"
    );
    const { createAndActivateSearchIntent } = await import(
      "@/services/matching/search-intent-service"
    );
    const constraints = await prisma.demandConstraint.findMany({
      where: { demandId: params.demandId },
    });
    const adapted = legacyToSearchIntent(params.confirmed, constraints);
    await createAndActivateSearchIntent({
      demandId: params.demandId,
      structuredIntent: adapted.structuredIntent,
      naturalLanguageSummary: adapted.naturalLanguageSummary,
      source: "demand_update",
      confirm: true,
    });
    await runMatchingForDemand(params.demandId);
  }

  if (updated.status === "ACTIVE" && demand.status !== "ACTIVE") {
    void recordActivationMilestone({
      dealerId: params.dealerId,
      milestone: "FIRST_DEMAND_ACTIVATED",
      entityType: "Demand",
      entityId: params.demandId,
    }).catch(() => undefined);
  }

  return { ok: true as const, demand: updated, title: demandTitle(params.confirmed) };
}

export async function activateDemandForDealer(params: {
  dealerId: string;
  demandId: string;
  confirmed?: DemandConfirmed;
}) {
  const demand = await prisma.demand.findFirst({
    where: { id: params.demandId, dealerId: params.dealerId },
  });
  if (!demand) return { ok: false as const, error: "not_found" as const };

  const confirmed =
    params.confirmed ??
    ((demand.confirmedJson ?? {}) as DemandConfirmed);
  const parsed = demand.parsedJson as ParsedDemand | null;

  await rebuildDemandConstraintsFromParsed(params.demandId, parsed);

  const updated = await prisma.demand.update({
    where: { id: params.demandId },
    data: {
      confirmedJson: toPrismaJson(confirmed),
      confirmedAt: new Date(),
      status: "ACTIVE",
      expiresAt: computeDemandExpiry(),
    },
  });

  try {
    const { legacyToSearchIntent } = await import(
      "@/services/matching/legacy-search-intent-adapter"
    );
    const { createAndActivateSearchIntent, parseStructuredIntent } = await import(
      "@/services/matching/search-intent-service"
    );
    const latestDraft = await prisma.searchIntentVersion.findFirst({
      where: {
        demandId: params.demandId,
        status: { in: ["DRAFT", "PENDING_CONFIRMATION"] },
      },
      orderBy: { version: "desc" },
    });
    if (latestDraft) {
      await createAndActivateSearchIntent({
        demandId: params.demandId,
        structuredIntent: parseStructuredIntent(latestDraft.structuredIntent),
        naturalLanguageSummary: latestDraft.naturalLanguageSummary ?? undefined,
        source: "demand_activate_from_draft",
        confirm: true,
      });
    } else {
      const constraints = await prisma.demandConstraint.findMany({
        where: { demandId: params.demandId },
      });
      const adapted = legacyToSearchIntent(confirmed, constraints);
      await createAndActivateSearchIntent({
        demandId: params.demandId,
        structuredIntent: adapted.structuredIntent,
        naturalLanguageSummary: adapted.naturalLanguageSummary,
        source: "demand_activate",
        confirm: true,
      });
    }
  } catch {
    // matching can still adapt lazily
  }

  await runMatchingForDemand(params.demandId);

  void recordActivationMilestone({
    dealerId: params.dealerId,
    milestone: "FIRST_DEMAND_ACTIVATED",
    entityType: "Demand",
    entityId: params.demandId,
  }).catch(() => undefined);

  return { ok: true as const, demand: updated, title: demandTitle(confirmed) };
}

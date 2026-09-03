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

  const updated = await prisma.demand.update({
    where: { id: params.demandId },
    data: {
      confirmedJson: toPrismaJson(params.confirmed),
      updatedAt: new Date(),
      status: demand.status === "EXPIRED" ? "ACTIVE" : demand.status,
    },
  });

  await prisma.demandConstraint.deleteMany({
    where: { demandId: params.demandId },
  });

  await logAppEvent({
    eventType: "demand_updated",
    entityType: "Demand",
    entityId: params.demandId,
    dealerId: params.dealerId,
    metadata: { fields: Object.keys(params.confirmed ?? {}) },
  });

  if (updated.status === "ACTIVE" || updated.status === "PENDING_CONFIRMATION") {
    await runMatchingForDemand(params.demandId);
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

  await prisma.demandConstraint.deleteMany({
    where: { demandId: params.demandId },
  });

  for (const ex of parsed?.exclusions ?? []) {
    await prisma.demandConstraint.create({
      data: {
        demandId: params.demandId,
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
        demandId: params.demandId,
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
        demandId: params.demandId,
        field: sp.field,
        constraintType: "SOFT",
        value: toPrismaJson(sp),
        source: "user_confirmed",
      },
    });
  }

  const updated = await prisma.demand.update({
    where: { id: params.demandId },
    data: {
      confirmedJson: toPrismaJson(confirmed),
      confirmedAt: new Date(),
      status: "ACTIVE",
      expiresAt: computeDemandExpiry(),
    },
  });

  await runMatchingForDemand(params.demandId);

  return { ok: true as const, demand: updated, title: demandTitle(confirmed) };
}

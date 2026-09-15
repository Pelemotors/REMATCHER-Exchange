import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import {
  normalizePlate,
  refreshBatchStatus,
} from "@/services/intake/status";
import { lookupVehicleByPlate } from "@/services/identity/gov-vehicle";
import { commitOneCandidate } from "@/services/intake/commit";
import { emitExchangeEvent } from "@/services/exchange/events";
import type { VehicleMediaCategory } from "@prisma/client";

export async function listOpenIntakeReviews(dealerId: string) {
  const candidates = await prisma.vehicleCandidate.findMany({
    where: {
      dealerId,
      status: { in: ["NEEDS_INFO", "NEEDS_CONFIRMATION"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      batch: { select: { id: true, status: true, source: true, receivedAt: true } },
      media: {
        include: { media: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return candidates.map((c) => ({
    id: c.id,
    batchId: c.batchId,
    status: c.status,
    reviewStatus: c.reviewStatus,
    detectedPlate: c.detectedPlate,
    plateNormalized: c.plateNormalized,
    govState: c.govState,
    govIdentity: c.govIdentityJson,
    commercial: c.commercialJson,
    missingFields: c.missingFields,
    existingVehicleId: c.existingVehicleId,
    confidenceBand: c.confidenceBand,
    batch: c.batch,
    media: c.media.map((m) => ({
      id: m.media.id,
      storageKey: m.media.storageKey,
      categoryHint: m.media.categoryHint,
      categoryConfidence: m.media.categoryConfidence,
    })),
  }));
}

export async function resolveIntakeCandidate(input: {
  dealerId: string;
  candidateId: string;
  detectedPlate?: string | null;
  askingPrice?: number | null;
  mileage?: number | null;
  mediaCategories?: Array<{ mediaId: string; category: VehicleMediaCategory }>;
  confirmExistingVehicleId?: string | null;
  createNewDespiteExisting?: boolean;
  reject?: boolean;
}) {
  const c = await prisma.vehicleCandidate.findFirst({
    where: { id: input.candidateId, dealerId: input.dealerId },
    include: { media: { include: { media: true } } },
  });
  if (!c) return { ok: false as const, error: "not_found" as const };
  if (c.status === "COMMITTED") {
    return {
      ok: true as const,
      vehicleId: c.committedVehicleId,
      idempotent: true as const,
    };
  }

  if (input.reject) {
    await prisma.vehicleCandidate.update({
      where: { id: c.id },
      data: {
        status: "REJECTED",
        reviewStatus: "RESOLVED",
      },
    });
    await refreshBatchStatus(c.batchId);
    return { ok: true as const, rejected: true as const };
  }

  if (input.mediaCategories?.length) {
    for (const row of input.mediaCategories) {
      const owned = c.media.some((m) => m.mediaId === row.mediaId);
      if (!owned) continue;
      if (!["EXTERIOR", "INTERIOR", "OTHER"].includes(row.category)) continue;
      await prisma.intakeMedia.update({
        where: { id: row.mediaId },
        data: {
          categoryHint: row.category,
          categoryConfidence: 1,
        },
      });
    }
  }

  if (
    typeof input.askingPrice === "number" ||
    typeof input.mileage === "number"
  ) {
    const prev = (c.commercialJson ?? {}) as Record<string, unknown>;
    const next = { ...prev };
    if (typeof input.askingPrice === "number") next.askingPrice = input.askingPrice;
    if (typeof input.mileage === "number") next.mileage = input.mileage;
    await prisma.vehicleCandidate.update({
      where: { id: c.id },
      data: { commercialJson: toPrismaJson(next) },
    });
  }

  let plateNormalized = c.plateNormalized;
  if (input.detectedPlate != null && input.detectedPlate !== "") {
    const digits = normalizePlate(input.detectedPlate);
    if (digits.length < 7 || digits.length > 8) {
      return { ok: false as const, error: "invalid_plate" as const };
    }
    plateNormalized = digits;
    await prisma.vehicleCandidate.update({
      where: { id: c.id },
      data: {
        detectedPlate: input.detectedPlate,
        plateNormalized: digits,
        plateConfidence: 1,
        status: "IDENTIFYING",
      },
    });
  }

  if (plateNormalized) {
    const gov = await lookupVehicleByPlate(plateNormalized);
    await prisma.vehicleCandidate.update({
      where: { id: c.id },
      data: {
        govState: gov.state,
        govIdentityJson: gov.identity ? toPrismaJson(gov.identity) : undefined,
        govLookedUpAt: new Date(),
        status: gov.state === "FOUND" ? "READY" : "NEEDS_INFO",
        reviewStatus: gov.state === "FOUND" ? "NONE" : "PENDING",
        missingFields: toPrismaJson(
          gov.state === "FOUND" ? [] : ["govIdentity"]
        ),
        confidenceBand: gov.state === "FOUND" ? "HIGH" : "MEDIUM",
      },
    });
    if (gov.state !== "FOUND") {
      await refreshBatchStatus(c.batchId);
      return { ok: false as const, error: "gov_not_found" as const, govState: gov.state };
    }
  } else {
    return { ok: false as const, error: "plate_required" as const };
  }

  if (input.createNewDespiteExisting) {
    await prisma.vehicleCandidate.update({
      where: { id: c.id },
      data: {
        existingVehicleId: null,
        status: "READY",
        reviewStatus: "NONE",
      },
    });
    const forced = await commitOneCandidate(input.dealerId, c.id, {
      skipDedupe: true,
    });
    await emitExchangeEvent({
      eventType: "intake.candidate.review_resolved",
      dealerId: input.dealerId,
      eventData: { candidateId: c.id, result: "create_new" },
      operational: true,
    }).catch(() => undefined);
    return forced;
  }

  const result = await commitOneCandidate(input.dealerId, c.id, {
    confirmExistingVehicleId: input.confirmExistingVehicleId ?? undefined,
  });

  await emitExchangeEvent({
    eventType: "intake.candidate.review_resolved",
    dealerId: input.dealerId,
    eventData: {
      candidateId: c.id,
      result: result.ok ? "ok" : result.error,
    },
    operational: true,
  }).catch(() => undefined);

  return result;
}

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
import {
  derivePlateIdentityState,
  govLookupUpdateForKnownPlate,
} from "@/services/intake/plate-identity";

async function loadCandidateReviewRow(
  dealerId: string,
  candidateId: string
) {
  const c = await prisma.vehicleCandidate.findFirst({
    where: { id: candidateId, dealerId },
    include: {
      batch: { select: { id: true, status: true, source: true, receivedAt: true } },
      media: {
        include: { media: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!c) return null;
  return {
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
    plateIdentityState: derivePlateIdentityState({
      plateNormalized: c.plateNormalized,
      govState: c.govState,
    }),
    existingVehicleId: c.existingVehicleId,
    confidenceBand: c.confidenceBand,
    batch: c.batch,
    media: c.media.map((m) => ({
      id: m.media.id,
      storageKey: m.media.storageKey,
      categoryHint: m.media.categoryHint,
      categoryConfidence: m.media.categoryConfidence,
    })),
  };
}

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
    plateIdentityState: derivePlateIdentityState({
      plateNormalized: c.plateNormalized,
      govState: c.govState,
    }),
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

/** Plate / GOV identity refresh without committing inventory. */
export async function verifyIntakeCandidateIdentity(input: {
  dealerId: string;
  candidateId: string;
  detectedPlate?: string | null;
  askingPrice?: number | null;
  mileage?: number | null;
  mediaCategories?: Array<{ mediaId: string; category: VehicleMediaCategory }>;
}) {
  const c = await prisma.vehicleCandidate.findFirst({
    where: { id: input.candidateId, dealerId: input.dealerId },
    include: { media: { include: { media: true } } },
  });
  if (!c) return { ok: false as const, error: "not_found" as const };

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
    const provenance =
      (c.fieldProvenance as Record<string, unknown> | null) ?? {};
    const plateProv = provenance.detectedPlate as
      | { source?: string; confidence?: number }
      | undefined;
    const lowOcr =
      plateProv &&
      (plateProv.source === "OCR" || plateProv.source === "VISION") &&
      (plateProv.confidence ?? 1) < 0.55;

    await prisma.vehicleCandidate.update({
      where: { id: c.id },
      data: govLookupUpdateForKnownPlate({
        govState: gov.state,
        plateNormalized,
        govIdentity: gov.identity,
        provenance,
        lowOcr: Boolean(lowOcr),
      }),
    });
  } else {
    return { ok: false as const, error: "plate_required" as const };
  }

  const candidate = await loadCandidateReviewRow(input.dealerId, c.id);
  return { ok: true as const, candidate: candidate! };
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
  /** Review UI resolve+commit in one step */
  commitAfterResolve?: boolean;
}) {
  const c = await prisma.vehicleCandidate.findFirst({
    where: { id: input.candidateId, dealerId: input.dealerId },
    include: { media: { include: { media: true } } },
  });
  if (!c) return { ok: false as const, error: "not_found" as const };
  if (c.status === "COMMITTED") {
    if (typeof input.askingPrice === "number" && input.askingPrice > 0) {
      const prev = (c.commercialJson ?? {}) as Record<string, unknown>;
      await prisma.vehicleCandidate.update({
        where: { id: c.id },
        data: {
          commercialJson: toPrismaJson({
            ...prev,
            askingPrice: input.askingPrice,
            offeredPrice: input.askingPrice,
          }),
        },
      });
    }
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

  const identity = await verifyIntakeCandidateIdentity({
    dealerId: input.dealerId,
    candidateId: input.candidateId,
    detectedPlate: input.detectedPlate,
    askingPrice: input.askingPrice,
    mileage: input.mileage,
    mediaCategories: input.mediaCategories,
  });
  if (!identity.ok) return identity;

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

  if (input.confirmExistingVehicleId) {
    const result = await commitOneCandidate(input.dealerId, c.id, {
      confirmExistingVehicleId: input.confirmExistingVehicleId,
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

  if (input.commitAfterResolve) {
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

  await emitExchangeEvent({
    eventType: "intake.candidate.review_resolved",
    dealerId: input.dealerId,
    eventData: { candidateId: c.id, result: "identity_verified" },
    operational: true,
  }).catch(() => undefined);

  return identity;
}

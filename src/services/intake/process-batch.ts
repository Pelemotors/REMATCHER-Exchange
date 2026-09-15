import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { lookupVehicleByPlate } from "@/services/identity/gov-vehicle";
import { extractCommercialFromText } from "@/services/intake/text-extract";
import { classifyIntakeMediaCategory } from "@/services/intake/media-classify";
import { commitReadyCandidates } from "@/services/intake/commit";

/**
 * Process a durable IntakeBatch into independent VehicleCandidates.
 * Candidate failures do not block siblings.
 */
export async function processIntakeBatch(dealerId: string, batchId: string) {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: batchId, dealerId },
    include: { media: true, texts: true, candidates: true },
  });
  if (!batch) return { ok: false as const, error: "not_found" as const };
  if (batch.candidates.length > 0) {
    return { ok: true as const, skipped: true as const };
  }

  await prisma.intakeBatch.update({
    where: { id: batch.id },
    data: { status: "PROCESSING", processingStartedAt: new Date() },
  });

  try {
    for (const media of batch.media) {
      if (!media.categoryHint) {
        const hint = await classifyIntakeMediaCategory(media.storageKey);
        if (hint) {
          await prisma.intakeMedia.update({
            where: { id: media.id },
            data: {
              categoryHint: hint.category,
              categoryConfidence: hint.confidence,
            },
          });
        }
      }
    }

    const combinedText = batch.texts.map((t) => t.text).join("\n");
    const commercial = extractCommercialFromText(combinedText);
    const plateFromText = commercial.plate?.value ?? null;

    // Phase-1 grouping: single candidate for the batch when one plate or unknown.
    // Multi-plate split is expanded after real WhatsApp multi-vehicle telemetry.
    const candidate = await prisma.vehicleCandidate.create({
      data: {
        batchId: batch.id,
        dealerId,
        status: "IDENTIFYING",
        detectedPlate: plateFromText,
        plateNormalized: plateFromText
          ? normalizePlate(plateFromText)
          : null,
        plateConfidence: plateFromText ? commercial.plate?.confidence ?? 0.6 : null,
        commercialJson: toPrismaJson(commercial.fields),
        fieldProvenance: toPrismaJson(commercial.provenance),
        media: {
          create: batch.media.map((m, i) => ({
            mediaId: m.id,
            sortOrder: m.originalOrder ?? i,
          })),
        },
      },
    });

    if (candidate.plateNormalized) {
      const gov = await lookupVehicleByPlate(candidate.plateNormalized);
      await prisma.vehicleCandidate.update({
        where: { id: candidate.id },
        data: {
          govState: gov.state,
          govIdentityJson: gov.identity
            ? toPrismaJson(gov.identity)
            : undefined,
          govLookedUpAt: new Date(),
          status: gov.state === "FOUND" ? "READY" : "NEEDS_INFO",
          reviewStatus: gov.state === "FOUND" ? "NONE" : "PENDING",
          missingFields: toPrismaJson(
            gov.state === "FOUND" ? [] : ["detectedPlate"]
          ),
          confidenceBand: gov.state === "FOUND" ? "HIGH" : "LOW",
        },
      });
    } else {
      await prisma.vehicleCandidate.update({
        where: { id: candidate.id },
        data: {
          status: "NEEDS_INFO",
          reviewStatus: "PENDING",
          missingFields: toPrismaJson(["detectedPlate"]),
          confidenceBand: "LOW",
        },
      });
    }

    await commitReadyCandidates(dealerId, batch.id);

    const openReview = await prisma.vehicleCandidate.count({
      where: {
        batchId: batch.id,
        status: { in: ["NEEDS_INFO", "NEEDS_CONFIRMATION"] },
      },
    });
    const failed = await prisma.vehicleCandidate.count({
      where: { batchId: batch.id, status: "REJECTED" },
    });
    const committed = await prisma.vehicleCandidate.count({
      where: { batchId: batch.id, status: "COMMITTED" },
    });

    let batchStatus: "NEEDS_REVIEW" | "READY" | "COMMITTED" | "PROCESSING" =
      "PROCESSING";
    if (openReview > 0) batchStatus = "NEEDS_REVIEW";
    else if (committed > 0 && failed + openReview === 0)
      batchStatus = "COMMITTED";
    else if (committed > 0) batchStatus = "READY";

    await prisma.intakeBatch.update({
      where: { id: batch.id },
      data: {
        status: batchStatus,
        processingCompletedAt: new Date(),
      },
    });

    return { ok: true as const };
  } catch (error) {
    await prisma.intakeBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        failureCode: "PROCESS_ERROR",
        failureMessage:
          error instanceof Error ? error.message : "process_failed",
        processingCompletedAt: new Date(),
      },
    });
    return { ok: false as const, error: "process_failed" as const };
  }
}

export function normalizePlate(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

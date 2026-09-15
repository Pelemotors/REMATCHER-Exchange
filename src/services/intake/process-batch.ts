import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { lookupVehicleByPlate } from "@/services/identity/gov-vehicle";
import { extractCommercialFromText } from "@/services/intake/text-extract";
import { classifyIntakeMediaCategory } from "@/services/intake/media-classify";
import { commitReadyCandidates } from "@/services/intake/commit";
import { emitExchangeEvent } from "@/services/exchange/events";
import {
  normalizePlate,
  refreshBatchStatus,
} from "@/services/intake/status";

/**
 * Process a durable IntakeBatch into independent VehicleCandidates.
 * Candidate failures do not block siblings.
 * Safe to re-enter: skips candidate creation if already present; continues
 * enrichment/commit for non-terminal candidates.
 */
export async function processIntakeBatch(dealerId: string, batchId: string) {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: batchId, dealerId },
    include: { media: true, texts: true, candidates: true },
  });
  if (!batch) return { ok: false as const, error: "not_found" as const };

  if (["COMMITTED", "FAILED"].includes(batch.status) && batch.candidates.every((c) => c.status === "COMMITTED" || c.status === "REJECTED")) {
    return { ok: true as const, skipped: true as const };
  }

  await prisma.intakeBatch.update({
    where: { id: batch.id },
    data: {
      status: "PROCESSING",
      processingStartedAt: batch.processingStartedAt ?? new Date(),
    },
  });

  await emitExchangeEvent({
    eventType: "intake.batch.process_started",
    dealerId,
    eventData: { batchId: batch.id },
    idempotencyKey: `intake-process-start:${batch.id}:${batch.updatedAt.toISOString()}`,
    operational: true,
  }).catch(() => undefined);

  try {
    for (const media of batch.media) {
      if (media.categoryHint == null && media.categoryConfidence == null) {
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
    let plates =
      commercial.plates.length > 0
        ? commercial.plates
        : commercial.plate
          ? [commercial.plate]
          : [];

    // Image → plate candidate when text has none (OCR optional; never invent).
    if (plates.length === 0 && batch.media.length > 0) {
      const { extractPlateFromImageBytes } = await import(
        "@/services/intake/plate-ocr"
      );
      const { resolveMediaAbsolutePath } = await import("@/lib/media/storage");
      const { readFile } = await import("node:fs/promises");
      for (const media of batch.media) {
        try {
          const abs = resolveMediaAbsolutePath(media.storageKey);
          const bytes = await readFile(abs);
          const ocr = await extractPlateFromImageBytes(bytes);
          if (ocr?.value) {
            plates = [
              {
                value: ocr.value,
                confidence: ocr.confidence,
                source: "OCR",
              },
            ];
            await emitExchangeEvent({
              eventType: "intake.plate.ocr",
              dealerId,
              eventData: {
                batchId: batch.id,
                mediaId: media.id,
                confidence: ocr.confidence,
              },
              operational: true,
            }).catch(() => undefined);
            break;
          }
        } catch {
          // continue other images — failure is non-fatal; review remains available
        }
      }
    }

    if (batch.candidates.length === 0) {
      const plateSlots =
        plates.length > 0
          ? plates
          : [{ value: null as string | null, confidence: null as number | null }];

      for (const slot of plateSlots) {
        const plateValue =
          typeof slot === "object" && slot && "value" in slot
            ? (slot.value as string | null)
            : null;
        const plateConfidence =
          typeof slot === "object" && slot && "confidence" in slot
            ? (slot.confidence as number | null)
            : null;

        await prisma.vehicleCandidate.create({
          data: {
            batchId: batch.id,
            dealerId,
            status: "IDENTIFYING",
            detectedPlate: plateValue,
            plateNormalized: plateValue ? normalizePlate(plateValue) : null,
            plateConfidence: plateValue ? plateConfidence ?? 0.6 : null,
            commercialJson: toPrismaJson(commercial.fields),
            fieldProvenance: toPrismaJson({
              ...commercial.provenance,
              ...(plateValue && plateConfidence != null && !commercial.plate
                ? {
                    detectedPlate: {
                      value: plateValue,
                      source: "OCR",
                      confidence: plateConfidence,
                    },
                  }
                : {}),
            }),
            media: {
              create: batch.media.map((m, i) => ({
                mediaId: m.id,
                sortOrder: m.originalOrder ?? i,
              })),
            },
          },
        });
      }
    }

    const candidates = await prisma.vehicleCandidate.findMany({
      where: {
        batchId: batch.id,
        dealerId,
        status: {
          in: ["DETECTED", "IDENTIFYING", "NEEDS_INFO", "READY"],
        },
      },
    });

    for (const candidate of candidates) {
      if (candidate.status === "READY") continue;
      await enrichCandidateIdentity(candidate.id, dealerId);
    }

    await commitReadyCandidates(dealerId, batch.id);
    await refreshBatchStatus(batch.id);

    await emitExchangeEvent({
      eventType: "intake.batch.process_completed",
      dealerId,
      eventData: { batchId: batch.id },
      idempotencyKey: `intake-process-done:${batch.id}:${Date.now()}`,
      operational: true,
    }).catch(() => undefined);

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
    await emitExchangeEvent({
      eventType: "intake.batch.process_failed",
      dealerId,
      eventData: {
        batchId: batch.id,
        message: error instanceof Error ? error.message : "process_failed",
      },
      operational: true,
    }).catch(() => undefined);
    return { ok: false as const, error: "process_failed" as const };
  }
}

async function enrichCandidateIdentity(candidateId: string, dealerId: string) {
  const candidate = await prisma.vehicleCandidate.findFirst({
    where: { id: candidateId, dealerId },
  });
  if (!candidate) return;
  if (["COMMITTED", "REJECTED", "NEEDS_CONFIRMATION"].includes(candidate.status)) {
    return;
  }

  if (candidate.plateNormalized) {
    const gov = await lookupVehicleByPlate(candidate.plateNormalized);
    await prisma.vehicleCandidate.update({
      where: { id: candidate.id },
      data: {
        govState: gov.state,
        govIdentityJson: gov.identity ? toPrismaJson(gov.identity) : undefined,
        govLookedUpAt: new Date(),
        status: gov.state === "FOUND" ? "READY" : "NEEDS_INFO",
        reviewStatus: gov.state === "FOUND" ? "NONE" : "PENDING",
        missingFields: toPrismaJson(
          gov.state === "FOUND" ? [] : ["detectedPlate"]
        ),
        confidenceBand: gov.state === "FOUND" ? "HIGH" : "LOW",
      },
    });
    await emitExchangeEvent({
      eventType: "intake.candidate.gov_lookup",
      dealerId,
      eventData: {
        candidateId: candidate.id,
        govState: gov.state,
      },
      operational: true,
    }).catch(() => undefined);
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
}

export { normalizePlate, refreshBatchStatus } from "@/services/intake/status";

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
import { planCandidateSlots } from "@/services/intake/grouping";
import type { ExtractedField } from "@/services/intake/text-extract";

/**
 * Process a durable IntakeBatch into VehicleCandidate(s).
 * Staged: classify → text → OCR (if needed) → GOV → Vision (if still incomplete).
 * Default grouping: one share → one candidate unless distinct plates.
 */
export async function processIntakeBatch(dealerId: string, batchId: string) {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: batchId, dealerId },
    include: { media: true, texts: true, candidates: true },
  });
  if (!batch) return { ok: false as const, error: "not_found" as const };

  if (
    ["COMMITTED", "FAILED"].includes(batch.status) &&
    batch.candidates.every(
      (c) => c.status === "COMMITTED" || c.status === "REJECTED"
    )
  ) {
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
    let plates: ExtractedField<string>[] =
      commercial.plates.length > 0
        ? commercial.plates
        : commercial.plate
          ? [commercial.plate]
          : [];

    // OCR only when text has no plates
    if (plates.length === 0 && batch.media.length > 0) {
      const { extractPlateFromImageBytes } = await import(
        "@/services/intake/plate-ocr"
      );
      const { resolveMediaAbsolutePath } = await import("@/lib/media/storage");
      const { readFile } = await import("node:fs/promises");
      // Cheap: try up to 3 images (document/exterior first if classified)
      const ordered = [...batch.media].sort((a, b) => {
        const rank = (c: string | null | undefined) =>
          c === "DOCUMENT" ? 0 : c === "EXTERIOR" ? 1 : 2;
        return rank(a.categoryHint) - rank(b.categoryHint);
      });
      for (const media of ordered.slice(0, 3)) {
        try {
          const abs = resolveMediaAbsolutePath(media.storageKey);
          const bytes = await readFile(abs);
          const ocr = await extractPlateFromImageBytes(bytes, {
            mimeType: media.mimeType ?? undefined,
            mediaId: media.id,
          });
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
          /* non-fatal */
        }
      }
    }

    let visionHint: Awaited<
      ReturnType<
        typeof import("@/services/intake/media-vision").understandIntakeMediaSample
      >
    > = null;

    // Vision only when identity still weak (no plate + no commercial make/model/year)
    const commercialFields = commercial.fields as Record<string, unknown>;
    const needsVision =
      plates.length === 0 &&
      batch.media.length > 0 &&
      !commercialFields.make &&
      !commercialFields.model;

    if (needsVision) {
      const { understandIntakeMediaSample } = await import(
        "@/services/intake/media-vision"
      );
      const { resolveMediaAbsolutePath } = await import("@/lib/media/storage");
      const { readFile } = await import("node:fs/promises");
      const images: Array<{ bytes: Buffer; mimeType?: string; mediaId?: string }> =
        [];
      for (const media of batch.media.slice(0, 2)) {
        try {
          const abs = resolveMediaAbsolutePath(media.storageKey);
          images.push({
            bytes: await readFile(abs),
            mimeType: media.mimeType ?? undefined,
            mediaId: media.id,
          });
        } catch {
          /* skip */
        }
      }
      visionHint = await understandIntakeMediaSample(images, {
        accompanyingText: combinedText,
        maxImages: 2,
      });
      if (visionHint?.plateDigitsHint && plates.length === 0) {
        const digits = visionHint.plateDigitsHint.replace(/\D/g, "");
        if (digits.length >= 7 && digits.length <= 8) {
          plates = [
            {
              value: digits,
              confidence: Math.min(0.55, visionHint.confidence),
              source: "VISION",
            },
          ];
        }
      }
      if (visionHint) {
        if (visionHint.makeHint && !commercialFields.make) {
          commercialFields.make = visionHint.makeHint;
          commercial.provenance.make = {
            value: visionHint.makeHint,
            source: "VISION",
            confidence: visionHint.confidence,
          };
        }
        if (visionHint.modelHint && !commercialFields.model) {
          commercialFields.model = visionHint.modelHint;
          commercial.provenance.model = {
            value: visionHint.modelHint,
            source: "VISION",
            confidence: visionHint.confidence,
          };
        }
        if (visionHint.yearHint && !commercialFields.year) {
          commercialFields.year = visionHint.yearHint;
          commercial.provenance.year = {
            value: visionHint.yearHint,
            source: "VISION",
            confidence: visionHint.confidence,
          };
        }
      }
    }

    if (batch.candidates.length === 0) {
      const slots = planCandidateSlots({
        plates,
        mediaCount: batch.media.length,
        visionLikelySameVehicle: visionHint?.likelySameVehicle ?? null,
      });

      for (const slot of slots) {
        const plateValue = slot.plate?.value ?? null;
        const plateConfidence = slot.plate?.confidence ?? null;
        const plateSource = slot.plate?.source ?? null;

        await prisma.vehicleCandidate.create({
          data: {
            batchId: batch.id,
            dealerId,
            status: "IDENTIFYING",
            detectedPlate: plateValue,
            plateNormalized: plateValue ? normalizePlate(plateValue) : null,
            plateConfidence: plateValue ? plateConfidence ?? 0.6 : null,
            commercialJson: toPrismaJson(commercialFields),
            fieldProvenance: toPrismaJson({
              ...commercial.provenance,
              ...(plateValue && plateSource
                ? {
                    detectedPlate: {
                      value: plateValue,
                      source: plateSource,
                      confidence: plateConfidence,
                    },
                  }
                : {}),
              grouping: { reason: slot.reason, mediaCount: batch.media.length },
              ...(visionHint
                ? {
                    vision: {
                      source: "VISION",
                      confidence: visionHint.confidence,
                      likelySameVehicle: visionHint.likelySameVehicle,
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
  if (
    ["COMMITTED", "REJECTED", "NEEDS_CONFIRMATION"].includes(candidate.status)
  ) {
    return;
  }

  if (candidate.plateNormalized) {
    const gov = await lookupVehicleByPlate(candidate.plateNormalized);
    const provenance =
      (candidate.fieldProvenance as Record<string, unknown> | null) ?? {};

    // OCR/VISION plate that GOV rejects → do not treat as READY identity
    const plateProv = provenance.detectedPlate as
      | { source?: string; confidence?: number }
      | undefined;
    const lowOcr =
      plateProv &&
      (plateProv.source === "OCR" || plateProv.source === "VISION") &&
      (plateProv.confidence ?? 1) < 0.55;

    if (gov.state === "FOUND") {
      await prisma.vehicleCandidate.update({
        where: { id: candidate.id },
        data: {
          govState: gov.state,
          govIdentityJson: gov.identity ? toPrismaJson(gov.identity) : undefined,
          govLookedUpAt: new Date(),
          status: "READY",
          reviewStatus: "NONE",
          missingFields: toPrismaJson([]),
          confidenceBand: "HIGH",
          fieldProvenance: toPrismaJson({
            ...provenance,
            govIdentity: { source: "GOV", confidence: 1 },
          }),
        },
      });
    } else {
      await prisma.vehicleCandidate.update({
        where: { id: candidate.id },
        data: {
          govState: gov.state,
          govLookedUpAt: new Date(),
          status: "NEEDS_INFO",
          reviewStatus: "PENDING",
          missingFields: toPrismaJson(["detectedPlate"]),
          confidenceBand: lowOcr ? "LOW" : "MEDIUM",
          conflictsJson:
            gov.state === "NOT_FOUND" || gov.state === "UNAVAILABLE"
              ? toPrismaJson([
                  {
                    type: "gov_plate_unverified",
                    plate: candidate.plateNormalized,
                    govState: gov.state,
                  },
                ])
              : undefined,
        },
      });
    }

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
    const commercial = (candidate.commercialJson ?? {}) as Record<
      string,
      unknown
    >;
    const missing: string[] = ["detectedPlate"];
    if (!commercial.make) missing.push("make");
    if (!commercial.model) missing.push("model");
    await prisma.vehicleCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "NEEDS_INFO",
        reviewStatus: "PENDING",
        missingFields: toPrismaJson(missing),
        confidenceBand: "LOW",
      },
    });
  }
}

export { normalizePlate, refreshBatchStatus } from "@/services/intake/status";

import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { lookupVehicleByPlate } from "@/services/identity/gov-vehicle";
import { extractCommercialFromText } from "@/services/intake/text-extract";
import { classifyIntakeMediaCategory } from "@/services/intake/media-classify";
import { emitExchangeEvent } from "@/services/exchange/events";
import {
  normalizePlate,
  refreshBatchStatus,
} from "@/services/intake/status";
import {
  assignMediaToIdentityGroups,
  INTAKE_GOV_CONCURRENCY,
  INTAKE_OCR_CONCURRENCY,
  mapWithConcurrency,
} from "@/services/intake/discovery";
import { classifyIntakeBatchMedia } from "@/services/intake/classify-intake-pass";
import type { ExtractedField } from "@/services/intake/text-extract";
import type { Prisma } from "@prisma/client";

type DiscoveryTrace = {
  ocrAttempted: boolean;
  ocrPlate: string | null;
  ocrConfidence: number | null;
  groupingCandidateKey: string | null;
  groupingResult: string | null;
  skipReason: string | null;
};

/**
 * Process a durable IntakeBatch into VehicleCandidate(s).
 * Per-media OCR (no first-hit stop). Distinct plates → distinct candidates.
 * Does NOT commit inventory — dealer intent is required.
 */
export async function processIntakeBatch(dealerId: string, batchId: string) {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: batchId, dealerId },
    include: { media: true, texts: true, candidates: true },
  });
  if (!batch) return { ok: false as const, error: "not_found" as const };

  const allTerminal =
    ["COMMITTED", "FAILED"].includes(batch.status) &&
    batch.candidates.length > 0 &&
    batch.candidates.every(
      (c) => c.status === "COMMITTED" || c.status === "REJECTED"
    );
  if (allTerminal) {
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
    await mapWithConcurrency(batch.media, 4, async (media) => {
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
    });

    const combinedText = batch.texts.map((t) => t.text).join("\n");
    const commercial = extractCommercialFromText(combinedText);
    const textPlates: ExtractedField<string>[] =
      commercial.plates.length > 0
        ? commercial.plates
        : commercial.plate
          ? [commercial.plate]
          : [];

    const mediaRows = await prisma.intakeMedia.findMany({
      where: { batchId: batch.id },
      orderBy: { originalOrder: "asc" },
    });

    const classified = await classifyIntakeBatchMedia({
      dealerId,
      batchId: batch.id,
      accompanyingText: combinedText,
    });

    const { extractPlateFromImageBytes } = await import(
      "@/services/intake/plate-ocr"
    );
    const { resolveMediaAbsolutePath } = await import("@/lib/media/storage");
    const { readFile } = await import("node:fs/promises");

    const ocrByMedia = new Map<
      string,
      { value: string; confidence: number }
    >();

    await mapWithConcurrency(mediaRows, INTAKE_OCR_CONCURRENCY, async (media) => {
      if (classified.skipOcrMediaIds.has(media.id)) {
        const existing = (media.discoveryJson as DiscoveryTrace | null) ?? null;
        await prisma.intakeMedia.update({
          where: { id: media.id },
          data: {
            discoveryJson: toPrismaJson({
              ...(existing ?? {
                ocrAttempted: false,
                ocrPlate: null,
                ocrConfidence: null,
                groupingCandidateKey: null,
                groupingResult: null,
                skipReason: null,
              }),
              ocrAttempted: false,
              skipReason: "conversation_or_document",
              groupingResult: "skipped_non_vehicle",
            }),
          },
        });
        return;
      }
      const existing = (media.discoveryJson as DiscoveryTrace | null) ?? null;
      if (existing?.ocrAttempted && existing.ocrPlate) {
        ocrByMedia.set(media.id, {
          value: existing.ocrPlate,
          confidence: existing.ocrConfidence ?? 0.6,
        });
        return;
      }
      let plate: { value: string; confidence: number } | null = null;
      let skipReason: string | null = null;
      try {
        const abs = resolveMediaAbsolutePath(media.storageKey);
        const bytes = await readFile(abs);
        const ocr = await extractPlateFromImageBytes(bytes, {
          mimeType: media.mimeType ?? undefined,
          mediaId: media.id,
        });
        if (ocr?.value) {
          plate = {
            value: normalizePlate(ocr.value),
            confidence: ocr.confidence,
          };
          ocrByMedia.set(media.id, plate);
          await emitExchangeEvent({
            eventType: "intake.plate.ocr",
            dealerId,
            eventData: {
              batchId: batch.id,
              mediaId: media.id,
              confidence: ocr.confidence,
              plate: plate.value,
            },
            operational: true,
          }).catch(() => undefined);
        } else {
          skipReason = "ocr_no_plate";
        }
      } catch {
        skipReason = "ocr_error";
      }
      const trace: DiscoveryTrace = {
        ocrAttempted: true,
        ocrPlate: plate?.value ?? null,
        ocrConfidence: plate?.confidence ?? null,
        groupingCandidateKey: null,
        groupingResult: null,
        skipReason,
      };
      await prisma.intakeMedia.update({
        where: { id: media.id },
        data: { discoveryJson: toPrismaJson(trace) },
      });
    });

    // Text plates apply as extra anchors if OCR missed them (not a vehicle by themselves).
    const discoveryInputs = mediaRows.map((m, i) => {
      const ocr = ocrByMedia.get(m.id);
      let plate = ocr?.value ?? null;
      if (!plate && textPlates.length === 1 && mediaRows.length === 1) {
        plate = normalizePlate(textPlates[0]!.value);
      }
      return {
        id: m.id,
        originalOrder: m.originalOrder ?? i,
        plateNormalized: plate,
        plateConfidence: ocr?.confidence ?? null,
      };
    });

    if (textPlates.length >= 2 && ocrByMedia.size === 0) {
      // Multiple plates in accompanying text only — one candidate per plate, media unresolved until assigned.
      for (const p of textPlates) {
        discoveryInputs.push({
          id: `text-anchor-${p.value}`,
          originalOrder: -1,
          plateNormalized: normalizePlate(p.value),
          plateConfidence: p.confidence ?? 0.7,
        });
      }
    }

    const groups = assignMediaToIdentityGroups(
      discoveryInputs.filter(
        (d) =>
          !d.id.startsWith("text-anchor-") &&
          !classified.skipOcrMediaIds.has(d.id)
      )
    );

    const commercialFields = commercial.fields as Record<string, unknown>;

    for (const group of groups) {
      const locked = await prisma.vehicleCandidate.findFirst({
        where: {
          batchId: batch.id,
          dealerId,
          plateNormalized: group.plate,
          status: { in: ["COMMITTED", "REJECTED"] },
        },
      });
      if (locked) continue;

      const existing = await prisma.vehicleCandidate.findFirst({
        where: {
          batchId: batch.id,
          dealerId,
          ...(group.plate
            ? { plateNormalized: group.plate }
            : { plateNormalized: null, status: { notIn: ["COMMITTED", "REJECTED"] } }),
        },
      });

      const plateField = group.plate
        ? {
            value: group.plate,
            confidence:
              discoveryInputs.find((d) => d.plateNormalized === group.plate)
                ?.plateConfidence ?? 0.7,
            source: ocrByMedia.size ? "OCR" : "TEXT",
          }
        : null;

      const provenance = {
        ...commercial.provenance,
        ...(plateField
          ? {
              detectedPlate: {
                value: plateField.value,
                source: plateField.source,
                confidence: plateField.confidence,
              },
            }
          : {}),
        grouping: {
          reason: group.groupingReason,
          mediaCount: group.mediaIds.length,
          batchMediaCount: mediaRows.length,
        },
      };

      let candidateId = existing?.id;
      if (!candidateId) {
        const created = await prisma.vehicleCandidate.create({
          data: {
            batchId: batch.id,
            dealerId,
            status: group.plate ? "IDENTIFYING" : "NEEDS_INFO",
            detectedPlate: group.plate,
            plateNormalized: group.plate,
            plateConfidence: plateField?.confidence ?? null,
            commercialJson: toPrismaJson(commercialFields),
            fieldProvenance: toPrismaJson(provenance),
            confidenceBand: group.plate ? "MEDIUM" : "LOW",
            missingFields: group.plate
              ? toPrismaJson([])
              : toPrismaJson(["detectedPlate"]),
            reviewStatus: group.plate ? "NONE" : "PENDING",
            media: {
              create: group.mediaIds.map((mediaId, i) => ({
                mediaId,
                sortOrder: i,
              })),
            },
          },
        });
        candidateId = created.id;
      } else {
        await prisma.vehicleCandidate.update({
          where: { id: candidateId },
          data: {
            detectedPlate: group.plate ?? existing?.detectedPlate,
            plateNormalized: group.plate ?? existing?.plateNormalized,
            plateConfidence: plateField?.confidence ?? existing?.plateConfidence,
            fieldProvenance: toPrismaJson(provenance),
            status:
              existing?.status === "READY" || existing?.dealerIntent
                ? existing.status
                : group.plate
                  ? "IDENTIFYING"
                  : "NEEDS_INFO",
          },
        });
        await prisma.vehicleCandidateMedia.deleteMany({
          where: { candidateId },
        });
        if (group.mediaIds.length) {
          await prisma.vehicleCandidateMedia.createMany({
            data: group.mediaIds.map((mediaId, i) => ({
              candidateId: candidateId!,
              mediaId,
              sortOrder: i,
            })),
          });
        }
      }

      const assignmentByMedia = new Map(
        group.assignments.map((a) => [a.mediaId, a])
      );
      for (const mediaId of group.mediaIds) {
        const a = assignmentByMedia.get(mediaId);
        const media = mediaRows.find((row) => row.id === mediaId);
        const prev = (media?.discoveryJson as DiscoveryTrace | null) ?? {
          ocrAttempted: false,
          ocrPlate: null,
          ocrConfidence: null,
          groupingCandidateKey: null,
          groupingResult: null,
          skipReason: null,
        };
        await prisma.intakeMedia.update({
          where: { id: mediaId },
          data: {
            discoveryJson: toPrismaJson({
              ...prev,
              groupingCandidateKey: candidateId,
              groupingResult: a?.reason ?? group.groupingReason,
              skipReason: prev.skipReason,
            }),
          },
        });
      }
    }

    const assignedIds = new Set(groups.flatMap((g) => g.mediaIds));
    for (const media of mediaRows) {
      if (assignedIds.has(media.id)) continue;
      const prev = (media.discoveryJson as DiscoveryTrace | null) ?? {
        ocrAttempted: false,
        ocrPlate: null,
        ocrConfidence: null,
        groupingCandidateKey: null,
        groupingResult: null,
        skipReason: null,
      };
      await prisma.intakeMedia.update({
        where: { id: media.id },
        data: {
          discoveryJson: toPrismaJson({
            ...prev,
            groupingCandidateKey: null,
            groupingResult: "unresolved",
            skipReason: prev.skipReason ?? "unresolved_identity",
          }),
        },
      });
    }

    const candidates = await prisma.vehicleCandidate.findMany({
      where: {
        batchId: batch.id,
        dealerId,
        status: { in: ["DETECTED", "IDENTIFYING", "NEEDS_INFO", "READY"] },
      },
    });

    await mapWithConcurrency(candidates, INTAKE_GOV_CONCURRENCY, async (candidate) => {
      try {
        await enrichCandidateIdentity(candidate.id, dealerId);
      } catch {
        /* candidate independence — continue others */
      }
    });

    await refreshBatchStatus(batch.id);

    await emitExchangeEvent({
      eventType: "intake.batch.process_completed",
      dealerId,
      eventData: {
        batchId: batch.id,
        candidateCount: candidates.length,
        autoCommit: false,
      },
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

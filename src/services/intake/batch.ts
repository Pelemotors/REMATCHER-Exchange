import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { processVehicleImage, MediaValidationError } from "@/lib/media/process";
import {
  deleteMediaFile,
  isAllowedImageMime,
  publicThumbUrlForDisplayKey,
  publicUrlForStorageKey,
  writeMediaFile,
} from "@/lib/media/storage";
import type { IntakeSource, Prisma } from "@prisma/client";
import { emitExchangeEvent } from "@/services/exchange/events";
import { derivePlateIdentityState } from "@/services/intake/plate-identity";

/** Empirical: WhatsApp multi-share batches commonly stay under this; raise after device telemetry. */
export const INTAKE_MAX_FILES_PER_BATCH = 40;
/** Matches existing VehicleMedia pipeline input limit (12MB). */
export const INTAKE_MAX_FILE_BYTES = 12 * 1024 * 1024;

export async function createOrResumeIntakeBatch(input: {
  dealerId: string;
  source: IntakeSource;
  clientBatchId: string;
  sourceMetadata?: Record<string, unknown>;
}) {
  const existing = await prisma.intakeBatch.findUnique({
    where: {
      dealerId_clientBatchId: {
        dealerId: input.dealerId,
        clientBatchId: input.clientBatchId,
      },
    },
  });
  if (existing) {
    return { ok: true as const, batch: existing, resumed: true as const };
  }

  const batch = await prisma.intakeBatch.create({
    data: {
      dealerId: input.dealerId,
      source: input.source,
      clientBatchId: input.clientBatchId,
      status: "RECEIVING",
      sourceMetadata: (input.sourceMetadata ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
    },
  });
  return { ok: true as const, batch, resumed: false as const };
}

export async function addIntakeMedia(input: {
  dealerId: string;
  batchId: string;
  file: File;
  originalOrder?: number;
}) {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: input.batchId, dealerId: input.dealerId },
  });
  if (!batch) return { ok: false as const, error: "not_found" as const };
  if (["COMMITTED", "FAILED"].includes(batch.status)) {
    return { ok: false as const, error: "batch_closed" as const };
  }

  const count = await prisma.intakeMedia.count({ where: { batchId: batch.id } });
  if (count >= INTAKE_MAX_FILES_PER_BATCH) {
    return { ok: false as const, error: "limit" as const };
  }

  const mime = input.file.type || "application/octet-stream";
  if (!isAllowedImageMime(mime)) {
    return { ok: false as const, error: "invalid_type" as const };
  }

  const bytes = Buffer.from(await input.file.arrayBuffer());
  if (bytes.length > INTAKE_MAX_FILE_BYTES) {
    return { ok: false as const, error: "FILE_TOO_LARGE" as const };
  }

  let processed;
  try {
    processed = await processVehicleImage(bytes);
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }

  const checksum = createHash("sha256").update(processed.display).digest("hex");
  const token = randomBytes(16).toString("hex");
  const displayKey = `intake/${input.dealerId}/${batch.id}/display-${token}.webp`;
  const thumbKey = `intake/${input.dealerId}/${batch.id}/thumb-${token}.webp`;

  await writeMediaFile(displayKey, processed.display);
  await writeMediaFile(thumbKey, processed.thumb);

  const media = await prisma.intakeMedia.create({
    data: {
      batchId: batch.id,
      storageKey: displayKey,
      mimeType: processed.mimeType,
      bytes: processed.bytes,
      width: processed.width,
      height: processed.height,
      checksum,
      originalOrder: input.originalOrder ?? count,
      processingStatus: "READY",
    },
  });

  if (batch.status === "RECEIVING") {
    await prisma.intakeBatch.update({
      where: { id: batch.id },
      data: { status: "RECEIVED" },
    });
  }

  return {
    ok: true as const,
    media: {
      id: media.id,
      url: publicUrlForStorageKey(media.storageKey),
      thumbUrl: publicThumbUrlForDisplayKey(media.storageKey),
      originalOrder: media.originalOrder,
      checksum: media.checksum,
      storageKey: media.storageKey,
    },
  };
}

export async function addIntakeText(input: {
  dealerId: string;
  batchId: string;
  text: string;
  provenance?: string;
}) {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: input.batchId, dealerId: input.dealerId },
  });
  if (!batch) return { ok: false as const, error: "not_found" as const };
  const text = input.text.trim();
  if (!text) return { ok: false as const, error: "empty" as const };

  const row = await prisma.intakeText.create({
    data: {
      batchId: batch.id,
      text,
      provenance: input.provenance ?? "WHATSAPP_TEXT",
    },
  });
  return { ok: true as const, text: row };
}

/** Server ACK — durable point after which client may show "קיבלנו" and cleanup. */
export async function acknowledgeIntakeBatch(input: {
  dealerId: string;
  batchId: string;
}) {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: input.batchId, dealerId: input.dealerId },
    include: { _count: { select: { media: true, texts: true } } },
  });
  if (!batch) return { ok: false as const, error: "not_found" as const };
  if (batch._count.media === 0 && batch._count.texts === 0) {
    return { ok: false as const, error: "empty_batch" as const };
  }

  if (batch.acknowledgedAt) {
    return {
      ok: true as const,
      batchId: batch.id,
      status: batch.status,
      mediaCount: batch._count.media,
      textCount: batch._count.texts,
      acknowledgedAt: batch.acknowledgedAt.toISOString(),
      idempotent: true as const,
    };
  }

  const now = new Date();
  const updated = await prisma.intakeBatch.update({
    where: { id: batch.id },
    data: {
      status: batch.status === "RECEIVING" ? "RECEIVED" : batch.status,
      acknowledgedAt: now,
    },
  });

  await emitExchangeEvent({
    eventType: "intake.batch.acknowledged",
    dealerId: input.dealerId,
    eventData: {
      batchId: updated.id,
      mediaCount: batch._count.media,
      textCount: batch._count.texts,
    },
    idempotencyKey: `intake-ack:${updated.id}`,
    operational: true,
  }).catch(() => undefined);

  return {
    ok: true as const,
    batchId: updated.id,
    status: updated.status,
    mediaCount: batch._count.media,
    textCount: batch._count.texts,
    acknowledgedAt: now.toISOString(),
  };
}

export async function getIntakeBatchForDealer(input: {
  dealerId: string;
  batchId: string;
}) {
  const batch = await prisma.intakeBatch.findFirst({
    where: { id: input.batchId, dealerId: input.dealerId },
    include: {
      media: { orderBy: { originalOrder: "asc" } },
      texts: true,
      candidates: {
        orderBy: { createdAt: "asc" },
        include: { media: true },
      },
    },
  });
  if (!batch) return { ok: false as const, error: "not_found" as const };

  return {
    ok: true as const,
    batch: {
      id: batch.id,
      source: batch.source,
      status: batch.status,
      clientBatchId: batch.clientBatchId,
      receivedAt: batch.receivedAt.toISOString(),
      acknowledgedAt: batch.acknowledgedAt?.toISOString() ?? null,
      failureCode: batch.failureCode,
      failureMessage: batch.failureMessage,
      demandDraft:
        batch.sourceMetadata &&
        typeof batch.sourceMetadata === "object" &&
        !Array.isArray(batch.sourceMetadata) &&
        "demandDraft" in batch.sourceMetadata
          ? (batch.sourceMetadata as { demandDraft?: unknown }).demandDraft ?? null
          : null,
      media: batch.media.map((m) => ({
        id: m.id,
        url: publicUrlForStorageKey(m.storageKey),
        thumbUrl: publicThumbUrlForDisplayKey(m.storageKey),
        storageKey: m.storageKey,
        originalOrder: m.originalOrder,
        categoryHint: m.categoryHint,
        processingStatus: m.processingStatus,
        discovery: m.discoveryJson,
      })),
      texts: batch.texts.map((t) => ({
        id: t.id,
        text: t.text,
        provenance: t.provenance,
      })),
      candidates: [...batch.candidates]
        .sort((a, b) => {
          const ao = a.media[0]?.sortOrder ?? 0;
          const bo = b.media[0]?.sortOrder ?? 0;
          return ao - bo;
        })
        .map((c) => {
          const gov = (c.govIdentityJson ?? null) as {
            make?: string | null;
            model?: string | null;
            year?: number | null;
            fuel?: string | null;
            fuelType?: string | null;
            engine?: string | null;
            engineDisplacementCc?: number | null;
            trim?: string | null;
          } | null;
          const commercial = (c.commercialJson ?? null) as {
            offeredPrice?: number | null;
            askingPrice?: number | null;
            b2bPrice?: number | null;
            retailPrice?: number | null;
            price?: number | null;
          } | null;
          const offeredPrice =
            (typeof commercial?.offeredPrice === "number"
              ? commercial.offeredPrice
              : null) ??
            (typeof commercial?.askingPrice === "number"
              ? commercial.askingPrice
              : null) ??
            (typeof commercial?.b2bPrice === "number" ? commercial.b2bPrice : null) ??
            (typeof commercial?.price === "number" ? commercial.price : null);
          const engine =
            gov?.engine ??
            (typeof gov?.engineDisplacementCc === "number"
              ? String(gov.engineDisplacementCc)
              : null);
          const thumbMedia = c.media[0]
            ? batch.media.find((m) => m.id === c.media[0]!.mediaId)
            : null;
          return {
            id: c.id,
            status: c.status,
            reviewStatus: c.reviewStatus,
            detectedPlate: c.detectedPlate,
            plate: c.detectedPlate,
            plateNormalized: c.plateNormalized,
            dealerIntent: c.dealerIntent,
            confidenceBand: c.confidenceBand,
            missingFields: c.missingFields,
            plateIdentityState: derivePlateIdentityState({
              plateNormalized: c.plateNormalized,
              govState: c.govState,
            }),
            committedVehicleId: c.committedVehicleId,
            existingVehicleId: c.existingVehicleId,
            govState: c.govState,
            govIdentity: gov,
            make: gov?.make ?? null,
            model: gov?.model ?? null,
            year: gov?.year ?? null,
            fuel: gov?.fuel ?? gov?.fuelType ?? null,
            engine,
            trim: gov?.trim ?? null,
            offeredPrice,
            askingPrice: offeredPrice,
            thumbUrl: thumbMedia
              ? publicThumbUrlForDisplayKey(thumbMedia.storageKey)
              : null,
            mediaIds: c.media.map((row) => row.mediaId),
          };
        }),
      unresolvedMedia: batch.media
        .filter((m) => {
          const assigned = batch.candidates.some((c) =>
            c.media.some((row) => row.mediaId === m.id)
          );
          const d = m.discoveryJson as {
            groupingResult?: string | null;
            inputKind?: string | null;
          } | null;
          if (d?.inputKind === "CUSTOMER_CONVERSATION" || d?.inputKind === "DOCUMENT") {
            return false;
          }
          if (d?.groupingResult === "skipped_non_vehicle") return false;
          return !assigned || d?.groupingResult === "unresolved";
        })
        .map((m) => ({
          id: m.id,
          thumbUrl: publicThumbUrlForDisplayKey(m.storageKey),
          originalOrder: m.originalOrder,
          categoryHint: m.categoryHint,
          discovery: m.discoveryJson,
        })),
    },
  };
}

export async function listIntakeBatchesForDealer(dealerId: string) {
  const rows = await prisma.intakeBatch.findMany({
    where: { dealerId },
    orderBy: { receivedAt: "desc" },
    take: 30,
    include: {
      _count: { select: { media: true, texts: true, candidates: true } },
    },
  });
  return rows.map((b) => ({
    id: b.id,
    status: b.status,
    source: b.source,
    receivedAt: b.receivedAt.toISOString(),
    acknowledgedAt: b.acknowledgedAt?.toISOString() ?? null,
    mediaCount: b._count.media,
    textCount: b._count.texts,
    candidateCount: b._count.candidates,
  }));
}

/** Cleanup helper — only deletes keys under intake/{dealerId}/ */
export async function safeDeleteIntakeStorageKey(
  dealerId: string,
  storageKey: string
) {
  const prefix = `intake/${dealerId}/`;
  if (!storageKey.startsWith(prefix)) {
    throw new Error("INVALID_INTAKE_KEY");
  }
  await deleteMediaFile(storageKey);
  const thumb = storageKey.replace(/\/display-/, "/thumb-");
  if (thumb !== storageKey) await deleteMediaFile(thumb).catch(() => undefined);
}

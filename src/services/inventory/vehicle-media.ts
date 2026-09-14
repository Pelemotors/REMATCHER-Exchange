import "server-only";
import { prisma } from "@/lib/prisma";
import { processVehicleImage, MediaValidationError } from "@/lib/media/process";
import {
  buildVehicleMediaKeyPair,
  deleteMediaFile,
  isAllowedImageMime,
  publicThumbUrlForDisplayKey,
  publicUrlForStorageKey,
  thumbKeyFromDisplayKey,
  writeMediaFile,
} from "@/lib/media/storage";
import { refreshVehicleMediaReady } from "@/services/inventory/media-readiness";
import type { VehicleMediaCategory } from "@prisma/client";

const MAX_MEDIA_PER_VEHICLE = 24;

export async function uploadVehicleImageForDealer(input: {
  dealerId: string;
  vehicleId: string;
  category: VehicleMediaCategory;
  file: File;
}) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: input.dealerId },
    select: { id: true },
  });
  if (!vehicle) return { ok: false as const, error: "not_found" as const };

  const count = await prisma.vehicleMedia.count({
    where: { vehicleId: input.vehicleId },
  });
  if (count >= MAX_MEDIA_PER_VEHICLE) {
    return { ok: false as const, error: "limit" as const };
  }

  const mime = input.file.type || "application/octet-stream";
  if (!isAllowedImageMime(mime)) {
    return { ok: false as const, error: "invalid_type" as const };
  }

  const bytes = Buffer.from(await input.file.arrayBuffer());
  let processed;
  try {
    processed = await processVehicleImage(bytes);
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }

  const { displayKey, thumbKey } = buildVehicleMediaKeyPair({
    dealerId: input.dealerId,
    vehicleId: input.vehicleId,
    ext: processed.ext,
  });

  await writeMediaFile(displayKey, processed.display);
  await writeMediaFile(thumbKey, processed.thumb);

  const makePrimary = count === 0;
  if (makePrimary) {
    await prisma.vehicleMedia.updateMany({
      where: { vehicleId: input.vehicleId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const media = await prisma.vehicleMedia.create({
    data: {
      vehicleId: input.vehicleId,
      type: "IMAGE",
      category: input.category,
      storageKey: displayKey,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      bytes: processed.bytes,
      sortOrder: count,
      isPrimary: makePrimary,
    },
  });

  const readiness = await refreshVehicleMediaReady(input.vehicleId);

  return {
    ok: true as const,
    media: {
      id: media.id,
      category: media.category,
      isPrimary: media.isPrimary,
      sortOrder: media.sortOrder,
      url: publicUrlForStorageKey(media.storageKey),
      thumbUrl: publicThumbUrlForDisplayKey(media.storageKey),
      width: media.width,
      height: media.height,
    },
    readiness,
  };
}

export async function deleteVehicleMediaForDealer(input: {
  dealerId: string;
  mediaId: string;
}) {
  const media = await prisma.vehicleMedia.findFirst({
    where: {
      id: input.mediaId,
      vehicle: { dealerId: input.dealerId },
    },
  });
  if (!media) return { ok: false as const, error: "not_found" as const };

  await prisma.vehicleMedia.delete({ where: { id: media.id } });
  await deleteMediaFile(media.storageKey);
  const thumb = thumbKeyFromDisplayKey(media.storageKey);
  if (thumb) await deleteMediaFile(thumb).catch(() => undefined);

  if (media.isPrimary) {
    const next = await prisma.vehicleMedia.findFirst({
      where: { vehicleId: media.vehicleId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (next) {
      await prisma.vehicleMedia.update({
        where: { id: next.id },
        data: { isPrimary: true },
      });
    }
  }

  const readiness = await refreshVehicleMediaReady(media.vehicleId);
  return { ok: true as const, readiness };
}

export async function listVehicleMediaForDealer(input: {
  dealerId: string;
  vehicleId: string;
}) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: input.dealerId },
    select: { id: true, mediaReady: true },
  });
  if (!vehicle) return { ok: false as const, error: "not_found" as const };

  const media = await prisma.vehicleMedia.findMany({
    where: { vehicleId: input.vehicleId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return {
    ok: true as const,
    mediaReady: vehicle.mediaReady,
    media: media.map((m) => ({
      id: m.id,
      category: m.category,
      isPrimary: m.isPrimary,
      sortOrder: m.sortOrder,
      url: publicUrlForStorageKey(m.storageKey),
      thumbUrl: publicThumbUrlForDisplayKey(m.storageKey),
      width: m.width,
      height: m.height,
    })),
  };
}

export async function setPrimaryVehicleMediaForDealer(input: {
  dealerId: string;
  mediaId: string;
}) {
  const media = await prisma.vehicleMedia.findFirst({
    where: {
      id: input.mediaId,
      vehicle: { dealerId: input.dealerId },
    },
  });
  if (!media) return { ok: false as const, error: "not_found" as const };

  await prisma.$transaction([
    prisma.vehicleMedia.updateMany({
      where: { vehicleId: media.vehicleId, isPrimary: true },
      data: { isPrimary: false },
    }),
    prisma.vehicleMedia.update({
      where: { id: media.id },
      data: { isPrimary: true },
    }),
  ]);

  return { ok: true as const };
}

export async function reorderVehicleMediaForDealer(input: {
  dealerId: string;
  vehicleId: string;
  orderedMediaIds: string[];
}) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: input.dealerId },
    select: { id: true },
  });
  if (!vehicle) return { ok: false as const, error: "not_found" as const };

  const existing = await prisma.vehicleMedia.findMany({
    where: { vehicleId: input.vehicleId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((m) => m.id));
  if (
    input.orderedMediaIds.length !== existingIds.size ||
    input.orderedMediaIds.some((id) => !existingIds.has(id))
  ) {
    return { ok: false as const, error: "invalid_order" as const };
  }

  await prisma.$transaction(
    input.orderedMediaIds.map((id, index) =>
      prisma.vehicleMedia.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  return { ok: true as const };
}

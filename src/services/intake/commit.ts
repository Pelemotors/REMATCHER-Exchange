import "server-only";
import { prisma } from "@/lib/prisma";
import { createVehicleForDealer } from "@/services/inventory/create-vehicle";
import { uploadVehicleImageForDealer } from "@/services/inventory/vehicle-media";
import { readFile } from "node:fs/promises";
import { resolveMediaAbsolutePath } from "@/lib/media/storage";
import { refreshVehicleMediaReady } from "@/services/inventory/media-readiness";
import type { GovVehicleIdentity } from "@/services/identity/gov-vehicle";
import type { VehicleMediaCategory } from "@prisma/client";

/**
 * Commit each READY candidate independently.
 * Does not require the whole Batch to be READY.
 */
export async function commitReadyCandidates(
  dealerId: string,
  batchId: string
) {
  const candidates = await prisma.vehicleCandidate.findMany({
    where: { batchId, dealerId, status: "READY" },
    include: {
      media: { include: { media: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  for (const c of candidates) {
    try {
      await commitOneCandidate(dealerId, c.id);
    } catch {
      await prisma.vehicleCandidate.update({
        where: { id: c.id },
        data: {
          status: "NEEDS_INFO",
          reviewStatus: "PENDING",
          failureCode: "COMMIT_FAILED",
        },
      });
    }
  }
}

export async function commitOneCandidate(dealerId: string, candidateId: string) {
  const c = await prisma.vehicleCandidate.findFirst({
    where: { id: candidateId, dealerId },
    include: {
      media: { include: { media: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!c) return { ok: false as const, error: "not_found" as const };
  if (c.status === "COMMITTED" && c.committedVehicleId) {
    return { ok: true as const, vehicleId: c.committedVehicleId, idempotent: true };
  }

  const gov = c.govIdentityJson as GovVehicleIdentity | null;
  const commercial = (c.commercialJson ?? {}) as Record<string, unknown>;

  // Dedupe by plate within dealer
  if (c.plateNormalized) {
    const existing = await prisma.vehicle.findFirst({
      where: {
        dealerId,
        status: { in: ["ACTIVE", "SOLD", "ARCHIVED"] },
        OR: [
          { rawInput: { contains: `plate:${c.plateNormalized}` } },
          {
            fieldProvenance: {
              path: ["licensePlate", "value"],
              equals: c.plateNormalized,
            },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });
    if (existing) {
      await attachMediaToExisting(dealerId, existing.id, c.media.map((m) => m.media));
      await prisma.vehicleCandidate.update({
        where: { id: c.id },
        data: {
          status: "COMMITTED",
          existingVehicleId: existing.id,
          committedVehicleId: existing.id,
          reviewStatus: "RESOLVED",
        },
      });
      return { ok: true as const, vehicleId: existing.id, deduped: true };
    }
  }

  const created = await createVehicleForDealer({
    dealerId,
    rawInput: c.detectedPlate
      ? `intake plate:${c.plateNormalized ?? c.detectedPlate}`
      : "intake",
    source: "domain",
    skipRematch: true,
    requireIdentity: false,
    fields: {
      make: gov?.make ?? null,
      model: gov?.model ?? null,
      year: gov?.year ?? null,
      trim: gov?.trim ?? null,
      color: gov?.color ?? null,
      mileage:
        typeof commercial.mileage === "number" ? commercial.mileage : null,
      b2bPrice:
        typeof commercial.askingPrice === "number"
          ? commercial.askingPrice
          : null,
      ownershipHand:
        typeof commercial.ownershipHand === "number"
          ? commercial.ownershipHand
          : null,
      fieldProvenance: {
        licensePlate: c.plateNormalized
          ? { value: c.plateNormalized, source: "GOV_OR_TEXT" }
          : undefined,
        ...(typeof c.fieldProvenance === "object" && c.fieldProvenance
          ? (c.fieldProvenance as object)
          : {}),
        govIdentity: gov ?? undefined,
      },
    },
  });

  if (!created.ok) {
    throw new Error(created.error);
  }

  await attachMediaToExisting(
    dealerId,
    created.vehicle.id,
    c.media.map((m) => m.media)
  );
  await refreshVehicleMediaReady(created.vehicle.id);

  await prisma.vehicleCandidate.update({
    where: { id: c.id },
    data: {
      status: "COMMITTED",
      committedVehicleId: created.vehicle.id,
      reviewStatus: "RESOLVED",
    },
  });

  return { ok: true as const, vehicleId: created.vehicle.id };
}

async function attachMediaToExisting(
  dealerId: string,
  vehicleId: string,
  mediaRows: Array<{
    storageKey: string;
    categoryHint: VehicleMediaCategory | null;
    mimeType: string;
  }>
) {
  for (const row of mediaRows) {
    const category: VehicleMediaCategory =
      row.categoryHint && row.categoryHint !== "OTHER"
        ? row.categoryHint
        : "EXTERIOR";
    try {
      const abs = resolveMediaAbsolutePath(row.storageKey);
      const buf = await readFile(abs);
      const file = new File([buf], "intake.webp", {
        type: row.mimeType || "image/webp",
      });
      await uploadVehicleImageForDealer({
        dealerId,
        vehicleId,
        category,
        file,
      });
    } catch {
      // continue other images
    }
  }
}

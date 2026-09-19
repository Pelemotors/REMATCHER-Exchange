import "server-only";
import { prisma } from "@/lib/prisma";
import { createVehicleForDealer } from "@/services/inventory/create-vehicle";
import { uploadVehicleImageForDealer } from "@/services/inventory/vehicle-media";
import { readFile } from "node:fs/promises";
import { resolveMediaAbsolutePath } from "@/lib/media/storage";
import { refreshVehicleMediaReady } from "@/services/inventory/media-readiness";
import type { GovVehicleIdentity } from "@/services/identity/gov-vehicle";
import type { VehicleMediaCategory, Prisma } from "@prisma/client";
import { emitExchangeEvent } from "@/services/exchange/events";
import { refreshBatchStatus } from "@/services/intake/status";
import { toPrismaJson } from "@/lib/prisma-json";

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

export async function commitOneCandidate(
  dealerId: string,
  candidateId: string,
  opts?: {
    confirmExistingVehicleId?: string;
    skipDedupe?: boolean;
    dealerRelationship?: import("@prisma/client").DealerVehicleRelationship;
  }
) {
  const c = await prisma.vehicleCandidate.findFirst({
    where: { id: candidateId, dealerId },
    include: {
      media: { include: { media: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!c) return { ok: false as const, error: "not_found" as const };
  if (c.status === "COMMITTED" && c.committedVehicleId) {
    return {
      ok: true as const,
      vehicleId: c.committedVehicleId,
      idempotent: true as const,
    };
  }

  const gov = c.govIdentityJson as GovVehicleIdentity | null;
  const commercial = (c.commercialJson ?? {}) as Record<string, unknown>;

  // Dedupe by plate within dealer:
  // - ACTIVE + additive/non-conflicting → idempotent merge (attach media)
  // - ACTIVE + material conflict → NEEDS_CONFIRMATION
  // - SOLD/ARCHIVED → create NEW vehicle (no auto-reactivation)
  if (c.plateNormalized && !opts?.skipDedupe) {
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
      if (existing.status === "SOLD" || existing.status === "ARCHIVED") {
        // Fall through to create a new ACTIVE vehicle
      } else if (existing.status === "ACTIVE") {
        const conflict = detectMaterialConflict(existing, commercial, gov);
        const confirmed =
          opts?.confirmExistingVehicleId &&
          opts.confirmExistingVehicleId === existing.id;

        if (conflict && !confirmed) {
          await prisma.vehicleCandidate.update({
            where: { id: c.id },
            data: {
              status: "NEEDS_CONFIRMATION",
              reviewStatus: "PENDING",
              existingVehicleId: existing.id,
              missingFields: toPrismaJson([
                "confirmExistingVehicle",
                ...conflict,
              ]) as Prisma.InputJsonValue,
              conflictsJson: toPrismaJson({ fields: conflict }),
            },
          });
          await refreshBatchStatus(c.batchId);
          await emitExchangeEvent({
            eventType: "intake.candidate.needs_confirmation",
            dealerId,
            vehicleId: existing.id,
            eventData: {
              candidateId: c.id,
              existingVehicleId: existing.id,
              conflicts: conflict,
            },
            operational: true,
          }).catch(() => undefined);
          return {
            ok: false as const,
            error: "needs_confirmation" as const,
            existingVehicleId: existing.id,
          };
        }

        // Additive merge / explicit confirm
        await attachMediaToExisting(
          dealerId,
          existing.id,
          c.media.map((m) => m.media)
        );
        await applyAdditiveCommercial(existing.id, commercial);
        if (opts?.dealerRelationship) {
          const forcePrivate =
            opts.dealerRelationship !== "OWNED" &&
            opts.dealerRelationship !== "INVENTORY";
          await prisma.vehicle.update({
            where: { id: existing.id },
            data: {
              dealerRelationship: opts.dealerRelationship,
              ...(forcePrivate ? { visibility: "PRIVATE" } : {}),
            },
          });
        }
        await refreshVehicleMediaReady(existing.id);
        await prisma.vehicleCandidate.update({
          where: { id: c.id },
          data: {
            status: "COMMITTED",
            existingVehicleId: existing.id,
            committedVehicleId: existing.id,
            reviewStatus: "RESOLVED",
          },
        });
        await emitExchangeEvent({
          eventType: "intake.candidate.committed_existing",
          dealerId,
          vehicleId: existing.id,
          eventData: {
            candidateId: c.id,
            deduped: true,
            confirmed: Boolean(confirmed),
          },
          operational: true,
        }).catch(() => undefined);
        await refreshBatchStatus(c.batchId);
        return { ok: true as const, vehicleId: existing.id, deduped: true };
      }
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
    // Intent required: default private/non-inventory until dealer chooses
    dealerRelationship: opts?.dealerRelationship ?? "OFFERED_TO_ME",
    visibility: "PRIVATE",
    fields: {
      make: gov?.make ?? null,
      model: gov?.model ?? null,
      year: gov?.year ?? null,
      trim: gov?.trim ?? null,
      color: gov?.color ?? null,
      mileage:
        typeof commercial.mileage === "number" ? commercial.mileage : null,
      b2bPrice:
        (opts?.dealerRelationship === "OWNED" ||
          opts?.dealerRelationship === "INVENTORY") &&
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
    return {
      ok: false as const,
      error: created.error,
      message: "message" in created ? created.message : undefined,
    };
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
      dealerIntent: opts?.dealerRelationship
        ? opts.dealerRelationship === "INVENTORY"
          ? "OWNED"
          : opts.dealerRelationship
        : undefined,
    },
  });

  await emitExchangeEvent({
    eventType: "intake.candidate.committed_new",
    dealerId,
    vehicleId: created.vehicle.id,
    eventData: { candidateId: c.id },
    operational: true,
  }).catch(() => undefined);
  await refreshBatchStatus(c.batchId);

  return { ok: true as const, vehicleId: created.vehicle.id };
}

type MaterialConflict = "price" | "mileage" | "identity";

/** Material conflicts only — additive fills (null→value) are not conflicts. */
function detectMaterialConflict(
  existing: {
    make: string | null;
    model: string | null;
    year: number | null;
    mileage: number | null;
    retailPrice: number | null;
    b2bPrice: number | null;
  },
  commercial: Record<string, unknown>,
  gov: GovVehicleIdentity | null
): MaterialConflict[] {
  const conflicts: MaterialConflict[] = [];
  const existingPrice = existing.b2bPrice ?? existing.retailPrice;
  const incomingPrice =
    typeof commercial.askingPrice === "number" ? commercial.askingPrice : null;
  if (
    existingPrice != null &&
    incomingPrice != null &&
    existingPrice !== incomingPrice
  ) {
    conflicts.push("price");
  }
  const incomingKm =
    typeof commercial.mileage === "number" ? commercial.mileage : null;
  if (
    existing.mileage != null &&
    incomingKm != null &&
    existing.mileage !== incomingKm
  ) {
    conflicts.push("mileage");
  }
  if (gov) {
    const makeClash =
      existing.make &&
      gov.make &&
      existing.make.toLowerCase() !== gov.make.toLowerCase();
    const modelClash =
      existing.model &&
      gov.model &&
      existing.model.toLowerCase() !== gov.model.toLowerCase();
    const yearClash =
      existing.year != null && gov.year != null && existing.year !== gov.year;
    if (makeClash || modelClash || yearClash) {
      conflicts.push("identity");
    }
  }
  return conflicts;
}

/** Fill null commercial fields only; never overwrite existing values. */
async function applyAdditiveCommercial(
  vehicleId: string,
  commercial: Record<string, unknown>
) {
  const existing = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!existing) return;
  const data: Prisma.VehicleUpdateInput = {};
  if (
    existing.mileage == null &&
    typeof commercial.mileage === "number"
  ) {
    data.mileage = commercial.mileage;
  }
  if (
    existing.b2bPrice == null &&
    existing.retailPrice == null &&
    typeof commercial.askingPrice === "number" &&
    (existing.dealerRelationship === "OWNED" ||
      existing.dealerRelationship === "INVENTORY")
  ) {
    data.b2bPrice = commercial.askingPrice;
    data.retailPrice = commercial.askingPrice;
  }
  if (
    existing.ownershipHand == null &&
    typeof commercial.ownershipHand === "number"
  ) {
    data.ownershipHand = commercial.ownershipHand;
  }
  if (Object.keys(data).length > 0) {
    await prisma.vehicle.update({ where: { id: vehicleId }, data });
  }
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
    const category: VehicleMediaCategory = row.categoryHint ?? "OTHER";
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

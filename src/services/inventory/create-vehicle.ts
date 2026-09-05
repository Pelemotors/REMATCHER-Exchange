import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import {
  normalizeVehicle,
  normalizedToVehicleFields,
} from "@/services/ai/inventory-normalizer";
import type { NormalizedVehicle } from "@/lib/schemas/ai";

/** Shared Prisma client (default) or interactive-transaction client */
export type InventoryDbClient = typeof prisma;

export type InventoryMutationSource =
  | "agent"
  | "manual"
  | "import"
  | "inventory_api"
  | "domain";

export type VehicleCreateFields = {
  make: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  mileage: number | null;
  color: string | null;
  ownershipHand: number | null;
  ownershipType?: string | null;
  retailPrice: number | null;
  b2bPrice: number | null;
  region: string | null;
  fieldProvenance?: unknown;
};

export function hasVehicleIdentity(fields: {
  make?: string | null;
  model?: string | null;
  year?: number | null;
}): boolean {
  return Boolean(fields.make && fields.model && fields.year);
}

/**
 * Canonical vehicle create for Dealer — used by manual inventory API, Agent, and Import.
 * Do not duplicate prisma.vehicle.create elsewhere for dealer ingestion.
 */
export async function createVehicleForDealer(input: {
  dealerId: string;
  userId?: string;
  rawInput?: string | null;
  fields?: Partial<VehicleCreateFields>;
  /** When provided, normalizes and maps to fields (manual free-text path) */
  normalizeFromRaw?: boolean;
  source?: InventoryMutationSource;
  /**
   * Default true (Agent/Manual). Import may set false to preserve
   * historical rowHasMinimum (make OR model OR year) batch behavior.
   */
  requireIdentity?: boolean;
  /** Import sets availability confirmation on ingest */
  lastAvailabilityConfirmedAt?: Date | null;
  /** Import batches can defer discovery and trigger once after the batch. */
  skipRematch?: boolean;
  db?: InventoryDbClient;
}) {
  const db = input.db ?? prisma;
  const requireIdentity = input.requireIdentity !== false;

  let fields: VehicleCreateFields = {
    make: input.fields?.make ?? null,
    model: input.fields?.model ?? null,
    trim: input.fields?.trim ?? null,
    year: input.fields?.year ?? null,
    mileage: input.fields?.mileage ?? null,
    color: input.fields?.color ?? null,
    ownershipHand: input.fields?.ownershipHand ?? null,
    ownershipType: input.fields?.ownershipType ?? null,
    retailPrice: input.fields?.retailPrice ?? null,
    b2bPrice: input.fields?.b2bPrice ?? null,
    region: input.fields?.region ?? null,
    fieldProvenance: input.fields?.fieldProvenance ?? null,
  };

  if (input.normalizeFromRaw && input.rawInput) {
    const normalized = await normalizeVehicle(input.rawInput, input.userId);
    const mapped = normalizedToVehicleFields(normalized);
    fields = {
      make: mapped.make,
      model: mapped.model,
      trim: mapped.trim,
      year: mapped.year,
      mileage: mapped.mileage,
      color: mapped.color,
      ownershipHand: mapped.ownershipHand,
      ownershipType: mapped.ownershipType,
      retailPrice: mapped.retailPrice,
      b2bPrice: mapped.b2bPrice,
      region: mapped.region,
      fieldProvenance: mapped.fieldProvenance,
    };
  }

  if (requireIdentity && !hasVehicleIdentity(fields)) {
    return {
      ok: false as const,
      error: "identity_incomplete" as const,
      message: "חסר לי עדיין יצרן, דגם או שנה — אפשר להשלים?",
    };
  }

  if (
    !requireIdentity &&
    !fields.make &&
    !fields.model &&
    !fields.year
  ) {
    return {
      ok: false as const,
      error: "identity_incomplete" as const,
      message: "חסרים שדות מינימליים (יצרן/דגם/שנה).",
    };
  }

  const { fieldProvenance, ...scalarFields } = fields;

  const vehicle = await db.vehicle.create({
    data: {
      dealerId: input.dealerId,
      rawInput: input.rawInput ?? null,
      ...scalarFields,
      fieldProvenance: fieldProvenance
        ? toPrismaJson(fieldProvenance)
        : undefined,
      freshnessState: "FRESH",
      lastInventoryUpdate: new Date(),
      ...(input.lastAvailabilityConfirmedAt !== undefined
        ? { lastAvailabilityConfirmedAt: input.lastAvailabilityConfirmedAt }
        : {}),
    },
  });

  // Durable: INVENTORY_ADDED must not be silently lost after create
  const { emitExchangeEvent } = await import("@/services/exchange/events");
  await emitExchangeEvent({
    eventType: "INVENTORY_ADDED",
    dealerId: input.dealerId,
    vehicleId: vehicle.id,
    evidenceType: "SYSTEM_OBSERVED",
    privacyClass: "DEALER_SCOPED",
    eventData: {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      source: input.source ?? "domain",
    },
    idempotencyKey: `inventory-added:${vehicle.id}`,
  });

  const { recordActivationMilestone } = await import(
    "@/services/activation/milestones"
  );
  void recordActivationMilestone({
    dealerId: input.dealerId,
    milestone: "FIRST_INVENTORY_CREATED",
    userId: input.userId,
    entityType: "Vehicle",
    entityId: vehicle.id,
  }).catch(() => undefined);
  if (vehicle.b2bPrice != null) {
    void recordActivationMilestone({
      dealerId: input.dealerId,
      milestone: "FIRST_PRIVATE_PRICE_SET",
      userId: input.userId,
      entityType: "Vehicle",
      entityId: vehicle.id,
    }).catch(() => undefined);
  }

  if (!input.skipRematch) {
    const { rematchAfterInventoryMutation } = await import(
      "@/services/matching/inventory-rematch"
    );
    await rematchAfterInventoryMutation({
      vehicleId: vehicle.id,
      sellerDealerId: input.dealerId,
    });
  }

  return { ok: true as const, vehicle, source: input.source ?? "domain" };
}

export function fieldsFromNormalized(
  normalized: NormalizedVehicle
): VehicleCreateFields {
  const mapped = normalizedToVehicleFields(normalized);
  return {
    make: mapped.make,
    model: mapped.model,
    trim: mapped.trim,
    year: mapped.year,
    mileage: mapped.mileage,
    color: mapped.color,
    ownershipHand: mapped.ownershipHand,
    ownershipType: mapped.ownershipType,
    retailPrice: mapped.retailPrice,
    b2bPrice: mapped.b2bPrice,
    region: mapped.region,
    fieldProvenance: mapped.fieldProvenance,
  };
}

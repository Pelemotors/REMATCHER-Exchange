import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import {
  normalizeVehicle,
  normalizedToVehicleFields,
} from "@/services/ai/inventory-normalizer";
import type { NormalizedVehicle } from "@/lib/schemas/ai";
import { resolveVehicleThroughExchangeBrain } from "@/services/exchange/vehicle-intelligence";
import { canonicalizeOwnershipSource } from "@/services/exchange/vehicle-identity";
import { canonicalizeVehicleFeatures } from "@/services/exchange/vehicle-features";
import { normalizeVehicleFeaturesWithAi } from "@/services/exchange/vehicle-feature-intelligence";

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
  fuelType?: string | null;
  engineDisplacementCc?: number | null;
  features?: string[];
  fieldProvenance?: unknown;
};

export function hasVehicleIdentity(fields: {
  make?: string | null;
  model?: string | null;
  year?: number | null;
}): boolean {
  return Boolean(fields.make && fields.model && fields.year);
}

function provenanceObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Canonical vehicle create for Dealer — used by manual inventory API, Agent, and Import.
 * Every ingress goes through the Exchange vehicle-intelligence boundary before persistence.
 */
export async function createVehicleForDealer(input: {
  dealerId: string;
  userId?: string;
  rawInput?: string | null;
  fields?: Partial<VehicleCreateFields>;
  normalizeFromRaw?: boolean;
  source?: InventoryMutationSource;
  requireIdentity?: boolean;
  lastAvailabilityConfirmedAt?: Date | null;
  skipRematch?: boolean;
  db?: InventoryDbClient;
}) {
  const db = input.db ?? prisma;
  const requireIdentity = input.requireIdentity !== false;
  const rawFeatureInputs = [...(input.fields?.features ?? [])];

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
    fuelType: input.fields?.fuelType ?? null,
    engineDisplacementCc: input.fields?.engineDisplacementCc ?? null,
    features: rawFeatureInputs,
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
      fuelType: mapped.fuelType,
      engineDisplacementCc: mapped.engineDisplacementCc,
      features: [...rawFeatureInputs, ...(mapped.features ?? [])],
      fieldProvenance: mapped.fieldProvenance,
    };
  }

  // Product semantics: there is one asking price. Keep both legacy columns synced
  // until a later safe schema cleanup so old rows/API callers remain compatible.
  const askingPrice = fields.b2bPrice ?? fields.retailPrice;
  fields.b2bPrice = askingPrice;
  fields.retailPrice = askingPrice;

  const identity = await resolveVehicleThroughExchangeBrain({
    make: fields.make,
    model: fields.model,
    fuelType: fields.fuelType,
    engineDisplacementCc: fields.engineDisplacementCc,
    ownershipHand: fields.ownershipHand,
    ownershipType: fields.ownershipType,
    rawText: input.rawInput,
    userId: input.userId,
  });
  fields.make = identity.make;
  fields.model = identity.model;
  fields.fuelType = identity.fuelType;
  fields.engineDisplacementCc = identity.engineDisplacementCc;
  fields.ownershipHand = identity.ownershipHand;
  fields.ownershipType = identity.ownershipType ?? canonicalizeOwnershipSource(fields.ownershipType);

  const featureSourceText = [
    input.rawInput ?? "",
    ...(fields.features ?? []),
  ].filter(Boolean).join("\n");
  let absentFeatures: string[] = [];
  if (featureSourceText) {
    const normalizedFeatures = await normalizeVehicleFeaturesWithAi({
      rawText: featureSourceText,
      userId: input.userId,
    });
    fields.features = canonicalizeVehicleFeatures(normalizedFeatures.features);
    absentFeatures = canonicalizeVehicleFeatures(normalizedFeatures.absentFeatures);
  } else {
    fields.features = [];
  }

  fields.fieldProvenance = {
    ...provenanceObject(fields.fieldProvenance),
    ...(identity.fuelType
      ? { fuel: { value: identity.fuelType, status: "known", source: identity.source } }
      : {}),
    ...(identity.engineDisplacementCc != null
      ? {
          engineDisplacementCc: {
            value: identity.engineDisplacementCc,
            status: "known",
            source: identity.source,
          },
        }
      : {}),
    ...(identity.ownershipHand != null
      ? {
          ownershipHand: {
            value: identity.ownershipHand,
            status: "known",
            source: identity.source,
          },
        }
      : {}),
    ...(fields.ownershipType
      ? {
          ownershipType: {
            value: fields.ownershipType,
            status: "known",
            source: identity.source,
          },
        }
      : {}),
    ...(fields.features?.length ? { features: fields.features } : {}),
    ...(absentFeatures.length ? { absentFeatures } : {}),
    vehicleIdentity: {
      make: identity.make,
      model: identity.model,
      source: identity.source,
      confidence: identity.confidence,
    },
  };

  if (requireIdentity && !hasVehicleIdentity(fields)) {
    return {
      ok: false as const,
      error: "identity_incomplete" as const,
      message: "חסר לי עדיין יצרן, דגם או שנה — אפשר להשלים?",
    };
  }

  if (!requireIdentity && !fields.make && !fields.model && !fields.year) {
    return {
      ok: false as const,
      error: "identity_incomplete" as const,
      message: "חסרים שדות מינימליים (יצרן/דגם/שנה).",
    };
  }

  const {
    fieldProvenance,
    fuelType: _fuelType,
    engineDisplacementCc: _engine,
    features: _features,
    ...scalarFields
  } = fields;

  const vehicle = await db.vehicle.create({
    data: {
      dealerId: input.dealerId,
      rawInput: input.rawInput ?? null,
      ...scalarFields,
      fieldProvenance: fieldProvenance ? toPrismaJson(fieldProvenance) : undefined,
      freshnessState: "FRESH",
      lastInventoryUpdate: new Date(),
      ...(input.lastAvailabilityConfirmedAt !== undefined
        ? { lastAvailabilityConfirmedAt: input.lastAvailabilityConfirmedAt }
        : {}),
    },
  });

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
      fuelType: identity.fuelType,
      engineDisplacementCc: identity.engineDisplacementCc,
      ownershipHand: vehicle.ownershipHand,
      ownershipType: vehicle.ownershipType,
      features: fields.features,
      source: input.source ?? "domain",
    },
    idempotencyKey: `inventory-added:${vehicle.id}`,
  });

  const { recordActivationMilestone } = await import("@/services/activation/milestones");
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
    const { rematchAfterInventoryMutation } = await import("@/services/matching/inventory-rematch");
    await rematchAfterInventoryMutation({ vehicleId: vehicle.id, sellerDealerId: input.dealerId });
  }

  return { ok: true as const, vehicle, source: input.source ?? "domain" };
}

export function fieldsFromNormalized(normalized: NormalizedVehicle): VehicleCreateFields {
  const mapped = normalizedToVehicleFields(normalized);
  const askingPrice = mapped.b2bPrice ?? mapped.retailPrice;
  return {
    make: mapped.make,
    model: mapped.model,
    trim: mapped.trim,
    year: mapped.year,
    mileage: mapped.mileage,
    color: mapped.color,
    ownershipHand: mapped.ownershipHand,
    ownershipType: mapped.ownershipType,
    retailPrice: askingPrice,
    b2bPrice: askingPrice,
    region: mapped.region,
    fuelType: mapped.fuelType,
    engineDisplacementCc: mapped.engineDisplacementCc,
    features: mapped.features,
    fieldProvenance: mapped.fieldProvenance,
  };
}

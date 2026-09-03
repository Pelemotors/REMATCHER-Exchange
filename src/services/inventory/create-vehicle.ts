import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import {
  normalizeVehicle,
  normalizedToVehicleFields,
} from "@/services/ai/inventory-normalizer";
import type { NormalizedVehicle } from "@/lib/schemas/ai";

export type VehicleCreateFields = {
  make: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  mileage: number | null;
  color: string | null;
  ownershipHand: number | null;
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
 * Canonical vehicle create for Dealer — used by manual inventory API and Agent.
 * Do not duplicate prisma.vehicle.create elsewhere for dealer ingestion.
 */
export async function createVehicleForDealer(input: {
  dealerId: string;
  userId?: string;
  rawInput?: string | null;
  fields?: Partial<VehicleCreateFields>;
  /** When provided, normalizes and maps to fields (manual free-text path) */
  normalizeFromRaw?: boolean;
}) {
  let fields: VehicleCreateFields = {
    make: input.fields?.make ?? null,
    model: input.fields?.model ?? null,
    trim: input.fields?.trim ?? null,
    year: input.fields?.year ?? null,
    mileage: input.fields?.mileage ?? null,
    color: input.fields?.color ?? null,
    ownershipHand: input.fields?.ownershipHand ?? null,
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
      retailPrice: mapped.retailPrice,
      b2bPrice: mapped.b2bPrice,
      region: mapped.region,
      fieldProvenance: mapped.fieldProvenance,
    };
  }

  if (!hasVehicleIdentity(fields)) {
    return {
      ok: false as const,
      error: "identity_incomplete" as const,
      message: "חסרים יצרן, דגם או שנה — אי אפשר לשמור רכב בלי זיהוי בסיסי.",
    };
  }

  const { fieldProvenance, ...scalarFields } = fields;

  const vehicle = await prisma.vehicle.create({
    data: {
      dealerId: input.dealerId,
      rawInput: input.rawInput ?? null,
      ...scalarFields,
      fieldProvenance: fieldProvenance
        ? toPrismaJson(fieldProvenance)
        : undefined,
      freshnessState: "FRESH",
      lastInventoryUpdate: new Date(),
    },
  });

  return { ok: true as const, vehicle };
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
    retailPrice: mapped.retailPrice,
    b2bPrice: mapped.b2bPrice,
    region: mapped.region,
    fieldProvenance: mapped.fieldProvenance,
  };
}

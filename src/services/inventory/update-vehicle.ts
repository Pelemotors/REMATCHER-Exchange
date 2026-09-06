import "server-only";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/services/notifications";
import { emitExchangeEvent } from "@/services/exchange/events";
import { resolveVehicleThroughExchangeBrain } from "@/services/exchange/vehicle-intelligence";
import { canonicalizeOwnershipSource } from "@/services/exchange/vehicle-identity";
import { canonicalizeVehicleFeatures } from "@/services/exchange/vehicle-features";
import { normalizeVehicleFeaturesWithAi } from "@/services/exchange/vehicle-feature-intelligence";
import type {
  InventoryDbClient,
  InventoryMutationSource,
} from "@/services/inventory/create-vehicle";

export type VehicleUpdateFields = {
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  year?: number | null;
  mileage?: number | null;
  color?: string | null;
  ownershipHand?: number | null;
  ownershipType?: string | null;
  retailPrice?: number | null;
  b2bPrice?: number | null;
  region?: string | null;
  fuelType?: string | null;
  engineDisplacementCc?: number | null;
  features?: string[];
  fieldProvenance?: Record<string, unknown>;
  status?: "ARCHIVED";
  rawInput?: string | null;
  lastAvailabilityConfirmedAt?: Date | null;
};

const MATCH_RELEVANT_FIELDS = new Set([
  "make", "model", "year", "mileage", "b2bPrice", "retailPrice", "color", "trim",
  "ownershipHand", "ownershipType", "region", "fuelType", "engineDisplacementCc", "features", "fieldProvenance", "lastAvailabilityConfirmedAt",
]);

function provenanceObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function provenanceValue(value: unknown, key: string): string | number | null {
  const obj = provenanceObject(value);
  const candidate = obj[key];
  if (typeof candidate === "string" || typeof candidate === "number") return candidate;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && "value" in candidate) {
    const inner = (candidate as { value?: unknown }).value;
    if (typeof inner === "string" || typeof inner === "number") return inner;
  }
  return null;
}

function provenanceArray(value: unknown, key: string): string[] {
  const obj = provenanceObject(value);
  const candidate = obj[key];
  return Array.isArray(candidate)
    ? candidate.filter((v): v is string => typeof v === "string")
    : [];
}

export async function updateVehicleForDealer(input: {
  dealerId: string;
  vehicleId: string;
  fields: VehicleUpdateFields;
  source?: InventoryMutationSource | string;
  skipEventLog?: boolean;
  skipRematch?: boolean;
  db?: InventoryDbClient;
}) {
  const db = input.db ?? prisma;
  const vehicle = await db.vehicle.findFirst({ where: { id: input.vehicleId, dealerId: input.dealerId } });
  if (!vehicle) return { ok: false as const, error: "not_found" as const };

  if (vehicle.status === "SOLD" || vehicle.status === "ARCHIVED") {
    const onlyMeta = Object.keys(input.fields).length > 0 && Object.keys(input.fields).every((k) => ["rawInput"].includes(k));
    if (!onlyMeta && input.fields.status !== "ARCHIVED") {
      return { ok: false as const, error: "terminal_status" as const, message: "רכב שנמכר דורש הפעלה מחדש מפורשת לפני עדכון." };
    }
  }

  const f = { ...input.fields };
  const identityRelevant =
    "make" in f || "model" in f || "fuelType" in f || "engineDisplacementCc" in f ||
    "ownershipHand" in f || "ownershipType" in f || "rawInput" in f;

  let mergedProvenance = provenanceObject(vehicle.fieldProvenance);
  if (f.fieldProvenance) mergedProvenance = { ...mergedProvenance, ...f.fieldProvenance };

  if ("features" in f || (typeof f.rawInput === "string" && f.rawInput.trim())) {
    const existingFeatures = provenanceArray(mergedProvenance, "features");
    const existingAbsent = provenanceArray(mergedProvenance, "absentFeatures");
    const featureSourceText = [
      ...(f.features ?? []),
      typeof f.rawInput === "string" ? f.rawInput : "",
    ].filter(Boolean).join("\n");
    const normalized = featureSourceText
      ? await normalizeVehicleFeaturesWithAi({ rawText: featureSourceText })
      : { features: [] as string[], absentFeatures: [] as string[] };
    const explicitlyPresent = new Set(canonicalizeVehicleFeatures(normalized.features));
    const explicitlyAbsent = new Set(canonicalizeVehicleFeatures(normalized.absentFeatures));
    const mergedFeatures = canonicalizeVehicleFeatures([
      ...existingFeatures.filter((feature) => !explicitlyAbsent.has(feature as never)),
      ...explicitlyPresent,
    ]);
    const mergedAbsent = canonicalizeVehicleFeatures([
      ...existingAbsent.filter((feature) => !explicitlyPresent.has(feature as never)),
      ...explicitlyAbsent,
    ]);
    if ("features" in f || normalized.features.length > 0 || normalized.absentFeatures.length > 0) {
      f.features = mergedFeatures;
      mergedProvenance = {
        ...mergedProvenance,
        features: mergedFeatures,
        absentFeatures: mergedAbsent,
      };
    }
  }

  if (identityRelevant) {
    const resolved = await resolveVehicleThroughExchangeBrain({
      make: "make" in f ? f.make : vehicle.make,
      model: "model" in f ? f.model : vehicle.model,
      fuelType:
        "fuelType" in f
          ? f.fuelType
          : (provenanceValue(mergedProvenance, "fuel") as string | null) ??
            (provenanceValue(mergedProvenance, "fuelType") as string | null),
      engineDisplacementCc:
        "engineDisplacementCc" in f
          ? f.engineDisplacementCc
          : (provenanceValue(mergedProvenance, "engineDisplacementCc") as number | null),
      ownershipHand: "ownershipHand" in f ? f.ownershipHand : vehicle.ownershipHand,
      ownershipType:
        "ownershipType" in f
          ? f.ownershipType
          : vehicle.ownershipType ?? (provenanceValue(mergedProvenance, "ownershipType") as string | null),
      rawText: "rawInput" in f ? f.rawInput : vehicle.rawInput,
    });
    if (resolved.make) f.make = resolved.make;
    if (resolved.model) f.model = resolved.model;
    if (resolved.fuelType) f.fuelType = resolved.fuelType;
    if (resolved.engineDisplacementCc != null) f.engineDisplacementCc = resolved.engineDisplacementCc;
    if (resolved.ownershipHand != null) f.ownershipHand = resolved.ownershipHand;
    if (resolved.ownershipType) f.ownershipType = resolved.ownershipType;
    mergedProvenance = {
      ...mergedProvenance,
      ...(resolved.fuelType ? { fuel: { value: resolved.fuelType, status: "known", source: resolved.source } } : {}),
      ...(resolved.engineDisplacementCc != null
        ? { engineDisplacementCc: { value: resolved.engineDisplacementCc, status: "known", source: resolved.source } }
        : {}),
      ...(resolved.ownershipHand != null
        ? { ownershipHand: { value: resolved.ownershipHand, status: "known", source: resolved.source } }
        : {}),
      ...(resolved.ownershipType
        ? { ownershipType: { value: resolved.ownershipType, status: "known", source: resolved.source } }
        : {}),
      vehicleIdentity: {
        make: resolved.make,
        model: resolved.model,
        source: resolved.source,
        confidence: resolved.confidence,
      },
    };
  }

  if ("ownershipType" in f) {
    f.ownershipType = canonicalizeOwnershipSource(f.ownershipType);
    if (f.ownershipType) {
      mergedProvenance = {
        ...mergedProvenance,
        ownershipType: { value: f.ownershipType, status: "known", source: "exchange_ai" },
      };
    }
  }

  const data: Record<string, unknown> = { lastInventoryUpdate: new Date() };
  if ("make" in f) data.make = f.make;
  if ("model" in f) data.model = f.model;
  if ("trim" in f) data.trim = f.trim;
  if ("year" in f) data.year = f.year;
  if ("mileage" in f) data.mileage = f.mileage;
  if ("color" in f) data.color = f.color;
  if ("ownershipHand" in f) data.ownershipHand = f.ownershipHand;
  if ("ownershipType" in f) data.ownershipType = f.ownershipType;
  if ("retailPrice" in f) data.retailPrice = f.retailPrice;
  if ("b2bPrice" in f) data.b2bPrice = f.b2bPrice;
  if ("region" in f) data.region = f.region;
  if ("rawInput" in f) data.rawInput = f.rawInput;

  if (f.fieldProvenance || identityRelevant || "ownershipType" in f || "features" in f) {
    const { toPrismaJson } = await import("@/lib/prisma-json");
    data.fieldProvenance = toPrismaJson(mergedProvenance);
  }

  if ("lastAvailabilityConfirmedAt" in f && f.lastAvailabilityConfirmedAt) {
    data.lastAvailabilityConfirmedAt = f.lastAvailabilityConfirmedAt;
    data.freshnessState = "FRESH";
  }
  if (f.status === "ARCHIVED") {
    data.status = "ARCHIVED";
    data.archivedAt = new Date();
  }

  const b2bNewlySet = "b2bPrice" in f && f.b2bPrice != null && vehicle.b2bPrice == null;
  const updated = await db.vehicle.update({ where: { id: vehicle.id }, data });

  if (b2bNewlySet) {
    const { recordActivationMilestone } = await import("@/services/activation/milestones");
    void recordActivationMilestone({dealerId: input.dealerId,milestone:"FIRST_PRIVATE_PRICE_SET",entityType:"Vehicle",entityId:updated.id}).catch(()=>undefined);
  }

  const matchingRelevant = Object.keys(f).some((k) => MATCH_RELEVANT_FIELDS.has(k));
  if (!input.skipEventLog) {
    await logAppEvent({eventType:"vehicle_updated",entityType:"Vehicle",entityId:updated.id,dealerId:input.dealerId,metadata:{source:input.source??"domain",fields:Object.keys(f)}});
    if (f.status === "ARCHIVED" && vehicle.status !== "ARCHIVED") {
      await emitExchangeEvent({eventType:"INVENTORY_REMOVED",dealerId:input.dealerId,vehicleId:updated.id,evidenceType:"SYSTEM_OBSERVED",privacyClass:"DEALER_SCOPED",eventData:{source:input.source??"domain",note:"archived_not_sold"},idempotencyKey:`inventory-removed:${updated.id}:${updated.archivedAt?.toISOString()??"x"}`});
      const { cancelOpenRequestsForVehicle } = await import("@/services/matching/information-request");
      await cancelOpenRequestsForVehicle(updated.id);
    } else if (matchingRelevant) {
      await emitExchangeEvent({eventType:"INVENTORY_UPDATED",dealerId:input.dealerId,vehicleId:updated.id,evidenceType:"SYSTEM_OBSERVED",privacyClass:"DEALER_SCOPED",eventData:{fields:Object.keys(f)},idempotencyKey:`inventory-updated:${updated.id}:${updated.updatedAt.toISOString()}`});
      const updatedFields = Object.keys(f).flatMap((k) => {
        if (k === "b2bPrice" || k === "retailPrice") return ["price"];
        if (k === "ownershipHand") return ["hand"];
        if (k === "ownershipType") return ["ownershipSource"];
        if (k === "fuelType") return ["fuel"];
        if (k === "engineDisplacementCc") return ["engineDisplacementCc"];
        if (k === "features") return [
          ...(provenanceArray(mergedProvenance, "features").map((feature) => `feature:${feature}`)),
          ...(provenanceArray(mergedProvenance, "absentFeatures").map((feature) => `feature:${feature}`)),
        ];
        if (k === "fieldProvenance" && f.fieldProvenance) return Object.keys(f.fieldProvenance);
        return [k];
      });
      const { fulfillRequestsAfterVehicleUpdate } = await import("@/services/matching/information-request");
      await fulfillRequestsAfterVehicleUpdate({vehicleId:updated.id,sellerDealerId:input.dealerId,updatedFields,skipRematch:input.skipRematch});
    }
  } else if (matchingRelevant && updated.status === "ACTIVE" && !input.skipRematch) {
    const { rematchAfterInventoryMutation } = await import("@/services/matching/inventory-rematch");
    await rematchAfterInventoryMutation({vehicleId:updated.id,sellerDealerId:input.dealerId});
  }
  return { ok: true as const, vehicle: updated };
}

export async function reactivateVehicleForDealer(input: {
  dealerId: string;
  vehicleId: string;
  source?: InventoryMutationSource | string;
  skipRematch?: boolean;
}) {
  const vehicle = await prisma.vehicle.findFirst({where:{id:input.vehicleId,dealerId:input.dealerId}});
  if (!vehicle) return { ok:false as const,error:"not_found" as const };
  if (vehicle.status === "ACTIVE") return {ok:true as const,vehicle,alreadyActive:true as const};
  if (vehicle.status !== "SOLD" && vehicle.status !== "ARCHIVED") return {ok:false as const,error:"invalid_status" as const};
  const updated=await prisma.$transaction(async(tx)=>{const row=await tx.vehicle.update({where:{id:vehicle.id},data:{status:"ACTIVE",archivedAt:null,lastInventoryUpdate:new Date(),freshnessState:"UNKNOWN"}});await emitExchangeEvent({eventType:"INVENTORY_REACTIVATED",dealerId:input.dealerId,vehicleId:row.id,evidenceType:"SYSTEM_OBSERVED",privacyClass:"DEALER_SCOPED",eventData:{source:input.source??"domain",from:vehicle.status},idempotencyKey:`inventory-reactivated:${row.id}:${vehicle.status}`},tx);return row;});
  await logAppEvent({eventType:"vehicle_reactivated",entityType:"Vehicle",entityId:updated.id,dealerId:input.dealerId,metadata:{source:input.source??"domain",from:vehicle.status}});
  if(!input.skipRematch){const{rematchAfterInventoryMutation}=await import("@/services/matching/inventory-rematch");await rematchAfterInventoryMutation({vehicleId:updated.id,sellerDealerId:input.dealerId});}
  return {ok:true as const,vehicle:updated,alreadyActive:false as const};
}

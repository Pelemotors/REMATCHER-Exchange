/**
 * Mass 2.5 — Information Request / Seller Enrichment.
 * Exchange-initiated when Candidate is Potential (NEEDS_INFORMATION).
 * Not BuyerInterest / MutualInterest / Reveal.
 */
import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { emitExchangeEvent } from "@/services/exchange/events";
import { notifyDealerUsers } from "@/services/notifications";
import { COPY } from "@/config/brand";

const ENRICHMENT_NOTIFY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function hashRequestedFields(fields: string[]): string {
  const normalized = [...new Set(fields.map((f) => f.trim().toLowerCase()))]
    .filter(Boolean)
    .sort();
  return createHash("sha256").update(normalized.join("|")).digest("hex").slice(0, 32);
}

export function fieldLabelHe(field: string): string {
  const map: Record<string, string> = {
    price: "מחיר",
    fuel: "סוג דלק/הנעה",
    fuelType: "סוג דלק/הנעה",
    engineDisplacementCc: "נפח מנוע",
    mileage: "קילומטראז׳",
    year: "שנתון",
    color: "צבע",
    trim: "גימור",
    transmission: "גיר",
    drivetrain: "הנעה",
    hand: "יד",
    ownershipHand: "יד",
    ownershipSource: "מקוריות",
    ownershipType: "מקוריות",
    region: "אזור",
    seats: "מושבים",
    vehicleIdentity: "זהות רכב",
  };
  return map[field] ?? field;
}

export async function ensureExchangeInitiatedEnrichment(params: {
  candidateMatchId: string;
  fieldsOverride?: string[];
}) {
  const match = await prisma.candidateMatch.findUnique({
    where: { id: params.candidateMatchId },
    include: { vehicle: true, demand: true },
  });
  if (!match) return { ok: false as const, error: "not_found" as const };
  if (match.vehicle.status !== "ACTIVE") return { ok: false as const, error: "vehicle_unavailable" as const };
  if (match.demand.status !== "ACTIVE") return { ok: false as const, error: "demand_inactive" as const };

  const fields = params.fieldsOverride ??
    (Array.isArray(match.decisionBlockingUnknowns) ? (match.decisionBlockingUnknowns as string[]) : []);
  if (fields.length === 0) return { ok: false as const, error: "no_blocking_fields" as const };

  const result = await upsertOpenEnrichmentRequest({ requesterDealerId: match.demand.dealerId, match, fields });
  await notifySellerEnrichmentAggregated({
    vehicleId: match.vehicleId,
    sellerDealerId: match.vehicle.dealerId,
    vehicleTitle: `${match.vehicle.make ?? ""} ${match.vehicle.model ?? ""} ${match.vehicle.year ?? ""}`.trim(),
  });
  return result;
}

export async function requestCandidateInformation(_params: {
  requesterDealerId: string;
  candidateMatchId: string;
}) {
  return { ok: false as const, error: "buyer_initiated_enrichment_disabled" as const };
}

async function upsertOpenEnrichmentRequest(params: {
  requesterDealerId: string;
  match: {
    id: string;
    vehicleId: string;
    demandId: string;
    searchIntentVersionId: string | null;
    vehicle: { dealerId: string };
  };
  fields: string[];
}) {
  const { requesterDealerId, match, fields } = params;
  const fieldsHash = hashRequestedFields(fields);
  const existing = await prisma.informationRequest.findUnique({
    where: {
      requesterDealerId_candidateMatchId_fieldsHash: {
        requesterDealerId,
        candidateMatchId: match.id,
        fieldsHash,
      },
    },
  });
  if (existing && existing.status === "OPEN") return { ok: true as const, request: existing, created: false as const };

  const request = existing
    ? await prisma.informationRequest.update({
        where: { id: existing.id },
        data: { status: "OPEN", requestedFields: toPrismaJson(fields), cancelledAt: null, fulfilledAt: null },
      })
    : await prisma.informationRequest.create({
        data: {
          requesterDealerId,
          vehicleId: match.vehicleId,
          demandId: match.demandId,
          searchIntentVersionId: match.searchIntentVersionId,
          candidateMatchId: match.id,
          requestedFields: toPrismaJson(fields),
          fieldsHash,
          status: "OPEN",
        },
      });

  await emitExchangeEvent({
    eventType: "MORE_INFO_REQUESTED",
    dealerId: requesterDealerId,
    vehicleId: match.vehicleId,
    demandId: match.demandId,
    candidateMatchId: match.id,
    evidenceType: "SYSTEM_OBSERVED",
    privacyClass: "DEALER_SCOPED",
    eventData: { requestedFields: fields, informationRequestId: request.id, initiatedBy: "exchange" },
    idempotencyKey: `more-info:${request.id}:open`,
  });

  await emitExchangeEvent({
    eventType: "INVENTORY_ENRICHMENT_REQUESTED",
    dealerId: match.vehicle.dealerId,
    vehicleId: match.vehicleId,
    candidateMatchId: match.id,
    evidenceType: "SYSTEM_OBSERVED",
    privacyClass: "DEALER_SCOPED",
    eventData: { requestedFields: fields, openRequestCount: await countOpenRequests(match.vehicleId), initiatedBy: "exchange" },
    idempotencyKey: `enrich-req:${match.vehicleId}:${fieldsHash}:${request.id}`,
  });

  return { ok: true as const, request, created: true as const };
}

async function countOpenRequests(vehicleId: string) {
  return prisma.informationRequest.count({ where: { vehicleId, status: "OPEN" } });
}

async function notifySellerEnrichmentAggregated(params: {
  vehicleId: string;
  sellerDealerId: string;
  vehicleTitle: string;
}) {
  const open = await prisma.informationRequest.findMany({
    where: { vehicleId: params.vehicleId, status: "OPEN" },
    select: { requestedFields: true, updatedAt: true, createdAt: true },
  });
  if (open.length === 0) return;

  const fieldSet = new Set<string>();
  for (const r of open) {
    const arr = Array.isArray(r.requestedFields) ? (r.requestedFields as string[]) : [];
    for (const f of arr) fieldSet.add(f);
  }
  const fields = [...fieldSet];
  const count = open.length;

  const since = new Date(Date.now() - ENRICHMENT_NOTIFY_COOLDOWN_MS);
  const recent = await prisma.notification.findFirst({
    where: {
      type: "INVENTORY_ENRICHMENT",
      entityType: "vehicle",
      entityId: params.vehicleId,
      createdAt: { gte: since },
    },
  });
  if (recent) return;

  await notifyDealerUsers(params.sellerDealerId, {
    type: "INVENTORY_ENRICHMENT",
    title: COPY.partialDemandTitle,
    body: COPY.partialDemandBody,
    link: `/inventory?focus=${params.vehicleId}&enrich=1`,
    entityType: "vehicle",
    entityId: params.vehicleId,
  });

  await emitExchangeEvent({
    eventType: "INVENTORY_ENRICHMENT_REQUESTED",
    dealerId: params.sellerDealerId,
    vehicleId: params.vehicleId,
    evidenceType: "SYSTEM_OBSERVED",
    privacyClass: "DEALER_SCOPED",
    eventData: { aggregated: true, openRequestCount: count, requestedFields: fields, note: "seller_push" },
    idempotencyKey: `enrich-push:${params.vehicleId}:${Math.floor(Date.now() / ENRICHMENT_NOTIFY_COOLDOWN_MS)}`,
  });
}

export async function getOpenEnrichmentForVehicle(params: { dealerId: string; vehicleId: string }) {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: params.vehicleId, dealerId: params.dealerId } });
  if (!vehicle) return null;
  const open = await prisma.informationRequest.findMany({
    where: { vehicleId: params.vehicleId, status: "OPEN" },
    select: { id: true, requestedFields: true, createdAt: true },
  });
  const fields = new Set<string>();
  for (const r of open) {
    for (const f of Array.isArray(r.requestedFields) ? (r.requestedFields as string[]) : []) fields.add(f);
  }
  return {
    vehicleId: vehicle.id,
    openRequestCount: open.length,
    requestedFields: [...fields],
    labels: [...fields].map(fieldLabelHe),
    requesterIdentity: null,
  };
}

export async function cancelOpenRequestsForDemand(demandId: string) {
  await prisma.informationRequest.updateMany({ where: { demandId, status: "OPEN" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
}

export async function cancelOpenRequestsForVehicle(vehicleId: string) {
  await prisma.informationRequest.updateMany({ where: { vehicleId, status: "OPEN" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
}

export async function cancelOpenRequestsForVehicleDemand(params: { vehicleId: string; demandId: string }) {
  await prisma.informationRequest.updateMany({
    where: { vehicleId: params.vehicleId, demandId: params.demandId, status: "OPEN" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

export async function reevaluateDemandsForVehicle(vehicleId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { dealerId: true } });
  if (!vehicle) return [] as string[];
  const { rematchAfterInventoryMutation } = await import("@/services/matching/inventory-rematch");
  return rematchAfterInventoryMutation({ vehicleId, sellerDealerId: vehicle.dealerId });
}

export async function fulfillRequestsAfterVehicleUpdate(params: {
  vehicleId: string;
  sellerDealerId: string;
  updatedFields: string[];
  skipRematch?: boolean;
}) {
  const open = await prisma.informationRequest.findMany({
    where: { vehicleId: params.vehicleId, status: "OPEN", vehicle: { dealerId: params.sellerDealerId } },
    include: { demand: true, candidateMatch: true, vehicle: true },
  });

  let fulfilled = 0;
  if (open.length > 0) {
    await emitExchangeEvent({
      eventType: "INVENTORY_ENRICHED",
      dealerId: params.sellerDealerId,
      vehicleId: params.vehicleId,
      evidenceType: "SYSTEM_OBSERVED",
      privacyClass: "DEALER_SCOPED",
      eventData: { updatedFields: params.updatedFields },
      idempotencyKey: `inventory-enriched:${params.vehicleId}:${[...params.updatedFields].sort().join(",")}:${new Date().toISOString().slice(0, 13)}`,
    });

    for (const req of open) {
      if (req.demand.status !== "ACTIVE") {
        await prisma.informationRequest.update({ where: { id: req.id }, data: { status: "EXPIRED", cancelledAt: new Date() } });
        continue;
      }
      if (req.vehicle.status !== "ACTIVE") {
        await prisma.informationRequest.update({ where: { id: req.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
        continue;
      }

      const requested = Array.isArray(req.requestedFields) ? (req.requestedFields as string[]) : [];
      const remaining = remainingBlockingFields(req.vehicle, requested);
      if (remaining.length === 0) {
        await prisma.informationRequest.update({ where: { id: req.id }, data: { status: "FULFILLED", fulfilledAt: new Date() } });
        fulfilled += 1;
      } else {
        await prisma.informationRequest.update({ where: { id: req.id }, data: { requestedFields: toPrismaJson(remaining) } });
      }
    }
  }

  let reevaluated: string[] = [];
  if (!params.skipRematch) {
    const { rematchAfterInventoryMutation } = await import("@/services/matching/inventory-rematch");
    reevaluated = await rematchAfterInventoryMutation({ vehicleId: params.vehicleId, sellerDealerId: params.sellerDealerId });
  }
  const reevaluatedSet = new Set(reevaluated);

  for (const req of open) {
    if (!reevaluatedSet.has(req.demandId)) continue;
    const updatedMatch = await prisma.candidateMatch.findUnique({ where: { id: req.candidateMatchId } });
    if (
      updatedMatch &&
      updatedMatch.status === "VALIDATED" &&
      updatedMatch.resolutionState === "RESOLVED" &&
      updatedMatch.scoreBand &&
      ["STRONG", "GOOD", "ALTERNATIVE"].includes(updatedMatch.scoreBand)
    ) {
      await notifyDealerUsers(req.requesterDealerId, {
        type: "BUYER_MATCH",
        title: "נמצאה התאמה רלוונטית לחיפוש שלך",
        body: "רוצה להתקדם עם הרכב הזה?",
        link: `/matches?focus=${updatedMatch.id}`,
        entityType: "match",
        entityId: updatedMatch.id,
      });
    }
  }
  return { fulfilled, reevaluated };
}

function provenancePresent(provenance: unknown, keys: string[]): boolean {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return false;
  const record = provenance as Record<string, unknown>;
  for (const key of keys) {
    const v = record[key];
    if ((typeof v === "string" && v.trim()) || typeof v === "number") return true;
    if (v && typeof v === "object" && !Array.isArray(v) && "value" in v) {
      const inner = (v as { value?: unknown }).value;
      if ((typeof inner === "string" && inner.trim()) || typeof inner === "number") return true;
    }
  }
  return false;
}

function remainingBlockingFields(
  vehicle: {
    b2bPrice: number | null;
    retailPrice: number | null;
    mileage: number | null;
    year: number | null;
    color: string | null;
    ownershipHand: number | null;
    ownershipType: string | null;
    fieldProvenance: unknown;
  },
  requested: string[]
): string[] {
  const remaining: string[] = [];
  for (const f of requested) {
    if (f === "price") {
      if (vehicle.b2bPrice == null) remaining.push(f);
      continue;
    }
    if (f === "mileage") { if (vehicle.mileage == null) remaining.push(f); continue; }
    if (f === "year") { if (vehicle.year == null) remaining.push(f); continue; }
    if (f === "color") { if (!vehicle.color) remaining.push(f); continue; }
    if (f === "hand" || f === "ownershipHand") { if (vehicle.ownershipHand == null) remaining.push(f); continue; }
    if (f === "ownershipSource" || f === "ownershipType") {
      if (!vehicle.ownershipType && !provenancePresent(vehicle.fieldProvenance, ["ownershipType", "ownershipSource"])) remaining.push(f);
      continue;
    }
    if (f === "engineDisplacementCc") {
      if (!provenancePresent(vehicle.fieldProvenance, ["engineDisplacementCc", "engine", "engineCapacity"])) remaining.push(f);
      continue;
    }
    if (f === "fuel" || f === "fuelType") {
      if (!provenancePresent(vehicle.fieldProvenance, ["fuel", "fuelType"])) remaining.push(f);
      continue;
    }
    if (f === "transmission" || f === "drivetrain") {
      if (!provenancePresent(vehicle.fieldProvenance, [f])) remaining.push(f);
    }
  }
  return remaining;
}

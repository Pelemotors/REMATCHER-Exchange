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

/**
 * Exchange-initiated enrichment for Potential / missing decision-blocking fields.
 * Reuses InformationRequest; requesterDealerId = Demand owner for audit only.
 * Does NOT create Interest / Opportunity / Reveal.
 */
export async function ensureExchangeInitiatedEnrichment(params: {
  candidateMatchId: string;
  /** Override when engine fields unavailable (e.g. legacy price gate) */
  fieldsOverride?: string[];
}) {
  const match = await prisma.candidateMatch.findUnique({
    where: { id: params.candidateMatchId },
    include: { vehicle: true, demand: true },
  });
  if (!match) return { ok: false as const, error: "not_found" as const };
  if (match.vehicle.status !== "ACTIVE") {
    return { ok: false as const, error: "vehicle_unavailable" as const };
  }
  if (match.demand.status !== "ACTIVE") {
    return { ok: false as const, error: "demand_inactive" as const };
  }

  const fields =
    params.fieldsOverride ??
    (Array.isArray(match.decisionBlockingUnknowns)
      ? (match.decisionBlockingUnknowns as string[])
      : []);
  if (fields.length === 0) {
    return { ok: false as const, error: "no_blocking_fields" as const };
  }

  const result = await upsertOpenEnrichmentRequest({
    requesterDealerId: match.demand.dealerId,
    match,
    fields,
  });

  await notifySellerEnrichmentAggregated({
    vehicleId: match.vehicleId,
    sellerDealerId: match.vehicle.dealerId,
    vehicleTitle:
      `${match.vehicle.make ?? ""} ${match.vehicle.model ?? ""} ${match.vehicle.year ?? ""}`.trim(),
  });

  return result;
}

/** Buyer-initiated enrichment disabled — Exchange initiates automatically. */
export async function requestCandidateInformation(_params: {
  requesterDealerId: string;
  candidateMatchId: string;
}) {
  return {
    ok: false as const,
    error: "buyer_initiated_enrichment_disabled" as const,
  };
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
  if (existing && existing.status === "OPEN") {
    return {
      ok: true as const,
      request: existing,
      created: false as const,
    };
  }

  const request = existing
    ? await prisma.informationRequest.update({
        where: { id: existing.id },
        data: {
          status: "OPEN",
          requestedFields: toPrismaJson(fields),
          cancelledAt: null,
          fulfilledAt: null,
        },
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
    eventData: {
      requestedFields: fields,
      informationRequestId: request.id,
      initiatedBy: "exchange",
    },
    idempotencyKey: `more-info:${request.id}:open`,
  });

  await emitExchangeEvent({
    eventType: "INVENTORY_ENRICHMENT_REQUESTED",
    dealerId: match.vehicle.dealerId,
    vehicleId: match.vehicleId,
    candidateMatchId: match.id,
    evidenceType: "SYSTEM_OBSERVED",
    privacyClass: "DEALER_SCOPED",
    eventData: {
      requestedFields: fields,
      openRequestCount: await countOpenRequests(match.vehicleId),
      initiatedBy: "exchange",
    },
    idempotencyKey: `enrich-req:${match.vehicleId}:${fieldsHash}:${request.id}`,
  });

  return {
    ok: true as const,
    request,
    created: true as const,
  };
}

async function countOpenRequests(vehicleId: string) {
  return prisma.informationRequest.count({
    where: { vehicleId, status: "OPEN" },
  });
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
    const arr = Array.isArray(r.requestedFields)
      ? (r.requestedFields as string[])
      : [];
    for (const f of arr) fieldSet.add(f);
  }
  const fields = [...fieldSet];
  const count = open.length;

  const since = new Date(Date.now() - ENRICHMENT_NOTIFY_COOLDOWN_MS);
  const recent = await prisma.notification.findFirst({
    where: {
      type: "INVENTORY_ENRICHMENT",
      createdAt: { gte: since },
      dataJson: { path: ["vehicleId"], equals: params.vehicleId },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) return;

  const labels = fields.map(fieldLabelHe).join(", ");
  await notifyDealerUsers({
    dealerId: params.sellerDealerId,
    type: "INVENTORY_ENRICHMENT",
    title: COPY.inventoryEnrichmentTitle,
    body: `${params.vehicleTitle}: חסר מידע חשוב להתאמות — ${labels}.`,
    url: `/inventory?vehicle=${params.vehicleId}`,
    data: {
      vehicleId: params.vehicleId,
      requestedFields: fields,
      openRequestCount: count,
      initiatedBy: "exchange",
    },
  });
}

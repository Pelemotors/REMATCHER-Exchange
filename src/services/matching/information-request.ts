/**
 * Mass 2.5 — Information Request (interest-driven enrichment).
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
    price: "מחיר סוחר",
    fuel: "סוג דלק",
    mileage: "קילומטראז׳",
    year: "שנתון",
    color: "צבע",
    trim: "גימור",
    transmission: "גיר",
    drivetrain: "הנעה",
    hand: "יד",
    region: "אזור",
    vehicleIdentity: "זהות רכב",
  };
  return map[field] ?? field;
}

export async function requestCandidateInformation(params: {
  requesterDealerId: string;
  candidateMatchId: string;
}) {
  const match = await prisma.candidateMatch.findFirst({
    where: {
      id: params.candidateMatchId,
      demand: { dealerId: params.requesterDealerId },
      resolutionState: "NEEDS_INFORMATION",
    },
    include: {
      vehicle: true,
      demand: true,
    },
  });
  if (!match) {
    return { ok: false as const, error: "not_found_or_not_potential" as const };
  }
  if (match.vehicle.status !== "ACTIVE") {
    return { ok: false as const, error: "vehicle_unavailable" as const };
  }
  if (match.demand.status !== "ACTIVE") {
    return { ok: false as const, error: "demand_inactive" as const };
  }

  const fields = Array.isArray(match.decisionBlockingUnknowns)
    ? (match.decisionBlockingUnknowns as string[])
    : [];
  if (fields.length === 0) {
    return { ok: false as const, error: "no_blocking_fields" as const };
  }

  const fieldsHash = hashRequestedFields(fields);
  const existing = await prisma.informationRequest.findUnique({
    where: {
      requesterDealerId_candidateMatchId_fieldsHash: {
        requesterDealerId: params.requesterDealerId,
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
      message: "הבקשה כבר פתוחה — בעל הרכב כבר קיבל עדכון.",
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
          requesterDealerId: params.requesterDealerId,
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
    dealerId: params.requesterDealerId,
    vehicleId: match.vehicleId,
    demandId: match.demandId,
    candidateMatchId: match.id,
    evidenceType: "SYSTEM_OBSERVED",
    privacyClass: "DEALER_SCOPED",
    eventData: { requestedFields: fields, informationRequestId: request.id },
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
    },
    idempotencyKey: `enrich-req:${match.vehicleId}:${fieldsHash}:${request.id}`,
  });

  await notifySellerEnrichmentAggregated({
    vehicleId: match.vehicleId,
    sellerDealerId: match.vehicle.dealerId,
    vehicleTitle: `${match.vehicle.make ?? ""} ${match.vehicle.model ?? ""} ${match.vehicle.year ?? ""}`.trim(),
  });

  return {
    ok: true as const,
    request,
    created: !existing || existing.status !== "OPEN",
    message: "ביקשנו את הפרטים החסרים מבעל הרכב — בלי לחשוף את זהותך.",
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
  const labels = fields.map(fieldLabelHe).join(", ");
  const count = open.length;

  // Anti-spam: skip if recent enrichment notification exists
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

  const title =
    count > 1
      ? `${count} סוחרים גילו עניין ברכב שלך`
      : "יש עניין ברכב שלך";
  const body =
    count > 1
      ? `סוחרים אחרים מחפשים רכב שמתאים לפרטים הידועים של ${params.vehicleTitle || "הרכב"}. חסר: ${labels} — כדי לבדוק התאמה.`
      : `סוחר אחר מחפש רכב שמתאים לפרטים הידועים של ${params.vehicleTitle || "הרכב"}. חסר ${labels} כדי לבדוק אם קיימת התאמה.`;

  await notifyDealerUsers(params.sellerDealerId, {
    type: "INVENTORY_ENRICHMENT",
    title,
    body,
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
    eventData: {
      aggregated: true,
      openRequestCount: count,
      requestedFields: fields,
      note: "seller_push",
    },
    idempotencyKey: `enrich-push:${params.vehicleId}:${Math.floor(Date.now() / ENRICHMENT_NOTIFY_COOLDOWN_MS)}`,
  });
}

export async function getOpenEnrichmentForVehicle(params: {
  dealerId: string;
  vehicleId: string;
}) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: params.vehicleId, dealerId: params.dealerId },
  });
  if (!vehicle) return null;

  const open = await prisma.informationRequest.findMany({
    where: { vehicleId: params.vehicleId, status: "OPEN" },
    select: { id: true, requestedFields: true, createdAt: true },
  });
  const fields = new Set<string>();
  for (const r of open) {
    for (const f of Array.isArray(r.requestedFields)
      ? (r.requestedFields as string[])
      : []) {
      fields.add(f);
    }
  }
  return {
    vehicleId: vehicle.id,
    openRequestCount: open.length,
    requestedFields: [...fields],
    labels: [...fields].map(fieldLabelHe),
    // Never expose requester identity
    requesterIdentity: null,
  };
}

export async function cancelOpenRequestsForDemand(demandId: string) {
  await prisma.informationRequest.updateMany({
    where: { demandId, status: "OPEN" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

export async function cancelOpenRequestsForVehicle(vehicleId: string) {
  await prisma.informationRequest.updateMany({
    where: { vehicleId, status: "OPEN" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

export async function fulfillRequestsAfterVehicleUpdate(params: {
  vehicleId: string;
  sellerDealerId: string;
  updatedFields: string[];
}) {
  const open = await prisma.informationRequest.findMany({
    where: {
      vehicleId: params.vehicleId,
      status: "OPEN",
      vehicle: { dealerId: params.sellerDealerId },
    },
    include: {
      demand: true,
      candidateMatch: true,
      vehicle: true,
    },
  });
  if (open.length === 0) return { fulfilled: 0, reevaluated: [] as string[] };

  await emitExchangeEvent({
    eventType: "INVENTORY_ENRICHED",
    dealerId: params.sellerDealerId,
    vehicleId: params.vehicleId,
    evidenceType: "SYSTEM_OBSERVED",
    privacyClass: "DEALER_SCOPED",
    eventData: { updatedFields: params.updatedFields },
    idempotencyKey: `inventory-enriched:${params.vehicleId}:${[...params.updatedFields].sort().join(",")}:${new Date().toISOString().slice(0, 13)}`,
  });

  const demandIds = new Set<string>();
  let fulfilled = 0;

  for (const req of open) {
    if (req.demand.status !== "ACTIVE") {
      await prisma.informationRequest.update({
        where: { id: req.id },
        data: { status: "EXPIRED", cancelledAt: new Date() },
      });
      continue;
    }
    if (req.vehicle.status !== "ACTIVE") {
      await prisma.informationRequest.update({
        where: { id: req.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      continue;
    }

    const requested = Array.isArray(req.requestedFields)
      ? (req.requestedFields as string[])
      : [];
    const remaining = remainingBlockingFields(req.vehicle, requested);
    if (remaining.length === 0) {
      await prisma.informationRequest.update({
        where: { id: req.id },
        data: { status: "FULFILLED", fulfilledAt: new Date() },
      });
      fulfilled += 1;
      demandIds.add(req.demandId);
    } else {
      await prisma.informationRequest.update({
        where: { id: req.id },
        data: { requestedFields: toPrismaJson(remaining) },
      });
    }
  }

  const { runMatchingForDemand } = await import(
    "@/services/domain/matching-flow"
  );
  const reevaluated: string[] = [];
  for (const demandId of demandIds) {
    await runMatchingForDemand(demandId);
    reevaluated.push(demandId);
  }

  // Notify buyers whose requests were fulfilled and now have resolved matches
  for (const req of open) {
    if (!demandIds.has(req.demandId)) continue;
    const updatedMatch = await prisma.candidateMatch.findUnique({
      where: { id: req.candidateMatchId },
    });
    if (
      updatedMatch &&
      updatedMatch.resolutionState === "RESOLVED" &&
      updatedMatch.matchBandV2 &&
      ["STRONG", "GOOD", "ALTERNATIVE"].includes(updatedMatch.matchBandV2)
    ) {
      await notifyDealerUsers(req.requesterDealerId, {
        type: "BUYER_MATCH",
        title: "הרכב שביקשת עליו פרטים הושלם — ויש התאמה",
        body: COPY.matchPossible,
        link: `/matches?focus=${updatedMatch.id}`,
        entityType: "match",
        entityId: updatedMatch.id,
      });
    }
  }

  return { fulfilled, reevaluated };
}

function remainingBlockingFields(
  vehicle: {
    b2bPrice: number | null;
    retailPrice: number | null;
    mileage: number | null;
    year: number | null;
    color: string | null;
    fieldProvenance: unknown;
  },
  requested: string[]
): string[] {
  const remaining: string[] = [];
  for (const f of requested) {
    if (f === "price") {
      if (vehicle.b2bPrice == null && vehicle.retailPrice == null) remaining.push(f);
      continue;
    }
    if (f === "mileage" && vehicle.mileage == null) {
      remaining.push(f);
      continue;
    }
    if (f === "year" && vehicle.year == null) {
      remaining.push(f);
      continue;
    }
    if (f === "color" && !vehicle.color) {
      remaining.push(f);
      continue;
    }
    if (f === "fuel" || f === "transmission" || f === "drivetrain") {
      const prov = vehicle.fieldProvenance;
      let present = false;
      if (prov && typeof prov === "object" && !Array.isArray(prov)) {
        const v = (prov as Record<string, unknown>)[f];
        if (typeof v === "string" && v.trim()) present = true;
        if (v && typeof v === "object" && "value" in v) {
          const inner = (v as { value?: unknown }).value;
          if (typeof inner === "string" && inner.trim()) present = true;
        }
      }
      if (!present) remaining.push(f);
    }
  }
  return remaining;
}

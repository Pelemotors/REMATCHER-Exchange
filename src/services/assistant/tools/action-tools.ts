import "server-only";
import { prisma } from "@/lib/prisma";
import { parseDemand } from "@/services/ai/demand-parser";
import {
  confirmedFromParsed,
  findDuplicateDemand,
} from "@/services/demand/duplicate-detection";
import {
  computeDemandExpiry,
  runMatchingForDemand,
} from "@/services/domain/matching-flow";
import { logAppEvent } from "@/services/notifications";
import { getDemandByIdForDealer } from "./read-tools";

export async function createDemandDraft(
  dealerId: string,
  userId: string,
  rawText: string
) {
  const parsed = await parseDemand(rawText, userId);
  const confirmed = confirmedFromParsed(parsed as unknown as Record<string, unknown>);

  const existing = await prisma.demand.findMany({
    where: { dealerId, status: { in: ["ACTIVE", "PENDING_CONFIRMATION", "DRAFT"] } },
    select: { id: true, status: true, confirmedJson: true },
  });

  const dup = findDuplicateDemand(confirmed, existing);
  if (dup.level === "NEARLY_IDENTICAL" && dup.existingDemandId) {
    return {
      ok: true as const,
      duplicate: true,
      level: dup.level,
      existingDemandId: dup.existingDemandId,
      message: "כבר יש לך חיפוש כמעט זהה. עדיף לעדכן את הקיים או לפתוח חדש במפורש.",
      parsed,
    };
  }

  return {
    ok: true as const,
    duplicate: false,
    level: dup.level,
    existingDemandId: dup.existingDemandId,
    message: "טיוטת חיפוש מוכנה לאישור.",
    parsed,
    href: `/demand?new=1&text=${encodeURIComponent(rawText)}`,
  };
}

export async function prepareDemandRenewal(dealerId: string, demandId: string) {
  const demand = await getDemandByIdForDealer(dealerId, demandId);
  if (!demand) return { ok: false as const, error: "not_found" };
  return {
    ok: true as const,
    action: "renew_demand",
    label: `לחדש את החיפוש "${demand.title}"?`,
    payload: { demandId },
  };
}

export async function executeDemandRenewal(dealerId: string, demandId: string) {
  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId },
  });
  if (!demand) return { ok: false as const, error: "not_found" };

  await prisma.demand.update({
    where: { id: demandId },
    data: {
      status: "ACTIVE",
      expiresAt: computeDemandExpiry(),
      renewedAt: new Date(),
    },
  });

  await logAppEvent({
    eventType: "demand_renewed",
    entityType: "Demand",
    entityId: demandId,
    dealerId,
  });

  const { recordActivationMilestone } = await import(
    "@/services/activation/milestones"
  );
  void recordActivationMilestone({
    dealerId,
    milestone: "FIRST_DEMAND_ACTIVATED",
    entityType: "Demand",
    entityId: demandId,
  }).catch(() => undefined);

  await runMatchingForDemand(demandId);

  const verified = await getDemandByIdForDealer(dealerId, demandId);
  return { ok: true as const, demand: verified };
}

export async function prepareDemandClosure(dealerId: string, demandId: string) {
  const demand = await getDemandByIdForDealer(dealerId, demandId);
  if (!demand) return { ok: false as const, error: "not_found" };
  return {
    ok: true as const,
    action: "close_demand",
    label: `לסגור את החיפוש "${demand.title}"?`,
    payload: { demandId },
  };
}

export async function executeDemandClosure(dealerId: string, demandId: string) {
  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId },
  });
  if (!demand) return { ok: false as const, error: "not_found" };

  await prisma.demand.update({
    where: { id: demandId },
    data: { status: "CANCELLED" },
  });

  await logAppEvent({
    eventType: "demand_closed",
    entityType: "Demand",
    entityId: demandId,
    dealerId,
  });

  try {
    const { cancelOpenRequestsForDemand } = await import(
      "@/services/matching/information-request"
    );
    await cancelOpenRequestsForDemand(demandId);
  } catch {
    // non-blocking
  }

  return { ok: true as const };
}

/** Resolve dealer's own active searches and propose bulk close — no mutation yet. */
export async function prepareBulkDemandClosure(dealerId: string) {
  const { executeToolsParallel } = await import("./read-tools");
  const { formatBulkSearchCloseMessage } = await import("@/lib/demand-display");
  const { results } = await executeToolsParallel(["getMyActiveDemands"], dealerId);
  const demands = (results.getMyActiveDemands ?? []) as Array<{
    id: string;
    title: string;
    displayLabel?: string;
  }>;
  if (demands.length === 0) {
    return { ok: true as const, empty: true as const, demands: [] as typeof demands };
  }
  const labels = demands.map((d) => d.displayLabel ?? d.title);
  return {
    ok: true as const,
    empty: false as const,
    demands,
    action: "close_demands_bulk",
    label: formatBulkSearchCloseMessage(labels),
    payload: {
      demandIds: demands.map((d) => d.id),
      capability: "SEARCHES",
      operation: "CLOSE",
      scope: "ALL_AUTHORIZED",
      targetCount: demands.length,
      targetSummary: labels.slice(0, 6).join(" · "),
    },
  };
}

export async function executeBulkDemandClosure(
  dealerId: string,
  demandIds: string[]
) {
  const unique = [...new Set(demandIds.filter(Boolean))];
  let closed = 0;
  for (const id of unique) {
    const result = await executeDemandClosure(dealerId, id);
    if (result.ok) closed += 1;
  }
  return { ok: true as const, closed, requested: unique.length };
}

export async function markMyVehicleSold(dealerId: string, vehicleId: string) {
  const { markVehicleSoldForDealer } = await import(
    "@/services/inventory/mark-sold"
  );
  const result = await markVehicleSoldForDealer({
    dealerId,
    vehicleId,
    source: "agent",
  });
  if (!result.ok) return { ok: false as const, error: "not_found" as const };
  return { ok: true as const };
}

export async function prepareConfirmValidation(
  dealerId: string,
  validationId: string
) {
  const validation = await prisma.validationEvent.findFirst({
    where: { id: validationId, dealerId, status: "PENDING" },
    include: { vehicle: { select: { make: true, model: true, year: true } } },
  });
  if (!validation) return { ok: false as const, error: "not_found" };
  const title = `${validation.vehicle.make ?? ""} ${validation.vehicle.model ?? ""} ${validation.vehicle.year ?? ""}`.trim();
  return {
    ok: true as const,
    action: "confirm_validation",
    label: `לאשר ש"${title || "הרכב"}" זמין?`,
    payload: { validationId },
  };
}

export async function executeConfirmValidation(
  dealerId: string,
  validationId: string,
  available: boolean
) {
  const { confirmAvailabilityValidation } = await import(
    "@/services/domain/matching-flow"
  );
  await confirmAvailabilityValidation(validationId, dealerId, available);
  return { ok: true as const, available };
}

export async function prepareMarkSold(dealerId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId },
    select: { id: true, make: true, model: true, year: true },
  });
  if (!vehicle) return { ok: false as const, error: "not_found" };
  const title = `${vehicle.make ?? ""} ${vehicle.model ?? ""} ${vehicle.year ?? ""}`.trim();
  return {
    ok: true as const,
    action: "mark_sold",
    label: `לסמן את "${title || "הרכב"}" כנמכרה ולהסיר מהמלאי הפעיל?`,
    payload: { vehicleId },
  };
}

export async function createInventoryDraftFromText(
  userId: string,
  rawText: string
) {
  const { normalizeVehicle } = await import("@/services/ai/inventory-normalizer");
  const { fieldsFromNormalized } = await import(
    "@/services/inventory/create-vehicle"
  );
  const {
    emptyDraftFields,
    hasInventoryIdentity,
    nextGapToAsk,
    gapQuestion,
    buildStructuredSummary,
    buildCompactSummary,
    readyForConfirmation,
    identityPartialMessage,
    splitMultiVehicleText,
  } = await import("@/services/assistant/inventory-draft");
  const { decideInventoryClarification } = await import(
    "@/services/assistant/inventory-clarify"
  );
  type Draft = import("@/services/assistant/inventory-draft").PendingInventoryDraft;

  const chunks = splitMultiVehicleText(rawText);

  async function draftFromChunk(text: string): Promise<Draft> {
    const normalized = await normalizeVehicle(text, userId);
    const mapped = fieldsFromNormalized(normalized);
    return {
      status: "DRAFT",
      sourceText: text,
      fields: {
        ...emptyDraftFields(),
        make: mapped.make,
        model: mapped.model,
        trim: mapped.trim,
        year: mapped.year,
        mileage: mapped.mileage,
        color: mapped.color,
        ownershipHand: mapped.ownershipHand,
        ownershipType: mapped.ownershipType ?? null,
        retailPrice: mapped.retailPrice,
        b2bPrice: mapped.b2bPrice,
        region: mapped.region,
      },
      askedGaps: [],
      skippedGaps: [],
      ambiguities: normalized.ambiguities,
    };
  }

  if (chunks.length > 1) {
    const drafts = await Promise.all(chunks.map((c) => draftFromChunk(c)));
    const lines = drafts.map((d, i) => {
      const ok = hasInventoryIdentity(d.fields) && readyForConfirmation(d);
      const idOk = hasInventoryIdentity(d.fields);
      const mark = ok ? "✓" : idOk ? "!" : "!";
      const note = !idOk
        ? "חסר זיהוי"
        : !readyForConfirmation(d)
          ? `חסר לי ${nextGapToAsk(d) === "dealer_price" ? "מחיר לסוחר" : nextGapToAsk(d) === "mileage" ? "קילומטראז׳" : "פרטים"}`
          : "מוכן";
      return `${mark} ${buildCompactSummary(d)} — ${note}`;
    });
    const firstNeeding = drafts.findIndex(
      (d) => !readyForConfirmation(d) || !hasInventoryIdentity(d.fields)
    );
    const focusIdx = firstNeeding >= 0 ? firstNeeding : 0;
    const focus = drafts[focusIdx];
    const queued = drafts.filter((_, i) => i !== focusIdx);

    if (!hasInventoryIdentity(focus.fields)) {
      return {
        ok: true as const,
        draft: { ...focus, queuedDrafts: queued },
        phase: "need_identity" as const,
        message: `קלטתי ${drafts.length} רכבים.\n${lines.join("\n")}\n\n${identityPartialMessage(focus.fields)}`,
      };
    }

    if (!readyForConfirmation(focus)) {
      const decision = await decideInventoryClarification({
        draft: focus,
        userId,
      });
      return {
        ok: true as const,
        draft: { ...focus, queuedDrafts: queued },
        phase: "ask_gap" as const,
        gap: decision.gap,
        message: `קלטתי ${drafts.length} רכבים.\n${lines.join("\n")}\n\n${decision.question}`,
      };
    }

    return {
      ok: true as const,
      draft: {
        ...focus,
        status: "WAITING_CONFIRMATION" as const,
        queuedDrafts: queued,
      },
      phase: "confirm" as const,
      summary: buildStructuredSummary(focus),
      message: `קלטתי ${drafts.length} רכבים.\n${lines.join("\n")}\n\n${buildStructuredSummary(focus)}\n\nלשמור את הראשון במלאי?`,
    };
  }

  const draft = await draftFromChunk(rawText);

  if (!hasInventoryIdentity(draft.fields)) {
    return {
      ok: true as const,
      draft,
      phase: "need_identity" as const,
      message: identityPartialMessage(draft.fields),
    };
  }

  if (!readyForConfirmation(draft)) {
    const decision = await decideInventoryClarification({ draft, userId });
    return {
      ok: true as const,
      draft,
      phase: "ask_gap" as const,
      gap: decision.gap,
      message: `הבנתי:\n${buildStructuredSummary(draft)}\n\n${decision.question}`,
    };
  }

  const summary = buildStructuredSummary(draft);
  return {
    ok: true as const,
    draft: { ...draft, status: "WAITING_CONFIRMATION" as const },
    phase: "confirm" as const,
    summary,
    message: `הבנתי:\n${summary}\n\nלשמור במלאי?`,
  };
}

export async function executeConfirmInventoryCreate(
  dealerId: string,
  draft: {
    sourceText: string;
    fields: {
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
    };
  }
) {
  const { createVehicleForDealer } = await import(
    "@/services/inventory/create-vehicle"
  );
  const result = await createVehicleForDealer({
    dealerId,
    rawInput: draft.sourceText,
    fields: draft.fields,
  });

  if (!result.ok) {
    return { ok: false as const, error: result.error, message: result.message };
  }

  await logAppEvent({
    eventType: "vehicle_created",
    entityType: "Vehicle",
    entityId: result.vehicle.id,
    dealerId,
    metadata: { source: "agent_inventory" },
  });

  return { ok: true as const, vehicle: result.vehicle };
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { parseDemandFallback } from "@/services/ai/demand-parser";
import type { ParsedDemand } from "@/lib/schemas/ai";
import {
  confirmedFromParsed,
  findDuplicateDemand,
} from "@/services/demand/duplicate-detection";
function parsedFromVehicleFields(fields: {
  make: string | null;
  model: string | null;
  year: number | null;
}): ParsedDemand {
  const base = parseDemandFallback("");
  if (fields.make) {
    base.make = { value: fields.make, status: "known", source: "inferred" };
  }
  if (fields.model) {
    base.model = { value: fields.model, status: "known", source: "inferred" };
  }
  if (fields.year != null) {
    base.yearMin = { value: fields.year, status: "known", source: "inferred" };
    base.yearMax = { value: fields.year, status: "known", source: "inferred" };
  }
  base.rawSummary = [fields.make, fields.model, fields.year]
    .filter(Boolean)
    .join(" ");
  return base;
}

/**
 * SEARCH_TARGET intent — Demand semantics only, never DealerVehicleRelationship.
 */
export async function upsertDemandForSearchTarget(input: {
  dealerId: string;
  rawText: string;
  parsed?: ParsedDemand;
  sourceMeta?: Record<string, unknown>;
}): Promise<
  | { ok: true; demandId: string; created: boolean; idempotent?: true }
  | { ok: false; error: "missing_identity" }
> {
  const parsed =
    input.parsed ??
    (input.rawText.trim()
      ? parseDemandFallback(input.rawText)
      : parsedFromVehicleFields({ make: null, model: null, year: null }));
  const make = parsed.make?.value;
  const model = parsed.model?.value;
  if (!make || !model) {
    return { ok: false, error: "missing_identity" };
  }

  const confirmed = confirmedFromParsed(
    parsed as unknown as Record<string, unknown>
  );
  const existing = await prisma.demand.findMany({
    where: {
      dealerId: input.dealerId,
      status: { in: ["ACTIVE", "PENDING_CONFIRMATION", "DRAFT"] },
    },
    select: { id: true, status: true, confirmedJson: true },
  });
  const dup = findDuplicateDemand(confirmed, existing);
  if (dup.existingDemandId) {
    await prisma.demand.update({
      where: { id: dup.existingDemandId },
      data: {
        rawText: input.rawText || undefined,
        parsedJson: toPrismaJson({
          ...parsed,
          ...(input.sourceMeta ? { _searchTargetMeta: input.sourceMeta } : {}),
        }),
      },
    });
    return {
      ok: true,
      demandId: dup.existingDemandId,
      created: false,
      idempotent: true,
    };
  }

  const demand = await prisma.demand.create({
    data: {
      dealerId: input.dealerId,
      rawText: input.rawText || `${make} ${model}`,
      parsedJson: toPrismaJson({
        ...parsed,
        ...(input.sourceMeta ? { _searchTargetMeta: input.sourceMeta } : {}),
      }),
      status: "PENDING_CONFIRMATION",
      networkVisibility: "PRIVATE",
    },
  });
  return { ok: true, demandId: demand.id, created: true };
}

export async function upsertSearchTargetFromVehicle(input: {
  dealerId: string;
  vehicleId: string;
}): Promise<
  | { ok: true; demandId: string; idempotent?: true }
  | { ok: false; error: "not_found" | "missing_identity" }
> {
  const v = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, dealerId: input.dealerId },
  });
  if (!v) return { ok: false, error: "not_found" };
  const parsed = parsedFromVehicleFields({
    make: v.make,
    model: v.model,
    year: v.year,
  });
  const rawText = `חיפוש לקוח: ${[v.make, v.model, v.year].filter(Boolean).join(" ")}`;
  const r = await upsertDemandForSearchTarget({
    dealerId: input.dealerId,
    rawText,
    parsed,
    sourceMeta: { vehicleId: v.id, intent: "SEARCH_TARGET" },
  });
  if (!r.ok) return r;
  return { ok: true, demandId: r.demandId, idempotent: r.idempotent };
}

export async function upsertSearchTargetFromCandidate(input: {
  dealerId: string;
  candidateId: string;
  batchConversationText?: string;
}): Promise<
  | { ok: true; demandId: string; idempotent?: true }
  | { ok: false; error: "not_found" | "missing_identity" }
> {
  const c = await prisma.vehicleCandidate.findFirst({
    where: { id: input.candidateId, dealerId: input.dealerId },
    include: { batch: { include: { texts: true } } },
  });
  if (!c) return { ok: false, error: "not_found" };
  const gov = c.govIdentityJson as {
    make?: string | null;
    model?: string | null;
    year?: number | null;
  } | null;
  const combined =
    input.batchConversationText ??
    c.batch.texts.map((t) => t.text).join("\n");
  const parsed = combined.trim()
    ? parseDemandFallback(combined)
    : parsedFromVehicleFields({
        make: gov?.make ?? null,
        model: gov?.model ?? null,
        year: gov?.year ?? null,
      });
  if (!parsed.make?.value && gov?.make && gov?.model) {
    parsed.make = { value: gov.make, status: "known", source: "inferred" };
    parsed.model = { value: gov.model, status: "known", source: "inferred" };
    if (gov.year != null) {
      parsed.yearMin = { value: gov.year, status: "known", source: "inferred" };
      parsed.yearMax = { value: gov.year, status: "known", source: "inferred" };
    }
  }
  const r = await upsertDemandForSearchTarget({
    dealerId: input.dealerId,
    rawText: combined.trim() || parsed.rawSummary || "",
    parsed,
    sourceMeta: { candidateId: c.id, batchId: c.batchId, intent: "SEARCH_TARGET" },
  });
  if (!r.ok) return r;
  return { ok: true, demandId: r.demandId, idempotent: r.idempotent };
}

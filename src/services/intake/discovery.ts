/**
 * Multi-vehicle intake discovery.
 * A batch is a media container — never automatically one vehicle.
 */
type ExtractedField<T> = { value: T; source?: string; confidence?: number };

export const INTAKE_OCR_CONCURRENCY = 3;
export const INTAKE_GOV_CONCURRENCY = 2;

export type GroupingReason =
  | "distinct_plate"
  | "single_plate"
  | "unplated_batch"
  | "unresolved";

export type AssignmentReason =
  | "plate"
  | "order_after_plate"
  | "order_before_first_plate"
  | "unplated_batch"
  | "unresolved";

export type MediaDiscoveryInput = {
  id: string;
  originalOrder: number;
  plateNormalized?: string | null;
  plateConfidence?: number | null;
};

export type MediaAssignment = {
  mediaId: string;
  originalOrder: number;
  groupKey: string;
  plate: string | null;
  reason: AssignmentReason;
};

export type DiscoveryGroup = {
  key: string;
  plate: string | null;
  groupingReason: GroupingReason;
  mediaIds: string[];
  assignments: MediaAssignment[];
};

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const concurrency = Math.max(1, Math.min(limit, items.length));
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function digits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  return d.length >= 7 && d.length <= 8 ? d : null;
}

/**
 * Segment media by plate anchors (left-to-right).
 * Distinct plates → distinct groups.
 * No-plate shots attach to the current open plate group (supporting order).
 * Order never merges two plates. A batch with no plates stays one unresolved/unplated group.
 */
export function assignMediaToIdentityGroups(
  media: MediaDiscoveryInput[]
): DiscoveryGroup[] {
  const ordered = [...media].sort(
    (a, b) => a.originalOrder - b.originalOrder || a.id.localeCompare(b.id)
  );
  if (ordered.length === 0) return [];

  const plated = ordered
    .map((m) => ({ ...m, plate: digits(m.plateNormalized) }))
    .filter((m) => m.plate);

  if (plated.length === 0) {
    const assignments: MediaAssignment[] = ordered.map((m) => ({
      mediaId: m.id,
      originalOrder: m.originalOrder,
      groupKey: "unplated",
      plate: null,
      reason: "unplated_batch" as const,
    }));
    return [
      {
        key: "unplated",
        plate: null,
        groupingReason: "unplated_batch",
        mediaIds: ordered.map((m) => m.id),
        assignments,
      },
    ];
  }

  const firstPlateIndex = ordered.findIndex(
    (m) => digits(m.plateNormalized) != null
  );
  const firstPlate = digits(ordered[firstPlateIndex]?.plateNormalized) ?? null;

  const assignments: MediaAssignment[] = [];
  let currentPlate: string | null = null;

  for (let i = 0; i < ordered.length; i++) {
    const m = ordered[i]!;
    const plate = digits(m.plateNormalized);
    if (plate) {
      currentPlate = plate;
      assignments.push({
        mediaId: m.id,
        originalOrder: m.originalOrder,
        groupKey: plate,
        plate,
        reason: "plate",
      });
      continue;
    }
    if (currentPlate) {
      assignments.push({
        mediaId: m.id,
        originalOrder: m.originalOrder,
        groupKey: currentPlate,
        plate: currentPlate,
        reason: "order_after_plate",
      });
      continue;
    }
    if (firstPlate) {
      assignments.push({
        mediaId: m.id,
        originalOrder: m.originalOrder,
        groupKey: firstPlate,
        plate: firstPlate,
        reason: "order_before_first_plate",
      });
      continue;
    }
    assignments.push({
      mediaId: m.id,
      originalOrder: m.originalOrder,
      groupKey: "unresolved",
      plate: null,
      reason: "unresolved",
    });
  }

  const uniquePlates = [...new Set(plated.map((p) => p.plate!))];
  const groupingReason: GroupingReason =
    uniquePlates.length >= 2 ? "distinct_plate" : "single_plate";

  const byKey = new Map<string, MediaAssignment[]>();
  for (const a of assignments) {
    const list = byKey.get(a.groupKey) ?? [];
    list.push(a);
    byKey.set(a.groupKey, list);
  }

  return [...byKey.entries()].map(([key, list]) => ({
    key,
    plate: list[0]?.plate ?? null,
    groupingReason: key === "unresolved" ? "unresolved" : groupingReason,
    mediaIds: list.map((a) => a.mediaId),
    assignments: list,
  }));
}

/** @deprecated Use assignMediaToIdentityGroups. Kept for existing imports. */
export type CandidateSlot = {
  plate: ExtractedField<string> | null;
  reason: GroupingReason;
  mediaIds?: string[];
};

export function planCandidateSlots(input: {
  plates: ExtractedField<string>[];
  mediaCount: number;
  visionLikelySameVehicle?: boolean | null;
}): CandidateSlot[] {
  const unique = new Map<string, ExtractedField<string>>();
  for (const p of input.plates) {
    const key = p.value.replace(/\D/g, "");
    if (!key) continue;
    const prev = unique.get(key);
    if (!prev || (p.confidence ?? 0) > (prev.confidence ?? 0)) {
      unique.set(key, { ...p, value: key });
    }
  }
  const plates = [...unique.values()];
  if (plates.length >= 2) {
    return plates.map((plate) => ({
      plate,
      reason: "distinct_plate" as const,
    }));
  }
  if (plates.length === 1) {
    return [{ plate: plates[0]!, reason: "single_plate" }];
  }
  return [{ plate: null, reason: "unplated_batch" }];
}

export function formatIsraeliPlate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length === 7) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  return d || null;
}

/**
 * Group IntakeBatch media/text into VehicleCandidate slots.
 * Default: one share action → one candidate unless distinct plate identities conflict.
 */
import type { ExtractedField } from "@/services/intake/text-extract";

export type CandidateSlot = {
  plate: ExtractedField<string> | null;
  reason: "single_batch_default" | "distinct_plates" | "text_multi_plate";
};

/**
 * Decide candidate slots from plate evidence only (safe default ≠ 1 image = 1 vehicle).
 */
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

  // Multiple distinct plates in one share → multiple candidates
  if (plates.length >= 2) {
    // If vision strongly says same vehicle, keep first plate only (OCR conflict → review)
    if (input.visionLikelySameVehicle === true && plates.length === 2) {
      const top = [...plates].sort(
        (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
      )[0]!;
      return [{ plate: top, reason: "single_batch_default" }];
    }
    return plates.map((plate) => ({
      plate,
      reason: "distinct_plates" as const,
    }));
  }

  if (plates.length === 1) {
    return [{ plate: plates[0]!, reason: "text_multi_plate" }];
  }

  // No plate evidence: still ONE candidate for the whole batch (12 photos ≠ 12 cars)
  return [{ plate: null, reason: "single_batch_default" }];
}

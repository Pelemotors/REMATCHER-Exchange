/**
 * Legacy Demand confirmedJson / DemandConstraint → Search Intent 2.0 adapter.
 */
import type { DemandConstraint } from "@prisma/client";
import { confirmedFromJson, type DemandConfirmed } from "@/lib/demand-display";
import {
  emptyStructuredIntent,
  summarizeIntentHe,
  type StructuredSearchIntent,
} from "@/services/matching/search-intent-types";
import {
  canonicalizeFuelType,
  canonicalizeVehicleIdentity,
  normalizeEngineDisplacementCc,
} from "@/services/exchange/vehicle-identity";

export function legacyToSearchIntent(
  confirmedJson: unknown,
  constraints: DemandConstraint[] = []
): { structuredIntent: StructuredSearchIntent; naturalLanguageSummary: string } {
  const confirmed = confirmedFromJson(confirmedJson);
  const intent = emptyStructuredIntent();
  const canonical = canonicalizeVehicleIdentity({ make: confirmed.make, model: confirmed.model });

  if (canonical.make) intent.make = { importance: "VERY_HIGH", target: canonical.make, provenance: "legacy_adapter", confidence: 0.95 };
  if (canonical.model) intent.model = { importance: "VERY_HIGH", target: canonical.model, provenance: "legacy_adapter", confidence: 0.95 };
  if (confirmed.yearMin != null || confirmed.yearMax != null) {
    intent.year = {
      importance: "HARD",
      target: confirmed.yearMin ?? confirmed.yearMax ?? null,
      flexibility: {
        hardMin: confirmed.yearMin ?? null,
        hardMax: confirmed.yearMax ?? null,
        comfortableMin: confirmed.yearMin ?? null,
        comfortableMax: confirmed.yearMax ?? null,
      },
      provenance: "legacy_adapter",
      confidence: 0.85,
    };
  }
  if (confirmed.budgetMax != null) {
    const hardMax = Math.round(confirmed.budgetMax * 1.1);
    intent.price = {
      importance: "HIGH",
      target: confirmed.budgetMax,
      flexibility: { target: confirmed.budgetMax, comfortableMax: confirmed.budgetMax, stretchMax: hardMax, hardMax },
      provenance: "legacy_adapter",
      confidence: 0.8,
      notes: "Legacy soft +10% budget rule mapped into stretch/hardMax",
    };
  }
  if (confirmed.trimPreference) intent.trim = { importance: "PREFERENCE", target: confirmed.trimPreference, provenance: "legacy_adapter" };
  if (confirmed.colorExclusions?.length) intent.color = { importance: "HARD", exclusions: confirmed.colorExclusions, provenance: "legacy_adapter" };

  for (const c of constraints) {
    const val = c.value as { description?: string; value?: unknown };
    const field = c.field.toLowerCase();
    const importance = c.constraintType === "HARD" ? "HARD" : c.constraintType === "SOFT" ? "PREFERENCE" : null;

    if (importance && ["fuel", "fueltype", "engine_type", "propulsion"].includes(field)) {
      const fuel = canonicalizeFuelType(String(val?.value ?? val ?? ""));
      if (fuel) intent.fuel = { importance, target: fuel, provenance: "legacy_adapter" };
    }
    if (importance && ["engine", "enginedisplacementcc", "engine_displacement", "enginecapacity", "engine_capacity"].includes(field)) {
      const cc = normalizeEngineDisplacementCc(val?.value ?? val);
      if (cc) {
        const tolerance = Math.max(50, Math.round(cc * 0.04));
        intent.engineDisplacementCc = {
          importance,
          target: cc,
          flexibility: {
            target: cc,
            comfortableMin: cc - tolerance,
            comfortableMax: cc + tolerance,
            hardMin: importance === "HARD" ? cc - tolerance : null,
            hardMax: importance === "HARD" ? cc + tolerance : null,
          },
          provenance: "legacy_adapter",
        };
      }
    }
    if (importance === "HARD" && (field === "mileage" || field === "mileagemax")) {
      const n = Number(val?.value ?? val);
      if (Number.isFinite(n)) intent.mileage = { importance: "HARD", flexibility: { hardMax: n, comfortableMax: n }, provenance: "legacy_adapter" };
    }
    if (c.constraintType === "EXCLUSION" && field === "color") {
      intent.color = { importance: "HARD", exclusions: [...(intent.color?.exclusions ?? []), String(val?.value ?? c.value)], provenance: "legacy_adapter" };
    }
  }

  return { structuredIntent: intent, naturalLanguageSummary: summarizeIntentHe(intent) };
}

export function searchIntentToLegacyConfirmed(intent: StructuredSearchIntent): DemandConfirmed {
  return {
    make: intent.make?.target ?? null,
    model: intent.model?.target ?? null,
    yearMin: intent.year?.flexibility?.hardMin ?? intent.year?.flexibility?.comfortableMin ?? (typeof intent.year?.target === "number" ? intent.year.target : null),
    yearMax: intent.year?.flexibility?.hardMax ?? intent.year?.flexibility?.comfortableMax ?? null,
    budgetMax: intent.price?.flexibility?.comfortableMax ?? intent.price?.target ?? intent.price?.flexibility?.hardMax ?? null,
    trimPreference: intent.trim?.target ?? null,
    colorExclusions: intent.color?.exclusions ?? [],
  };
}

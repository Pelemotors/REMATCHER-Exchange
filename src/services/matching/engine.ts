import {
  BUDGET_RULE,
  getProductConfig,
  SCORE_THRESHOLDS,
} from "@/config/product";
import type { MatchEvaluation } from "@/lib/schemas/ai";
import type { DemandConstraint, Vehicle } from "@prisma/client";

type FieldResult = MatchEvaluation["fieldResults"][number];

interface DemandProfile {
  make: string | null;
  model: string | null;
  yearMin: number | null;
  yearMax: number | null;
  budgetMax: number | null;
  colorExclusions: string[];
  hardConstraints: Array<{ field: string; value: unknown; description: string }>;
  softPreferences: Array<{ field: string; value: unknown; description: string }>;
}

export function demandProfileFromConstraints(
  constraints: DemandConstraint[],
  confirmedJson?: unknown
): DemandProfile {
  const json = (confirmedJson ?? {}) as Record<string, unknown>;
  const profile: DemandProfile = {
    make: (json.make as string) ?? null,
    model: (json.model as string) ?? null,
    yearMin: (json.yearMin as number) ?? null,
    yearMax: (json.yearMax as number) ?? null,
    budgetMax: (json.budgetMax as number) ?? null,
    colorExclusions: (json.colorExclusions as string[]) ?? [],
    hardConstraints: [],
    softPreferences: [],
  };

  for (const c of constraints) {
    const val = c.value as { description?: string; value?: unknown };
    if (c.constraintType === "HARD") {
      profile.hardConstraints.push({
        field: c.field,
        value: val?.value ?? c.value,
        description: val?.description ?? c.field,
      });
    } else if (c.constraintType === "SOFT") {
      profile.softPreferences.push({
        field: c.field,
        value: val?.value ?? c.value,
        description: val?.description ?? c.field,
      });
    } else if (c.constraintType === "EXCLUSION") {
      if (c.field === "color") {
        profile.colorExclusions.push(String(val?.value ?? c.value));
      }
    }
  }

  return profile;
}

function normalizeColor(color: string | null | undefined): string {
  if (!color) return "";
  const map: Record<string, string> = {
    אדום: "red",
    red: "red",
    לבן: "white",
    white: "white",
    שחור: "black",
    black: "black",
    כסף: "silver",
    silver: "silver",
  };
  return map[color.toLowerCase()] ?? color.toLowerCase();
}

function compareField(
  field: string,
  label: string,
  vehicleValue: unknown,
  required: unknown,
  compare: (v: unknown, r: unknown) => "MATCH" | "MISMATCH" | "UNKNOWN"
): FieldResult {
  if (vehicleValue == null || vehicleValue === "") {
    return { field, result: "UNKNOWN", label, detail: "מידע חסר ברכב" };
  }
  if (required == null) {
    return { field, result: "MATCH", label, detail: "לא נדרש" };
  }
  const result = compare(vehicleValue, required);
  return {
    field,
    result,
    label,
    detail:
      result === "MATCH"
        ? "מתאים"
        : result === "MISMATCH"
          ? "לא מתאים"
          : "לא ידוע",
  };
}

export function evaluateMatch(
  vehicle: Vehicle,
  profile: DemandProfile
): MatchEvaluation {
  const config = getProductConfig();
  const weights = config.matchingWeights;
  const fieldResults: FieldResult[] = [];
  let weightedScore = 0;
  let totalWeight = 0;
  const fits: string[] = [];
  const gaps: string[] = [];

  // Hard: color exclusions
  if (profile.colorExclusions.length > 0 && vehicle.color) {
    const vColor = normalizeColor(vehicle.color);
    for (const ex of profile.colorExclusions) {
      if (normalizeColor(ex) === vColor) {
        return {
          overallBand: "HIDDEN",
          score: 0,
          hardPassed: false,
          fieldResults: [
            {
              field: "color",
              result: "MISMATCH",
              label: "צבע",
              detail: "צבע מוחרג בחיפוש",
            },
          ],
          gaps: ["צבע — לא מתאים (החרגה)"],
          fits: [],
        };
      }
    }
  }

  // Hard constraints from explicit list
  for (const hc of profile.hardConstraints) {
    if (hc.field === "seats" && vehicle.fieldProvenance) {
      // seats not on vehicle model directly — would need extension
      continue;
    }
  }

  // Year
  if (profile.yearMin != null) {
    const fr = compareField("year", "שנתון", vehicle.year, profile.yearMin, (v, r) => {
      const year = v as number;
      const min = r as number;
      return year >= min ? "MATCH" : "MISMATCH";
    });
    fieldResults.push(fr);
    totalWeight += weights.year;
    if (fr.result === "MATCH") {
      weightedScore += weights.year;
      fits.push("שנתון — מתאים");
    } else if (fr.result === "MISMATCH") {
      gaps.push("שנתון — לא מתאים");
      return {
        overallBand: "HIDDEN",
        score: 0,
        hardPassed: false,
        fieldResults,
        gaps,
        fits,
      };
    }
  }

  // Make/Model
  if (profile.make) {
    const fr = compareField("make", "יצרן", vehicle.make, profile.make, (v, r) =>
      String(v).toLowerCase().includes(String(r).toLowerCase()) ? "MATCH" : "MISMATCH"
    );
    fieldResults.push(fr);
    totalWeight += weights.makeModel / 2;
    if (fr.result === "MATCH") {
      weightedScore += weights.makeModel / 2;
      fits.push("יצרן — מתאים");
    } else if (fr.result === "MISMATCH") gaps.push("יצרן — לא מתאים");
  }

  if (profile.model) {
    const fr = compareField("model", "דגם", vehicle.model, profile.model, (v, r) =>
      String(v).toLowerCase().includes(String(r).toLowerCase()) ? "MATCH" : "MISMATCH"
    );
    fieldResults.push(fr);
    totalWeight += weights.makeModel / 2;
    if (fr.result === "MATCH") {
      weightedScore += weights.makeModel / 2;
      fits.push("דגם — מתאים");
    } else if (fr.result === "MISMATCH") gaps.push("דגם — לא מתאים");
  }

  // Budget (soft — LOCKED §31)
  let budgetOverPercent = 0;
  if (profile.budgetMax != null && vehicle.b2bPrice != null) {
    const price = vehicle.b2bPrice;
    const budget = profile.budgetMax;
    budgetOverPercent = ((price - budget) / budget) * 100;

    if (budgetOverPercent > BUDGET_RULE.SOFT_OVER_PERCENT) {
      return {
        overallBand: "HIDDEN",
        score: 0,
        hardPassed: true,
        fieldResults: [
          ...fieldResults,
          {
            field: "budget",
            result: "MISMATCH",
            label: "מחיר",
            detail: "מעל התקציב (יותר מ-10%)",
          },
        ],
        gaps: ["מחיר — מעל התקציב"],
        fits,
      };
    }

    const fr: FieldResult = {
      field: "budget",
      result: budgetOverPercent <= 0 ? "MATCH" : "MATCH",
      label: "מחיר",
      detail:
        budgetOverPercent > 0
          ? "מעט גבוה מהתקציב"
          : "בתוך התקציב",
    };
    fieldResults.push(fr);
    totalWeight += weights.budget;
    let budgetScore = weights.budget;
    if (budgetOverPercent > 0) {
      budgetScore *= Math.max(0, 1 - budgetOverPercent / BUDGET_RULE.SOFT_OVER_PERCENT);
      gaps.push("מחיר — מעט גבוה ממה שהוגדר בחיפוש");
    } else {
      fits.push("מחיר — מתאים");
    }
    weightedScore += budgetScore;
  } else if (profile.budgetMax != null && vehicle.b2bPrice == null) {
    fieldResults.push({
      field: "budget",
      result: "UNKNOWN",
      label: "מחיר",
      detail: "מחיר חסר",
    });
  }

  const score = totalWeight > 0 ? (weightedScore / totalWeight) * 100 : 0;

  let overallBand: MatchEvaluation["overallBand"] = "HIDDEN";
  if (score >= SCORE_THRESHOLDS.STRONG_MIN && budgetOverPercent <= 0) {
    overallBand = "STRONG";
  } else if (score >= SCORE_THRESHOLDS.ALTERNATIVE_MIN) {
    overallBand = "ALTERNATIVE";
  }

  // Strong match cannot have budget overage (LOCKED §31)
  if (budgetOverPercent > 0 && overallBand === "STRONG") {
    overallBand = "ALTERNATIVE";
  }

  return {
    overallBand,
    score: Math.round(score),
    hardPassed: true,
    fieldResults,
    gaps,
    fits,
  };
}

export function scoreBandToEnum(
  band: string
): "STRONG" | "GOOD" | "ALTERNATIVE" | "HIDDEN" {
  if (
    band === "STRONG" ||
    band === "GOOD" ||
    band === "ALTERNATIVE" ||
    band === "HIDDEN"
  ) {
    return band;
  }
  return "HIDDEN";
}

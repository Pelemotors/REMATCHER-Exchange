import { z } from "zod";

export const fieldValueSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  status: z.enum(["known", "unknown", "ambiguous"]),
  source: z.enum(["user", "ai", "inferred"]).optional(),
});

export const parsedDemandSchema = z.object({
  make: fieldValueSchema.optional(),
  model: fieldValueSchema.optional(),
  yearMin: fieldValueSchema.optional(),
  yearMax: fieldValueSchema.optional(),
  budgetMax: fieldValueSchema.optional(),
  trimPreference: fieldValueSchema.optional(),
  mileageMax: fieldValueSchema.optional(),
  seatsMin: fieldValueSchema.optional(),
  colorExclusions: z.array(z.string()).optional(),
  colorPreferences: z.array(z.string()).optional(),
  hardConstraints: z.array(
    z.object({
      field: z.string(),
      description: z.string(),
      value: z.unknown(),
    })
  ),
  softPreferences: z.array(
    z.object({
      field: z.string(),
      description: z.string(),
      value: z.unknown(),
    })
  ),
  exclusions: z.array(
    z.object({
      field: z.string(),
      description: z.string(),
      value: z.unknown(),
    })
  ),
  ambiguities: z.array(z.string()),
  rawSummary: z.string().optional(),
});

export type ParsedDemand = z.infer<typeof parsedDemandSchema>;

export const normalizedVehicleSchema = z.object({
  make: fieldValueSchema.optional(),
  model: fieldValueSchema.optional(),
  trim: fieldValueSchema.optional(),
  year: fieldValueSchema.optional(),
  mileage: fieldValueSchema.optional(),
  color: fieldValueSchema.optional(),
  ownershipHand: fieldValueSchema.optional(),
  ownershipType: fieldValueSchema.optional(),
  retailPrice: fieldValueSchema.optional(),
  b2bPrice: fieldValueSchema.optional(),
  region: fieldValueSchema.optional(),
  ambiguities: z.array(z.string()),
  rawSummary: z.string().optional(),
});

export type NormalizedVehicle = z.infer<typeof normalizedVehicleSchema>;

export const matchEvaluationSchema = z.object({
  overallBand: z.enum(["STRONG", "GOOD", "ALTERNATIVE", "HIDDEN", "NO_MATCH"]),
  score: z.number(),
  hardPassed: z.boolean(),
  fieldResults: z.array(
    z.object({
      field: z.string(),
      result: z.enum(["MATCH", "MISMATCH", "UNKNOWN"]),
      label: z.string(),
      detail: z.string().optional(),
    })
  ),
  gaps: z.array(z.string()),
  fits: z.array(z.string()),
});

export type MatchEvaluation = z.infer<typeof matchEvaluationSchema>;

export const matchExplanationSchema = z.object({
  headline: z.enum(["התאמה גבוהה", "התאמה טובה עם פער", "לא רלוונטי"]),
  summary: z.string(),
  fits: z.array(z.string()),
  gaps: z.array(z.string()),
});

export type MatchExplanation = z.infer<typeof matchExplanationSchema>;

/** Extract known value or null — never invent */
export function extractKnown(
  field: z.infer<typeof fieldValueSchema> | undefined
): string | number | boolean | null {
  if (!field || field.status !== "known") return null;
  return field.value;
}

export function extractKnownNumber(
  field: z.infer<typeof fieldValueSchema> | undefined
): number | null {
  const v = extractKnown(field);
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseInt(v.replace(/[^\d]/g, ""), 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

export function extractKnownString(
  field: z.infer<typeof fieldValueSchema> | undefined
): string | null {
  const v = extractKnown(field);
  return typeof v === "string" ? v : v != null ? String(v) : null;
}

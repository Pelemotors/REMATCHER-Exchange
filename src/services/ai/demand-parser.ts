import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import { parsedDemandSchema, type ParsedDemand } from "@/lib/schemas/ai";
import { callOpenAIStructured, isOpenAIConfigured, logAiOperation } from "./client";
import { JSON_SCHEMA_CONSTRAINT_ITEM, JSON_SCHEMA_STATUS_FIELD } from "./json-schemas";
import { resolveVehicleThroughExchangeBrain } from "@/services/exchange/vehicle-intelligence";
import { canonicalizeVehicleFeatures, vehicleFeatureLabelHe } from "@/services/exchange/vehicle-features";

const SYSTEM_PROMPT = `You parse Hebrew/English natural language vehicle demand for a B2B dealer exchange.
You are the semantic authority for the user's wording. Application fallback code must not interpret aliases, synonyms or vehicle meaning.
Rules (CRITICAL):
- NEVER invent constraints the user did not state. Knowledge about vehicles must NOT become mandatory constraints.
- If information is not stated, mark field status as "unknown" or list in ambiguities.
- Field status must be exactly one of "known", "unknown", "ambiguous".
- Normalize make/model to canonical international names; the Exchange vehicle-intelligence AI boundary validates final identity.
- fuelType: when explicitly stated return GASOLINE, DIESEL, HYBRID, PLUG_IN_HYBRID, ELECTRIC, LPG, CNG, HYDROGEN or OTHER.
- engineDisplacementCc: when explicitly stated return integer cc; 1.6L = 1600. Never infer engine size from model knowledge.
- ownershipHand: when explicitly stated return integer hand number. Never infer it.
- ownershipType: normalize private/פרטי, leasing/ליסינג, rental/השכרה, company/חברה, trade-in/טרייד אין.
- features: include only explicitly requested special equipment/drivetrain features and return canonical feature identifiers supplied by the product vocabulary.
- IMPORTANT PRODUCT RULE: if the dealer explicitly mentions a special feature as part of the requested vehicle, treat it as a hard requirement by default, even without the literal word "חובה". Example: "סופרב 4x4", "קודיאק 4x4", "קורולה עם חלון בגג" => feature belongs in hardConstraints.
- Only classify an explicitly mentioned feature as a softPreference when clearly framed as optional/preferred, e.g. "עדיף", "רצוי", "אם יש", "בונוס", "לא חובה", "nice to have", "preferably", "if available".
- Explicit fuel/engine/hand/ownership requirements belong in hardConstraints when mandatory, otherwise softPreferences.
- Color exclusions must use exclusions[] with field "color" and canonical English value.
- Distinguish hardConstraints, softPreferences and exclusions.
- Budget in ILS unless stated otherwise. Year "22" means 2022.
- Return structured JSON only.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    make: JSON_SCHEMA_STATUS_FIELD,
    model: JSON_SCHEMA_STATUS_FIELD,
    yearMin: JSON_SCHEMA_STATUS_FIELD,
    yearMax: JSON_SCHEMA_STATUS_FIELD,
    budgetMax: JSON_SCHEMA_STATUS_FIELD,
    trimPreference: JSON_SCHEMA_STATUS_FIELD,
    mileageMax: JSON_SCHEMA_STATUS_FIELD,
    seatsMin: JSON_SCHEMA_STATUS_FIELD,
    fuelType: JSON_SCHEMA_STATUS_FIELD,
    engineDisplacementCc: JSON_SCHEMA_STATUS_FIELD,
    ownershipHand: JSON_SCHEMA_STATUS_FIELD,
    ownershipType: JSON_SCHEMA_STATUS_FIELD,
    features: { type: "array", items: { type: "string" } },
    colorExclusions: { type: "array", items: { type: "string" } },
    colorPreferences: { type: "array", items: { type: "string" } },
    hardConstraints: { type: "array", items: JSON_SCHEMA_CONSTRAINT_ITEM },
    softPreferences: { type: "array", items: JSON_SCHEMA_CONSTRAINT_ITEM },
    exclusions: { type: "array", items: JSON_SCHEMA_CONSTRAINT_ITEM },
    ambiguities: { type: "array", items: { type: "string" } },
    rawSummary: { type: "string" },
  },
  required: [
    "make", "model", "yearMin", "yearMax", "budgetMax", "trimPreference",
    "mileageMax", "seatsMin", "fuelType", "engineDisplacementCc", "ownershipHand",
    "ownershipType", "features", "colorExclusions", "colorPreferences", "hardConstraints",
    "softPreferences", "exclusions", "ambiguities", "rawSummary",
  ],
  additionalProperties: false,
} as const;

function maybePushSoftConstraint(result: ParsedDemand, field: string, value: unknown, description: string) {
  if (result.softPreferences.some((x) => x.field === field) || result.hardConstraints.some((x) => x.field === field)) return;
  result.softPreferences.push({ field, value, description });
}

/**
 * AI-unavailable fallback deliberately preserves the raw request without interpreting it.
 * This is a safety boundary: no regex/alias dictionary is allowed to become the semantic authority.
 */
export function parseDemandFallback(rawText: string): ParsedDemand {
  return parsedDemandSchema.parse({
    hardConstraints: [],
    softPreferences: [],
    exclusions: [],
    ambiguities: ["נדרש AI כדי להבין ולנרמל את החיפוש"],
    rawSummary: rawText,
    features: [],
    colorExclusions: [],
    colorPreferences: [],
  });
}

type StatusField = { value?: unknown; status?: string; source?: string } | null | undefined;

function normalizeStatusField(field: StatusField): StatusField {
  if (!field || typeof field !== "object") return field;
  const allowed = new Set(["known", "unknown", "ambiguous"]);
  if (field.status && allowed.has(field.status)) return field;
  return { ...field, status: field.value != null && field.value !== "" ? "known" : "unknown" };
}

async function sanitizeParsedDemand(data: unknown, rawText: string, userId?: string): Promise<ParsedDemand> {
  const copy = { ...(data as ParsedDemand) };
  copy.hardConstraints = copy.hardConstraints ?? [];
  copy.softPreferences = copy.softPreferences ?? [];
  copy.exclusions = copy.exclusions ?? [];
  copy.ambiguities = copy.ambiguities ?? [];
  copy.colorExclusions = copy.colorExclusions ?? [];
  copy.colorPreferences = copy.colorPreferences ?? [];

  const fields = [
    "make", "model", "yearMin", "yearMax", "budgetMax", "trimPreference", "mileageMax", "seatsMin",
    "fuelType", "engineDisplacementCc", "ownershipHand", "ownershipType",
  ] as const;
  for (const field of fields) {
    const normalized = normalizeStatusField(copy[field]);
    if (normalized !== undefined) (copy as Record<string, unknown>)[field] = normalized;
  }

  const identity = await resolveVehicleThroughExchangeBrain({
    make: copy.make?.status === "known" ? String(copy.make.value ?? "") : null,
    model: copy.model?.status === "known" ? String(copy.model.value ?? "") : null,
    fuelType: copy.fuelType?.status === "known" ? String(copy.fuelType.value ?? "") : null,
    engineDisplacementCc: copy.engineDisplacementCc?.status === "known" ? copy.engineDisplacementCc.value as number | string | null : null,
    ownershipHand: copy.ownershipHand?.status === "known" ? copy.ownershipHand.value as number | string | null : null,
    ownershipType: copy.ownershipType?.status === "known" ? String(copy.ownershipType.value ?? "") : null,
    rawText,
    userId,
  });
  if (identity.make) copy.make = { value: identity.make, status: "known", source: "ai" };
  if (identity.model) copy.model = { value: identity.model, status: "known", source: "ai" };
  if (identity.fuelType) copy.fuelType = { value: identity.fuelType, status: "known", source: "ai" };
  if (identity.engineDisplacementCc != null) copy.engineDisplacementCc = { value: identity.engineDisplacementCc, status: "known", source: "ai" };
  if (identity.ownershipHand != null) copy.ownershipHand = { value: identity.ownershipHand, status: "known", source: "ai" };
  if (identity.ownershipType) copy.ownershipType = { value: identity.ownershipType, status: "known", source: "ai" };

  // Validation only: natural-language feature interpretation already happened in AI.
  copy.features = canonicalizeVehicleFeatures(copy.features ?? []);
  for (const feature of copy.features) {
    if (!copy.hardConstraints.some((x) => x.field === "feature" && x.value === feature) &&
        !copy.softPreferences.some((x) => x.field === "feature" && x.value === feature)) {
      copy.hardConstraints.push({
        field: "feature",
        value: feature,
        description: `${vehicleFeatureLabelHe(feature)} — נדרש כי הסוחר ציין את הפיצ'ר בחיפוש`,
      });
    }
  }

  if (copy.fuelType?.status === "known") maybePushSoftConstraint(copy, "fuel", copy.fuelType.value, `סוג דלק/הנעה ${copy.fuelType.value}`);
  if (copy.engineDisplacementCc?.status === "known") maybePushSoftConstraint(copy, "engineDisplacementCc", copy.engineDisplacementCc.value, `נפח מנוע ${copy.engineDisplacementCc.value} סמ״ק`);
  if (copy.ownershipHand?.status === "known") maybePushSoftConstraint(copy, "hand", copy.ownershipHand.value, `יד ${copy.ownershipHand.value}`);
  if (copy.ownershipType?.status === "known") maybePushSoftConstraint(copy, "ownershipSource", copy.ownershipType.value, `מקוריות ${copy.ownershipType.value}`);

  return parsedDemandSchema.parse(copy);
}

async function logDemandParseFallback(reason: string, userId?: string): Promise<void> {
  await logAiOperation({
    operation: "demand_parse",
    promptVersion: AI_PROMPT_VERSIONS.demandParser,
    model: AI_MODELS.demandParser,
    success: false,
    errorMessage: reason,
    userId,
  });
}

export async function parseDemand(rawText: string, userId?: string): Promise<ParsedDemand> {
  if (!isOpenAIConfigured()) {
    await logDemandParseFallback("OPENAI_API_KEY not configured — semantic parsing held for AI", userId);
    return parseDemandFallback(rawText);
  }

  try {
    const { data } = await callOpenAIStructured<ParsedDemand>({
      operation: "demand_parse",
      promptVersion: AI_PROMPT_VERSIONS.demandParser,
      model: AI_MODELS.demandParser,
      systemPrompt: SYSTEM_PROMPT,
      userContent: rawText,
      schemaName: "parsed_demand",
      schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      userId,
    });
    return sanitizeParsedDemand(data, rawText, userId);
  } catch (error) {
    await logDemandParseFallback(
      `OpenAI demand parse failed — semantic parsing held for AI: ${error instanceof Error ? error.message : "unknown"}`,
      userId
    );
    return parseDemandFallback(rawText);
  }
}

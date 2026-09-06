import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import {
  parsedDemandSchema,
  type ParsedDemand,
} from "@/lib/schemas/ai";
import { callOpenAIStructured, isOpenAIConfigured, logAiOperation } from "./client";
import {
  JSON_SCHEMA_CONSTRAINT_ITEM,
  JSON_SCHEMA_STATUS_FIELD,
} from "./json-schemas";
import { resolveVehicleThroughExchangeBrain } from "@/services/exchange/vehicle-intelligence";
import {
  canonicalizeFuelType,
  canonicalizeOwnershipSource,
  normalizeEngineDisplacementCc,
} from "@/services/exchange/vehicle-identity";
import {
  canonicalizeVehicleFeatures,
  extractVehicleFeaturesFromText,
  vehicleFeatureLabelHe,
} from "@/services/exchange/vehicle-features";

const SYSTEM_PROMPT = `You parse Hebrew/English natural language vehicle demand for a B2B dealer exchange.
Rules (CRITICAL):
- NEVER invent constraints the user did not state (I-08). Knowledge about vehicles must NOT become mandatory constraints.
- If information is not stated, mark field status as "unknown" or list in ambiguities.
- Field status must be exactly one of "known", "unknown", "ambiguous".
- Normalize make/model to canonical international names, but the Exchange vehicle-intelligence layer makes the final identity decision.
- fuelType: when explicitly stated return GASOLINE, DIESEL, HYBRID, PLUG_IN_HYBRID, ELECTRIC, LPG, CNG, HYDROGEN or OTHER.
- engineDisplacementCc: when explicitly stated return integer cc; 1.6L = 1600. Never infer engine size from model knowledge.
- ownershipHand: when explicitly stated return integer hand number. Never infer it.
- ownershipType: normalize private/פרטי, leasing/ליסינג, rental/השכרה, company/חברה, trade-in/טרייד אין.
- features: include only explicitly requested special equipment/drivetrain features. Canonical examples: AWD_4X4, SUNROOF, PANORAMIC_ROOF, LEATHER_SEATS, ELECTRIC_SEATS, HEATED_SEATS, VENTILATED_SEATS, ADAPTIVE_CRUISE, LANE_ASSIST, BLIND_SPOT_MONITOR, PARKING_SENSORS, REAR_CAMERA, SURROUND_CAMERA, TOW_BAR.
- Explicit fuel/engine/hand/ownership/feature requirements must also be represented in hardConstraints when mandatory, otherwise softPreferences.
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

function featureIsMandatory(rawText: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:חייב|חובה|רק|must|required)[^,.]{0,24}${escaped}|${escaped}[^,.]{0,24}(?:חייב|חובה|must|required)`, "i");
  return re.test(rawText);
}

/** Fallback parser when OpenAI unavailable — minimal, bilingual, no invented constraints */
export function parseDemandFallback(rawText: string): ParsedDemand {
  const text = rawText.toLowerCase();
  const result: ParsedDemand = {
    hardConstraints: [],
    softPreferences: [],
    exclusions: [],
    ambiguities: [],
    rawSummary: rawText,
  };

  const makeModelPairs: Array<[RegExp, string, string]> = [
    [/יונדאי\s+אקסנט|יונדיי\s+אקסנט|hyundai\s+accent/i, "Hyundai", "Accent"],
    [/סקודה\s+סופרב|skoda\s+superb/i, "Skoda", "Superb"],
    [/מאזדה\s+cx[- ]?5|mazda\s+cx[- ]?5/i, "Mazda", "CX-5"],
  ];
  for (const [pattern, make, model] of makeModelPairs) {
    if (pattern.test(rawText)) {
      result.make = { value: make, status: "known", source: "inferred" };
      result.model = { value: model, status: "known", source: "inferred" };
      break;
    }
  }
  if (!result.make && (text.includes("מאזדה") || text.includes("mazda"))) {
    result.make = { value: "Mazda", status: "known", source: "inferred" };
  }
  if (text.includes("cx5") || text.includes("cx-5") || text.includes("cx 5")) {
    result.make = { value: "Mazda", status: "known", source: "inferred" };
    result.model = { value: "CX-5", status: "known", source: "inferred" };
  }

  const yearMatch = text.match(/(?:20)?(\d{2})\s*(?:ומעלה|\+|and up)?/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    result.yearMin = { value: y < 100 ? 2000 + y : y, status: "known" };
  }

  const budgetMatch = text.match(/(?:עד|max|up to|תקציב)\s*[:=]?\s*(\d+)/);
  if (budgetMatch) {
    let budget = parseInt(budgetMatch[1], 10);
    if (budget < 1000) budget *= 1000;
    result.budgetMax = { value: budget, status: "known" };
  }

  const fuelMatch = rawText.match(/פלאג[\s־-]*אין(?:\s+היברידי)?|plug[\s-]*in(?:\s+hybrid)?|phev|היברידי|hybrid|hev|חשמלי|electric|\bev\b|דיזל|סולר|diesel|בנזין|gasoline|petrol|גפ[״"]?מ|lpg|cng|מימן|hydrogen/i);
  if (fuelMatch) {
    const fuel = canonicalizeFuelType(fuelMatch[0]);
    if (fuel) {
      result.fuelType = { value: fuel, status: "known", source: "inferred" };
      maybePushSoftConstraint(result, "fuel", fuel, `סוג הנעה/דלק ${fuel}`);
    }
  }

  const engineMatch = rawText.match(/(?:מנוע|נפח(?:\s+מנוע)?|engine)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:cc|סמ[״"]?ק|l|ליטר)?/i);
  if (engineMatch) {
    const cc = normalizeEngineDisplacementCc(
      /[.,]/.test(engineMatch[1]) || Number(engineMatch[1]) < 20
        ? `${engineMatch[1]} ליטר`
        : engineMatch[1]
    );
    if (cc) {
      result.engineDisplacementCc = { value: cc, status: "known", source: "inferred" };
      maybePushSoftConstraint(result, "engineDisplacementCc", cc, `נפח מנוע ${cc} סמ״ק`);
    }
  }

  const handMatch = rawText.match(/(?:יד|hand)\s*[:#-]?\s*([1-9])/i);
  if (handMatch) {
    const hand = Number(handMatch[1]);
    result.ownershipHand = { value: hand, status: "known", source: "inferred" };
    maybePushSoftConstraint(result, "hand", hand, `יד ${hand}`);
  }

  const ownershipMatch = rawText.match(/טרייד[\s־-]*אין|trade[\s-]*in|ליסינג|leasing|lease|השכרה|rental|rent|פרטי|private|חברה|company|corporate/i);
  if (ownershipMatch) {
    const ownership = canonicalizeOwnershipSource(ownershipMatch[0]);
    if (ownership) {
      result.ownershipType = { value: ownership, status: "known", source: "inferred" };
      maybePushSoftConstraint(result, "ownershipSource", ownership, `מקוריות ${ownership}`);
    }
  }

  const features = extractVehicleFeaturesFromText(rawText);
  if (features.length) {
    result.features = features;
    for (const feature of features) {
      const label = vehicleFeatureLabelHe(feature);
      const target = featureIsMandatory(rawText, label) ? result.hardConstraints : result.softPreferences;
      target.push({ field: "feature", description: `${label}${target === result.hardConstraints ? " חובה" : ""}`, value: feature });
    }
  }

  if (text.includes("לא אדום") || text.includes("not red")) {
    result.exclusions.push({ field: "color", description: "לא אדום", value: "red" });
  }
  if (text.includes("מפואר") || text.includes("premium") || text.includes("high trim")) {
    result.softPreferences.push({ field: "trim", description: "עדיפות לגרסה מפוארת", value: "high_trim" });
  }

  return parsedDemandSchema.parse(result);
}

type StatusField = { value?: unknown; status?: string; source?: string } | null | undefined;

function normalizeStatusField(field: StatusField): StatusField {
  if (!field || typeof field !== "object") return field;
  const allowed = new Set(["known", "unknown", "ambiguous"]);
  if (field.status && allowed.has(field.status)) return field;
  return { ...field, status: field.value != null && field.value !== "" ? "known" : "unknown" };
}

const COLOR_CANONICAL: Record<string, string> = {
  אדום: "red", red: "red", לבן: "white", white: "white", שחור: "black", black: "black",
};

async function sanitizeParsedDemand(data: unknown, rawText: string, userId?: string): Promise<ParsedDemand> {
  const copy = { ...(data as ParsedDemand) };
  copy.hardConstraints = copy.hardConstraints ?? [];
  copy.softPreferences = copy.softPreferences ?? [];
  copy.exclusions = copy.exclusions ?? [];
  copy.ambiguities = copy.ambiguities ?? [];

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

  const colorExclusions = (copy.colorExclusions ?? []).map((c) => {
    const lower = c.toLowerCase();
    return COLOR_CANONICAL[c] ?? COLOR_CANONICAL[lower] ?? c;
  });
  copy.colorExclusions = colorExclusions;
  if (colorExclusions.length > 0 && copy.exclusions.length === 0) {
    copy.exclusions = colorExclusions.map((c) => ({ field: "color", description: `לא ${c}`, value: c }));
  }

  copy.features = canonicalizeVehicleFeatures([
    ...(copy.features ?? []),
    ...extractVehicleFeaturesFromText(rawText),
  ]);

  if (copy.fuelType?.status === "known") maybePushSoftConstraint(copy, "fuel", copy.fuelType.value, `סוג דלק/הנעה ${copy.fuelType.value}`);
  if (copy.engineDisplacementCc?.status === "known") maybePushSoftConstraint(copy, "engineDisplacementCc", copy.engineDisplacementCc.value, `נפח מנוע ${copy.engineDisplacementCc.value} סמ״ק`);
  if (copy.ownershipHand?.status === "known") maybePushSoftConstraint(copy, "hand", copy.ownershipHand.value, `יד ${copy.ownershipHand.value}`);
  if (copy.ownershipType?.status === "known") maybePushSoftConstraint(copy, "ownershipSource", copy.ownershipType.value, `מקוריות ${copy.ownershipType.value}`);
  for (const feature of copy.features ?? []) {
    if (!copy.hardConstraints.some((x) => x.field === "feature" && x.value === feature) &&
        !copy.softPreferences.some((x) => x.field === "feature" && x.value === feature)) {
      maybePushSoftConstraint(copy, "feature", feature, vehicleFeatureLabelHe(feature));
    }
  }

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
    await logDemandParseFallback("OPENAI_API_KEY not configured — deterministic fallback", userId);
    return sanitizeParsedDemand(parseDemandFallback(rawText), rawText, userId);
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
      `OpenAI demand parse failed — deterministic fallback: ${error instanceof Error ? error.message : "unknown"}`,
      userId
    );
    return sanitizeParsedDemand(parseDemandFallback(rawText), rawText, userId);
  }
}

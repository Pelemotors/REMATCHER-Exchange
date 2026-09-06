import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import {
  normalizedVehicleSchema,
  type NormalizedVehicle,
  extractKnownNumber,
  extractKnownString,
} from "@/lib/schemas/ai";
import { callOpenAIStructured, isOpenAIConfigured } from "./client";
import { JSON_SCHEMA_STATUS_FIELD } from "./json-schemas";
import { INVENTORY_COMMERCIAL_PLAYBOOK } from "@/services/assistant/inventory-commercial-playbook";
import { canonicalizeVehicleFeatures } from "@/services/exchange/vehicle-features";

const SYSTEM_PROMPT = `${INVENTORY_COMMERCIAL_PLAYBOOK}

You are the semantic normalization authority for messy Hebrew/English vehicle inventory text.
Application fallback code must not interpret aliases, nicknames, synonyms or vehicle meaning.
Rules (CRITICAL):
- NEVER invent missing vehicle data. If a field is not in source, status must be "unknown".
- Do not guess model from make alone.
- Resolve high-confidence nicknames/transliterations only when supported by the source text.
- Year "22" = 2022. Prices are in ILS unless explicitly stated otherwise.
- Product semantics have ONE seller vehicle price: the asking price (מחיר מבוקש). retailPrice and b2bPrice are legacy storage aliases only. When one asking price is stated, return the SAME value in BOTH fields. Never invent a second price.
- ownershipType: private | leasing | rental | company when stated.
- fuelType: GASOLINE, DIESEL, HYBRID, PLUG_IN_HYBRID, ELECTRIC, LPG, CNG, HYDROGEN or OTHER only when stated.
- engineDisplacementCc: integer cubic centimeters only when stated; 1.6L means 1600, 2.0 means 2000 in engine context.
- features: include only explicitly stated special equipment/drivetrain features and return canonical feature identifiers from the product vocabulary.
- Never infer equipment from make/model/trim knowledge.
- Return structured JSON only.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    make: JSON_SCHEMA_STATUS_FIELD,
    model: JSON_SCHEMA_STATUS_FIELD,
    trim: JSON_SCHEMA_STATUS_FIELD,
    year: JSON_SCHEMA_STATUS_FIELD,
    mileage: JSON_SCHEMA_STATUS_FIELD,
    color: JSON_SCHEMA_STATUS_FIELD,
    ownershipHand: JSON_SCHEMA_STATUS_FIELD,
    ownershipType: JSON_SCHEMA_STATUS_FIELD,
    retailPrice: JSON_SCHEMA_STATUS_FIELD,
    b2bPrice: JSON_SCHEMA_STATUS_FIELD,
    region: JSON_SCHEMA_STATUS_FIELD,
    fuelType: JSON_SCHEMA_STATUS_FIELD,
    engineDisplacementCc: JSON_SCHEMA_STATUS_FIELD,
    features: { type: "array", items: { type: "string" } },
    ambiguities: { type: "array", items: { type: "string" } },
    rawSummary: { type: "string" },
  },
  required: [
    "make", "model", "trim", "year", "mileage", "color", "ownershipHand", "ownershipType",
    "retailPrice", "b2bPrice", "region", "fuelType", "engineDisplacementCc", "features", "ambiguities", "rawSummary",
  ],
  additionalProperties: false,
} as const;

function unknownField() {
  return { value: null, status: "unknown" as const };
}

/**
 * AI-unavailable fallback intentionally does not parse natural language.
 * Raw input is retained so the workflow can ask again/retry instead of silently changing meaning.
 */
export function normalizeVehicleFallback(rawInput: string): NormalizedVehicle {
  return normalizedVehicleSchema.parse({
    make: unknownField(),
    model: unknownField(),
    trim: unknownField(),
    year: unknownField(),
    mileage: unknownField(),
    color: unknownField(),
    ownershipHand: unknownField(),
    ownershipType: unknownField(),
    retailPrice: unknownField(),
    b2bPrice: unknownField(),
    region: unknownField(),
    fuelType: unknownField(),
    engineDisplacementCc: unknownField(),
    features: [],
    ambiguities: ["נדרש AI כדי להבין ולנרמל את פרטי הרכב"],
    rawSummary: rawInput,
  });
}

function askingPriceField(parsed: NormalizedVehicle) {
  if (parsed.b2bPrice?.status === "known") return parsed.b2bPrice;
  if (parsed.retailPrice?.status === "known") return parsed.retailPrice;
  return parsed.b2bPrice ?? parsed.retailPrice ?? unknownField();
}

export async function normalizeVehicle(rawInput: string, userId?: string): Promise<NormalizedVehicle> {
  if (!isOpenAIConfigured()) return normalizeVehicleFallback(rawInput);

  try {
    const { data } = await callOpenAIStructured<NormalizedVehicle>({
      operation: "inventory_understanding",
      promptVersion: AI_PROMPT_VERSIONS.inventoryUnderstanding,
      model: AI_MODELS.inventoryUnderstanding,
      systemPrompt: SYSTEM_PROMPT,
      userContent: rawInput,
      schemaName: "normalized_vehicle",
      schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      userId,
    });

    const parsed = normalizedVehicleSchema.parse(data);
    const askingPrice = askingPriceField(parsed);
    return normalizedVehicleSchema.parse({
      ...parsed,
      // One product price; duplicate only for backwards-compatible persistence.
      b2bPrice: askingPrice,
      retailPrice: askingPrice,
      // Validation/de-duplication only. Semantic interpretation already happened in AI.
      features: canonicalizeVehicleFeatures(parsed.features ?? []),
    });
  } catch {
    return normalizeVehicleFallback(rawInput);
  }
}

export function normalizedToVehicleFields(normalized: NormalizedVehicle) {
  const price = extractKnownNumber(normalized.b2bPrice) ?? extractKnownNumber(normalized.retailPrice);
  return {
    make: extractKnownString(normalized.make),
    model: extractKnownString(normalized.model),
    trim: extractKnownString(normalized.trim),
    year: extractKnownNumber(normalized.year),
    mileage: extractKnownNumber(normalized.mileage),
    color: extractKnownString(normalized.color),
    ownershipHand: extractKnownNumber(normalized.ownershipHand),
    ownershipType: extractKnownString(normalized.ownershipType),
    retailPrice: price,
    b2bPrice: price,
    region: extractKnownString(normalized.region),
    fuelType: extractKnownString(normalized.fuelType),
    engineDisplacementCc: extractKnownNumber(normalized.engineDisplacementCc),
    features: canonicalizeVehicleFeatures(normalized.features ?? []),
    fieldProvenance: normalized,
  };
}

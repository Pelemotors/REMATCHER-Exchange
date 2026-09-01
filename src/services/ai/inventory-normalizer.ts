import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import {
  normalizedVehicleSchema,
  type NormalizedVehicle,
  extractKnownNumber,
  extractKnownString,
} from "@/lib/schemas/ai";
import { callOpenAIStructured, isOpenAIConfigured, logAiOperation } from "./client";
import { JSON_SCHEMA_STATUS_FIELD } from "./json-schemas";

const SYSTEM_PROMPT = `You normalize messy Hebrew/English vehicle inventory text into structured data.
Rules (CRITICAL):
- NEVER invent missing vehicle data (I-07). If a field is not in source, status must be "unknown".
- Do not guess trim, mileage, price, color from general knowledge.
- Year "22" = 2022. Prices in ILS.
- Mileage may appear as "62 אלף" = 62000.
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
    retailPrice: JSON_SCHEMA_STATUS_FIELD,
    b2bPrice: JSON_SCHEMA_STATUS_FIELD,
    region: JSON_SCHEMA_STATUS_FIELD,
    ambiguities: { type: "array", items: { type: "string" } },
    rawSummary: { type: "string" },
  },
  required: [
    "make",
    "model",
    "trim",
    "year",
    "mileage",
    "color",
    "ownershipHand",
    "retailPrice",
    "b2bPrice",
    "region",
    "ambiguities",
    "rawSummary",
  ],
  additionalProperties: false,
} as const;

export function normalizeVehicleFallback(rawInput: string): NormalizedVehicle {
  const result: NormalizedVehicle = {
    ambiguities: [],
    rawSummary: rawInput,
  };

  const priceMatch = rawInput.match(/(\d{5,7})/);
  if (priceMatch) {
    result.retailPrice = {
      value: parseInt(priceMatch[1], 10),
      status: "known",
    };
  }

  const kmMatch = rawInput.match(/(\d+)\s*(?:אלף|k|km)/i);
  if (kmMatch) {
    result.mileage = {
      value: parseInt(kmMatch[1], 10) * (rawInput.includes("אלף") ? 1000 : 1),
      status: "known",
    };
  }

  const yearMatch = rawInput.match(/\b(20\d{2}|'\d{2}|\b\d{2}\b)/);
  if (yearMatch) {
    let y = parseInt(yearMatch[1].replace("'", ""), 10);
    if (y < 100) y += 2000;
    result.year = { value: y, status: "known" };
  }

  return normalizedVehicleSchema.parse(result);
}

export async function normalizeVehicle(
  rawInput: string,
  userId?: string
): Promise<NormalizedVehicle> {
  if (!isOpenAIConfigured()) {
    return normalizeVehicleFallback(rawInput);
  }

  const { data } = await callOpenAIStructured<NormalizedVehicle>({
    operation: "inventory_normalize",
    promptVersion: AI_PROMPT_VERSIONS.inventoryNormalizer,
    model: AI_MODELS.inventoryNormalizer,
    systemPrompt: SYSTEM_PROMPT,
    userContent: rawInput,
    schemaName: "normalized_vehicle",
    schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    userId,
  });

  return normalizedVehicleSchema.parse(data);
}

export function normalizedToVehicleFields(normalized: NormalizedVehicle) {
  return {
    make: extractKnownString(normalized.make),
    model: extractKnownString(normalized.model),
    trim: extractKnownString(normalized.trim),
    year: extractKnownNumber(normalized.year),
    mileage: extractKnownNumber(normalized.mileage),
    color: extractKnownString(normalized.color),
    ownershipHand: extractKnownNumber(normalized.ownershipHand),
    retailPrice: extractKnownNumber(normalized.retailPrice),
    b2bPrice: extractKnownNumber(normalized.b2bPrice),
    region: extractKnownString(normalized.region),
    fieldProvenance: normalized,
  };
}

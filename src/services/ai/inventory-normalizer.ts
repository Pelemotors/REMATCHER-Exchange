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
import {
  applyShorthandToFields,
  assertNoInventedModel,
  parseDealerPriceFromText,
  parseMileageFromText,
  parseYearFromText,
  resolveVehicleShorthand,
} from "@/services/assistant/vehicle-shorthand";

const SYSTEM_PROMPT = `${INVENTORY_COMMERCIAL_PLAYBOOK}

You normalize messy Hebrew/English vehicle inventory text into structured data.
Rules (CRITICAL):
- NEVER invent missing vehicle data. If a field is not in source, status must be "unknown".
- Do not guess model from make alone (Toyota ≠ Corolla).
- HIGH-confidence nicknames OK: קורולה→Toyota Corolla, CX5→Mazda CX-5, ספורטאז→Kia Sportage.
- Year "22" = 2022. Prices in ILS.
- "62 אלף" = mileage 62000 when km context; "134 לסוחר" / "B2B 134" = b2bPrice 134000.
- ownershipType: private | leasing | rental | company when stated.
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
    "ownershipType",
    "retailPrice",
    "b2bPrice",
    "region",
    "ambiguities",
    "rawSummary",
  ],
  additionalProperties: false,
} as const;

function knownNum(n: number | null) {
  return n != null ? { value: n, status: "known" as const } : undefined;
}
function knownStr(s: string | null | undefined) {
  return s ? { value: s, status: "known" as const } : undefined;
}

export function normalizeVehicleFallback(rawInput: string): NormalizedVehicle {
  const shorthand = resolveVehicleShorthand(rawInput);
  const applied = applyShorthandToFields(rawInput, {
    make: shorthand?.make ?? null,
    model: shorthand?.model ?? null,
    year: parseYearFromText(rawInput),
    mileage: parseMileageFromText(rawInput),
    b2bPrice: parseDealerPriceFromText(rawInput),
  });

  // Safety: never invent Corolla from Toyota-only text
  let model = applied.model;
  if (model && !assertNoInventedModel(rawInput, model)) {
    model = null;
  }

  let ownershipType: string | undefined;
  if (/פרטי|פרטית/i.test(rawInput)) ownershipType = "private";
  else if (/ליסינג/i.test(rawInput)) ownershipType = "leasing";
  else if (/השכרה|רנט/i.test(rawInput)) ownershipType = "rental";
  else if (/חברה|צי/i.test(rawInput)) ownershipType = "company";

  const handMatch = rawInput.match(/יד\s*(\d)/i);
  const ownershipHand = handMatch ? parseInt(handMatch[1], 10) : null;

  // Retail only when not clearly dealer price and large number present
  let retailPrice: number | undefined;
  if (!applied.b2bPrice) {
    const priceMatch = rawInput.match(/\b(\d{5,7})\b/);
    if (priceMatch && !/לסוחר|b2b/i.test(rawInput)) {
      retailPrice = parseInt(priceMatch[1], 10);
    }
  }

  const result: NormalizedVehicle = {
    make: knownStr(applied.make),
    model: knownStr(model),
    year: knownNum(applied.year),
    mileage: knownNum(applied.mileage),
    b2bPrice: knownNum(applied.b2bPrice),
    retailPrice: knownNum(retailPrice ?? null),
    ownershipHand: knownNum(ownershipHand),
    ownershipType: knownStr(ownershipType),
    ambiguities: [],
    rawSummary: rawInput,
  };

  return normalizedVehicleSchema.parse(result);
}

export async function normalizeVehicle(
  rawInput: string,
  userId?: string
): Promise<NormalizedVehicle> {
  if (!isOpenAIConfigured()) {
    return normalizeVehicleFallback(rawInput);
  }

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
    // Post-guard: merge HIGH-confidence shorthand if AI left identity empty
    const fb = normalizeVehicleFallback(rawInput);
    const merge = (a?: { value?: unknown; status?: string }, b?: { value?: unknown; status?: string }) => {
      if (a?.status === "known") return a;
      if (b?.status === "known") return b;
      return a ?? b;
    };

    let model = merge(parsed.model, fb.model);
    const modelStr =
      model?.status === "known" && model.value != null ? String(model.value) : null;
    if (modelStr && !assertNoInventedModel(rawInput, modelStr)) {
      model = { value: null, status: "unknown" };
    }

    return normalizedVehicleSchema.parse({
      ...parsed,
      make: merge(parsed.make, fb.make),
      model,
      year: merge(parsed.year, fb.year),
      mileage: merge(parsed.mileage, fb.mileage),
      b2bPrice: merge(parsed.b2bPrice, fb.b2bPrice),
      ownershipType: merge(parsed.ownershipType, fb.ownershipType),
      ownershipHand: merge(parsed.ownershipHand, fb.ownershipHand),
    });
  } catch {
    return normalizeVehicleFallback(rawInput);
  }
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
    ownershipType: extractKnownString(normalized.ownershipType),
    retailPrice: extractKnownNumber(normalized.retailPrice),
    b2bPrice: extractKnownNumber(normalized.b2bPrice),
    region: extractKnownString(normalized.region),
    fieldProvenance: normalized,
  };
}

import "server-only";
import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import { callOpenAIStructured, isOpenAIConfigured } from "@/services/ai/client";
import {
  canonicalizeFuelType,
  canonicalizeOwnershipSource,
  canonicalizeVehicleIdentity,
  normalizeEngineDisplacementCc,
  type CanonicalFuelType,
  type CanonicalOwnershipSource,
} from "@/services/exchange/vehicle-identity";

export type ExchangeVehicleIdentity = {
  make: string | null;
  model: string | null;
  fuelType: CanonicalFuelType | null;
  engineDisplacementCc: number | null;
  ownershipHand: number | null;
  ownershipType: CanonicalOwnershipSource | null;
  source: "exchange_ai" | "unavailable";
  confidence: number;
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    canonicalMake: { type: ["string", "null"] },
    canonicalModel: { type: ["string", "null"] },
    fuelType: {
      type: ["string", "null"],
      enum: [
        "GASOLINE",
        "DIESEL",
        "HYBRID",
        "PLUG_IN_HYBRID",
        "ELECTRIC",
        "LPG",
        "CNG",
        "HYDROGEN",
        "OTHER",
        null,
      ],
    },
    engineDisplacementCc: { type: ["integer", "null"] },
    ownershipHand: { type: ["integer", "null"] },
    ownershipType: {
      type: ["string", "null"],
      enum: ["PRIVATE", "LEASING", "RENTAL", "COMPANY", "TRADE_IN", "OTHER", null],
    },
    confidence: { type: "number" },
  },
  required: [
    "canonicalMake",
    "canonicalModel",
    "fuelType",
    "engineDisplacementCc",
    "ownershipHand",
    "ownershipType",
    "confidence",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the authoritative vehicle-identity normalization brain of REMATCHER Exchange.
Application code must not interpret aliases, transliterations or natural-language vehicle meaning instead of you.
Normalize only facts supplied in the input; never invent a trim, engine, fuel type, ownership hand or ownership source.
Resolve Hebrew, English, spelling variants, abbreviations and transliteration into canonical values.
Examples: יונדאי/Hyundai -> Hyundai; אקסנט/Accent -> Accent; סקודה/Skoda -> Skoda; סופרב/Superb -> Superb.
Return canonical international make/model names.
Normalize fuel to one of GASOLINE, DIESEL, HYBRID, PLUG_IN_HYBRID, ELECTRIC, LPG, CNG, HYDROGEN, OTHER.
Engine displacement must be integer cc (1.6L -> 1600) only if explicitly present.
Ownership source must be PRIVATE, LEASING, RENTAL, COMPANY, TRADE_IN or OTHER only when explicitly stated.
Ownership hand must be an integer only when explicitly stated (יד 2 -> 2).
If a value cannot be resolved confidently, return null rather than guessing.
Return structured JSON only.`;

function rawTextValue(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function exactCanonicalFuel(value: unknown): CanonicalFuelType | null {
  const text = rawTextValue(value)?.toUpperCase() ?? null;
  if (!text) return null;
  const canonical = canonicalizeFuelType(text);
  return canonical === text ? canonical : null;
}

function exactCanonicalOwnership(value: unknown): CanonicalOwnershipSource | null {
  const text = rawTextValue(value)?.toUpperCase() ?? null;
  if (!text) return null;
  const canonical = canonicalizeOwnershipSource(text);
  return canonical === text ? canonical : null;
}

function exactHand(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= 9 ? value : null;
}

function exactEngineCc(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n >= 300 && n <= 10000 ? n : null;
}

function unavailableResult(input: {
  make?: string | null;
  model?: string | null;
  fuelType?: string | null;
  engineDisplacementCc?: number | string | null;
  ownershipHand?: number | string | null;
  ownershipType?: string | null;
}): ExchangeVehicleIdentity {
  // No semantic alias resolution here. We only preserve literal text and values
  // that are already in exact canonical form. This prevents a hidden
  // deterministic normalizer from becoming the authority when AI is unavailable.
  return {
    make: rawTextValue(input.make),
    model: rawTextValue(input.model),
    fuelType: exactCanonicalFuel(input.fuelType),
    engineDisplacementCc: exactEngineCc(input.engineDisplacementCc),
    ownershipHand: exactHand(input.ownershipHand),
    ownershipType: exactCanonicalOwnership(input.ownershipType),
    source: "unavailable",
    confidence: 0,
  };
}

export async function resolveVehicleThroughExchangeBrain(input: {
  make?: string | null;
  model?: string | null;
  fuelType?: string | null;
  engineDisplacementCc?: number | string | null;
  ownershipHand?: number | string | null;
  ownershipType?: string | null;
  rawText?: string | null;
  userId?: string;
}): Promise<ExchangeVehicleIdentity> {
  const hasInput = Boolean(
    rawTextValue(input.make) ||
    rawTextValue(input.model) ||
    rawTextValue(input.fuelType) ||
    rawTextValue(input.engineDisplacementCc) ||
    rawTextValue(input.ownershipHand) ||
    rawTextValue(input.ownershipType) ||
    rawTextValue(input.rawText)
  );

  if (!hasInput || !isOpenAIConfigured()) return unavailableResult(input);

  try {
    const { data } = await callOpenAIStructured<{
      canonicalMake: string | null;
      canonicalModel: string | null;
      fuelType: CanonicalFuelType | null;
      engineDisplacementCc: number | null;
      ownershipHand: number | null;
      ownershipType: CanonicalOwnershipSource | null;
      confidence: number;
    }>({
      operation: "exchange_vehicle_identity",
      promptVersion: AI_PROMPT_VERSIONS.inventoryUnderstanding,
      model: AI_MODELS.inventoryUnderstanding,
      systemPrompt: SYSTEM_PROMPT,
      userContent: JSON.stringify({
        make: input.make,
        model: input.model,
        fuelType: input.fuelType,
        engineDisplacementCc: input.engineDisplacementCc,
        ownershipHand: input.ownershipHand,
        ownershipType: input.ownershipType,
        rawText: input.rawText,
      }),
      schemaName: "exchange_vehicle_identity",
      schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      userId: input.userId,
    });

    // Deterministic code below validates canonical AI output only. It does not
    // inspect the user's original language to decide semantic meaning.
    const identity = canonicalizeVehicleIdentity({
      make: data.canonicalMake,
      model: data.canonicalModel,
    });
    return {
      make: identity.make,
      model: identity.model,
      fuelType: canonicalizeFuelType(data.fuelType),
      engineDisplacementCc: normalizeEngineDisplacementCc(data.engineDisplacementCc),
      ownershipHand: exactHand(data.ownershipHand),
      ownershipType: canonicalizeOwnershipSource(data.ownershipType),
      source: "exchange_ai",
      confidence: Math.max(0, Math.min(1, data.confidence ?? 0.8)),
    };
  } catch {
    return unavailableResult(input);
  }
}

import "server-only";
import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import { callOpenAIStructured, isOpenAIConfigured } from "@/services/ai/client";
import {
  canonicalizeFuelType,
  canonicalizeVehicleIdentity,
  normalizeEngineDisplacementCc,
  type CanonicalFuelType,
} from "@/services/exchange/vehicle-identity";

export type ExchangeVehicleIdentity = {
  make: string | null;
  model: string | null;
  fuelType: CanonicalFuelType | null;
  engineDisplacementCc: number | null;
  source: "deterministic" | "exchange_ai";
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
    confidence: { type: "number" },
  },
  required: [
    "canonicalMake",
    "canonicalModel",
    "fuelType",
    "engineDisplacementCc",
    "confidence",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the central vehicle-identity brain of REMATCHER Exchange.
Normalize only facts supplied in the input; do not invent a trim, engine or fuel type.
Your job is identity resolution across Hebrew, English, spelling variants and transliteration.
Examples: יונדאי/Hyundai -> Hyundai; אקסנט/Accent -> Accent; סקודה/Skoda -> Skoda; סופרב/Superb -> Superb.
Return canonical international make/model names. Normalize fuel to one of GASOLINE, DIESEL, HYBRID, PLUG_IN_HYBRID, ELECTRIC, LPG, CNG, HYDROGEN, OTHER.
Engine displacement must be integer cc (1.6L -> 1600) only if explicitly present.
If a value cannot be resolved confidently, return null rather than guessing.`;

function containsHebrewOrUnresolved(value: string | null | undefined): boolean {
  return Boolean(value && /[\u0590-\u05ff]/.test(value));
}

export async function resolveVehicleThroughExchangeBrain(input: {
  make?: string | null;
  model?: string | null;
  fuelType?: string | null;
  engineDisplacementCc?: number | string | null;
  rawText?: string | null;
  userId?: string;
}): Promise<ExchangeVehicleIdentity> {
  const deterministic = canonicalizeVehicleIdentity({
    make: input.make,
    model: input.model,
  });
  const fuelType = canonicalizeFuelType(input.fuelType);
  const engineDisplacementCc = normalizeEngineDisplacementCc(
    input.engineDisplacementCc
  );

  const needsAi =
    containsHebrewOrUnresolved(deterministic.make) ||
    containsHebrewOrUnresolved(deterministic.model) ||
    (Boolean(input.rawText) && (!deterministic.make || !deterministic.model));

  if (!needsAi || !isOpenAIConfigured()) {
    return {
      make: deterministic.make,
      model: deterministic.model,
      fuelType,
      engineDisplacementCc,
      source: "deterministic",
      confidence: needsAi ? 0.65 : 0.98,
    };
  }

  try {
    const { data } = await callOpenAIStructured<{
      canonicalMake: string | null;
      canonicalModel: string | null;
      fuelType: CanonicalFuelType | null;
      engineDisplacementCc: number | null;
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
        rawText: input.rawText,
      }),
      schemaName: "exchange_vehicle_identity",
      schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      userId: input.userId,
    });

    const aiCanonical = canonicalizeVehicleIdentity({
      make: data.canonicalMake ?? deterministic.make,
      model: data.canonicalModel ?? deterministic.model,
    });
    return {
      make: aiCanonical.make,
      model: aiCanonical.model,
      fuelType: data.fuelType ?? fuelType,
      engineDisplacementCc:
        normalizeEngineDisplacementCc(data.engineDisplacementCc) ??
        engineDisplacementCc,
      source: "exchange_ai",
      confidence: Math.max(0, Math.min(1, data.confidence ?? 0.8)),
    };
  } catch {
    return {
      make: deterministic.make,
      model: deterministic.model,
      fuelType,
      engineDisplacementCc,
      source: "deterministic",
      confidence: 0.65,
    };
  }
}

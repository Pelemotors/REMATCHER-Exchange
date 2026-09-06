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
import {
  getApprovedCanonicalAliasContextForUser,
  recordCanonicalAliasForUser,
} from "@/services/exchange/canonical-learning-registry";

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
    fuelType: { type: ["string", "null"], enum: ["GASOLINE","DIESEL","HYBRID","PLUG_IN_HYBRID","ELECTRIC","LPG","CNG","HYDROGEN","OTHER",null] },
    engineDisplacementCc: { type: ["integer", "null"] },
    ownershipHand: { type: ["integer", "null"] },
    ownershipType: { type: ["string", "null"], enum: ["PRIVATE","LEASING","RENTAL","COMPANY","TRADE_IN","OTHER",null] },
    confidence: { type: "number" },
  },
  required: ["canonicalMake","canonicalModel","fuelType","engineDisplacementCc","ownershipHand","ownershipType","confidence"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the authoritative vehicle-identity normalization brain of REMATCHER Exchange.
Application code must not interpret aliases, transliterations or natural-language vehicle meaning instead of you.
Normalize only facts supplied in the input; never invent a trim, engine, fuel type, ownership hand or ownership source.
Resolve Hebrew, English, spelling variants, abbreviations and transliteration into canonical values.
Return canonical international make/model names.
Normalize fuel to GASOLINE, DIESEL, HYBRID, PLUG_IN_HYBRID, ELECTRIC, LPG, CNG, HYDROGEN or OTHER.
Engine displacement must be integer cc only if explicitly present.
Ownership source must be PRIVATE, LEASING, RENTAL, COMPANY, TRADE_IN or OTHER only when explicitly stated.
Ownership hand must be an integer only when explicitly stated.
Approved dealer-specific alias memories may be supplied as context. They are hints for YOU, not deterministic application rules; ignore them if they conflict with the current source text.
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
  make?: string | null; model?: string | null; fuelType?: string | null;
  engineDisplacementCc?: number | string | null; ownershipHand?: number | string | null; ownershipType?: string | null;
}): ExchangeVehicleIdentity {
  return {
    make: rawTextValue(input.make), model: rawTextValue(input.model),
    fuelType: exactCanonicalFuel(input.fuelType), engineDisplacementCc: exactEngineCc(input.engineDisplacementCc),
    ownershipHand: exactHand(input.ownershipHand), ownershipType: exactCanonicalOwnership(input.ownershipType),
    source: "unavailable", confidence: 0,
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
  const hasInput = Boolean(rawTextValue(input.make)||rawTextValue(input.model)||rawTextValue(input.fuelType)||rawTextValue(input.engineDisplacementCc)||rawTextValue(input.ownershipHand)||rawTextValue(input.ownershipType)||rawTextValue(input.rawText));
  if (!hasInput || !isOpenAIConfigured()) return unavailableResult(input);

  try {
    const approvedAliases = await getApprovedCanonicalAliasContextForUser({ userId: input.userId, limit: 30 }).catch(() => [] as string[]);
    const { data } = await callOpenAIStructured<{
      canonicalMake: string | null; canonicalModel: string | null; fuelType: CanonicalFuelType | null;
      engineDisplacementCc: number | null; ownershipHand: number | null; ownershipType: CanonicalOwnershipSource | null; confidence: number;
    }>({
      operation: "exchange_vehicle_identity",
      promptVersion: AI_PROMPT_VERSIONS.inventoryUnderstanding,
      model: AI_MODELS.inventoryUnderstanding,
      systemPrompt: SYSTEM_PROMPT,
      userContent: JSON.stringify({
        source: { make: input.make, model: input.model, fuelType: input.fuelType, engineDisplacementCc: input.engineDisplacementCc, ownershipHand: input.ownershipHand, ownershipType: input.ownershipType, rawText: input.rawText },
        approvedDealerAliasContext: approvedAliases,
      }),
      schemaName: "exchange_vehicle_identity",
      schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      userId: input.userId,
    });

    const identity = canonicalizeVehicleIdentity({ make: data.canonicalMake, model: data.canonicalModel });
    const result: ExchangeVehicleIdentity = {
      make: identity.make,
      model: identity.model,
      fuelType: canonicalizeFuelType(data.fuelType),
      engineDisplacementCc: normalizeEngineDisplacementCc(data.engineDisplacementCc),
      ownershipHand: exactHand(data.ownershipHand),
      ownershipType: canonicalizeOwnershipSource(data.ownershipType),
      source: "exchange_ai",
      confidence: Math.max(0, Math.min(1, data.confidence ?? 0.8)),
    };

    // Evidence collection is best-effort and never blocks the dealer workflow.
    void Promise.allSettled([
      recordCanonicalAliasForUser({ userId: input.userId, dimension: "make", rawValue: input.make, canonicalValue: result.make, confidence: result.confidence }),
      recordCanonicalAliasForUser({ userId: input.userId, dimension: "model", rawValue: input.model, canonicalValue: result.model, confidence: result.confidence }),
      recordCanonicalAliasForUser({ userId: input.userId, dimension: "fuelType", rawValue: input.fuelType, canonicalValue: result.fuelType, confidence: result.confidence }),
      recordCanonicalAliasForUser({ userId: input.userId, dimension: "engineDisplacementCc", rawValue: input.engineDisplacementCc, canonicalValue: result.engineDisplacementCc, confidence: result.confidence }),
      recordCanonicalAliasForUser({ userId: input.userId, dimension: "ownershipHand", rawValue: input.ownershipHand, canonicalValue: result.ownershipHand, confidence: result.confidence }),
      recordCanonicalAliasForUser({ userId: input.userId, dimension: "ownershipType", rawValue: input.ownershipType, canonicalValue: result.ownershipType, confidence: result.confidence }),
    ]).catch(() => undefined);

    return result;
  } catch {
    return unavailableResult(input);
  }
}

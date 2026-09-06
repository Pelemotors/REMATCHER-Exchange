import "server-only";
import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import { callOpenAIStructured, isOpenAIConfigured } from "@/services/ai/client";
import {
  CANONICAL_VEHICLE_FEATURES,
  canonicalizeVehicleFeatures,
  type CanonicalVehicleFeature,
} from "@/services/exchange/vehicle-features";
import {
  getApprovedCanonicalAliasContextForUser,
  recordCanonicalAliasForUser,
} from "@/services/exchange/canonical-learning-registry";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    features: { type: "array", items: { type: "string", enum: [...CANONICAL_VEHICLE_FEATURES] } },
    absentFeatures: { type: "array", items: { type: "string", enum: [...CANONICAL_VEHICLE_FEATURES] } },
    unresolved: { type: "array", items: { type: "string" } },
  },
  required: ["features", "absentFeatures", "unresolved"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the authoritative vehicle-feature normalization brain of REMATCHER Exchange.
Application code must not infer feature aliases instead of you.
Return only facts explicitly stated in source text. Never infer equipment from make, model, trim or general vehicle knowledge.
- features: explicitly PRESENT / INCLUDED / REQUIRED.
- absentFeatures: explicitly NOT PRESENT / WITHOUT / DOES NOT HAVE.
- Never put the same canonical feature in both arrays.
Canonical feature vocabulary:
${CANONICAL_VEHICLE_FEATURES.join(", ")}
Approved dealer-specific feature aliases may be supplied as context. They are hints for YOU only and never deterministic application rules; current source text always wins.
Examples: 4x4/4WD/AWD/הנעה כפולה -> AWD_4X4; חלון בגג -> SUNROOF; גג פנורמי -> PANORAMIC_ROOF; אין גג פנורמי -> absent PANORAMIC_ROOF; לא 4x4 -> absent AWD_4X4; Matrix LED -> MATRIX_LED; מתלי אוויר -> AIR_SUSPENSION; דלת תא מטען חשמלית -> POWER_TAILGATE.
For a buyer request such as "חייב 4x4", the feature belongs in features because it is explicitly required. Absence is only when text says the vehicle does NOT have it.
If wording is unclear or outside canonical vocabulary, return original phrase in unresolved rather than guessing.
Return structured JSON only.`;

export async function normalizeVehicleFeaturesWithAi(params: { rawText: string; userId?: string }): Promise<{
  features: CanonicalVehicleFeature[];
  absentFeatures: CanonicalVehicleFeature[];
  unresolved: string[];
  source: "exchange_ai" | "unavailable";
}> {
  const rawText = params.rawText.trim();
  if (!rawText) return { features: [], absentFeatures: [], unresolved: [], source: "unavailable" };
  if (!isOpenAIConfigured()) return { features: [], absentFeatures: [], unresolved: [rawText], source: "unavailable" };

  try {
    const approvedAliases = await getApprovedCanonicalAliasContextForUser({ userId: params.userId, dimension: "feature", limit: 30 }).catch(() => [] as string[]);
    const { data } = await callOpenAIStructured<{ features: string[]; absentFeatures: string[]; unresolved: string[] }>({
      operation: "exchange_vehicle_features",
      promptVersion: AI_PROMPT_VERSIONS.inventoryUnderstanding,
      model: AI_MODELS.inventoryUnderstanding,
      systemPrompt: SYSTEM_PROMPT,
      userContent: JSON.stringify({ sourceText: rawText, approvedDealerAliasContext: approvedAliases }),
      schemaName: "exchange_vehicle_features",
      schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      userId: params.userId,
    });

    const features = canonicalizeVehicleFeatures(data.features ?? []);
    const present = new Set(features);
    const absentFeatures = canonicalizeVehicleFeatures(data.absentFeatures ?? []).filter((feature) => !present.has(feature));
    const unresolved = Array.isArray(data.unresolved) ? data.unresolved.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];

    // Only record a raw-text alias when AI resolved exactly one canonical feature and no ambiguity remains.
    const uniqueResolved = [...new Set([...features, ...absentFeatures])];
    if (uniqueResolved.length === 1 && unresolved.length === 0) {
      void recordCanonicalAliasForUser({ userId: params.userId, dimension: "feature", rawValue: rawText, canonicalValue: uniqueResolved[0], confidence: 0.85 }).catch(() => undefined);
    }

    return { features, absentFeatures, unresolved, source: "exchange_ai" };
  } catch {
    return { features: [], absentFeatures: [], unresolved: [rawText], source: "unavailable" };
  }
}

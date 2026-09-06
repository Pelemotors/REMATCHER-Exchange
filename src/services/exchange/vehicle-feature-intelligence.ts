import "server-only";
import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import { callOpenAIStructured, isOpenAIConfigured } from "@/services/ai/client";
import {
  CANONICAL_VEHICLE_FEATURES,
  canonicalizeVehicleFeatures,
  type CanonicalVehicleFeature,
} from "@/services/exchange/vehicle-features";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    features: {
      type: "array",
      items: { type: "string", enum: [...CANONICAL_VEHICLE_FEATURES] },
    },
    absentFeatures: {
      type: "array",
      items: { type: "string", enum: [...CANONICAL_VEHICLE_FEATURES] },
    },
    unresolved: { type: "array", items: { type: "string" } },
  },
  required: ["features", "absentFeatures", "unresolved"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the authoritative vehicle-feature normalization brain of REMATCHER Exchange.
Your job is semantic normalization. Application code must not infer aliases instead of you.

Return only facts explicitly stated in the source text. Never infer equipment from make, model, trim or general vehicle knowledge.
- features: features explicitly stated as PRESENT / INCLUDED / REQUIRED.
- absentFeatures: features explicitly stated as NOT PRESENT / WITHOUT / DOES NOT HAVE.
- Never put the same canonical feature in both arrays.
Canonical feature vocabulary:
${CANONICAL_VEHICLE_FEATURES.join(", ")}

Semantic examples:
- 4x4 / 4WD / AWD / הנעה כפולה / ארבע על ארבע -> AWD_4X4
- חלון בגג / גג שמש / sunroof -> SUNROOF
- גג פנורמי / panoramic roof -> PANORAMIC_ROOF
- "אין גג פנורמי" / "without panoramic roof" -> absentFeatures: PANORAMIC_ROOF
- "לא 4x4" / "2WD, not AWD" -> absentFeatures: AWD_4X4
- מושבי עור / leather seats -> LEATHER_SEATS
- מצלמות 360 / 360 camera -> SURROUND_CAMERA

For a buyer request such as "חייב 4x4", the requested feature belongs in features because it is explicitly required by the text; absence is only for explicit statements that the vehicle does NOT have the feature.
If wording is unclear or not in the canonical vocabulary, put the original phrase in unresolved rather than guessing.
Return structured JSON only.`;

export async function normalizeVehicleFeaturesWithAi(params: {
  rawText: string;
  userId?: string;
}): Promise<{
  features: CanonicalVehicleFeature[];
  absentFeatures: CanonicalVehicleFeature[];
  unresolved: string[];
  source: "exchange_ai" | "unavailable";
}> {
  const rawText = params.rawText.trim();
  if (!rawText) return { features: [], absentFeatures: [], unresolved: [], source: "unavailable" };

  // AI owns semantic normalization. When unavailable, we intentionally do NOT
  // replace it with an alias dictionary that can silently change meaning.
  if (!isOpenAIConfigured()) {
    return { features: [], absentFeatures: [], unresolved: [rawText], source: "unavailable" };
  }

  try {
    const { data } = await callOpenAIStructured<{
      features: string[];
      absentFeatures: string[];
      unresolved: string[];
    }>({
      operation: "exchange_vehicle_features",
      promptVersion: AI_PROMPT_VERSIONS.inventoryUnderstanding,
      model: AI_MODELS.inventoryUnderstanding,
      systemPrompt: SYSTEM_PROMPT,
      userContent: rawText,
      schemaName: "exchange_vehicle_features",
      schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      userId: params.userId,
    });

    const features = canonicalizeVehicleFeatures(data.features ?? []);
    const present = new Set(features);
    const absentFeatures = canonicalizeVehicleFeatures(data.absentFeatures ?? []).filter(
      (feature) => !present.has(feature)
    );

    return {
      // deterministic code validates/dedupes canonical AI output only;
      // it does not interpret aliases or source-language meaning.
      features,
      absentFeatures,
      unresolved: Array.isArray(data.unresolved)
        ? data.unresolved.filter((v): v is string => typeof v === "string" && !!v.trim())
        : [],
      source: "exchange_ai",
    };
  } catch {
    return { features: [], absentFeatures: [], unresolved: [rawText], source: "unavailable" };
  }
}

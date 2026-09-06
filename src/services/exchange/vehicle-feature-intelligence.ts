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
    unresolved: { type: "array", items: { type: "string" } },
  },
  required: ["features", "unresolved"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the authoritative vehicle-feature normalization brain of REMATCHER Exchange.
Your job is semantic normalization. Application code must not infer aliases instead of you.

Return only features explicitly present or explicitly requested in the source text. Never infer equipment from make, model, trim or general vehicle knowledge.
Canonical feature vocabulary:
${CANONICAL_VEHICLE_FEATURES.join(", ")}

Semantic examples:
- 4x4 / 4WD / AWD / הנעה כפולה / ארבע על ארבע -> AWD_4X4
- חלון בגג / גג שמש / sunroof -> SUNROOF
- גג פנורמי / panoramic roof -> PANORAMIC_ROOF
- if PANORAMIC_ROOF is explicitly stated, you may also return SUNROOF only when that is semantically true for the wording; do not invent.
- מושבי עור / leather seats -> LEATHER_SEATS
- מצלמות 360 / 360 camera -> SURROUND_CAMERA

If wording is unclear or not in the canonical vocabulary, put the original phrase in unresolved rather than guessing.
Return structured JSON only.`;

export async function normalizeVehicleFeaturesWithAi(params: {
  rawText: string;
  userId?: string;
}): Promise<{ features: CanonicalVehicleFeature[]; unresolved: string[]; source: "exchange_ai" | "unavailable" }> {
  const rawText = params.rawText.trim();
  if (!rawText) return { features: [], unresolved: [], source: "unavailable" };

  // AI owns semantic normalization. When unavailable, we intentionally do NOT
  // replace it with an alias dictionary that can silently change meaning.
  if (!isOpenAIConfigured()) {
    return { features: [], unresolved: [rawText], source: "unavailable" };
  }

  try {
    const { data } = await callOpenAIStructured<{
      features: string[];
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

    return {
      // deterministic code validates/dedupes canonical AI output only;
      // it does not interpret aliases or source-language meaning.
      features: canonicalizeVehicleFeatures(data.features ?? []),
      unresolved: Array.isArray(data.unresolved)
        ? data.unresolved.filter((v): v is string => typeof v === "string" && !!v.trim())
        : [],
      source: "exchange_ai",
    };
  } catch {
    return { features: [], unresolved: [rawText], source: "unavailable" };
  }
}

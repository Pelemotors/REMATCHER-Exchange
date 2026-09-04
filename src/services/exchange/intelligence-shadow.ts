/**
 * Exchange Intelligence — SHADOW MODE only.
 * Does not change Match visibility. Stores comparison for learning.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import {
  AI_MODELS,
  AI_PROMPT_VERSIONS,
} from "@/config/product";
import {
  getOpenAIClient,
  isOpenAIConfigured,
  logAiOperation,
} from "@/services/ai/client";
import { toPrismaJson } from "@/lib/prisma-json";
import type { MatchEvaluationV2 } from "@/services/matching/engine-v2";
import {
  privacySafeLearningProjection,
  retrieveRelevantLearnings,
} from "@/services/exchange/learning";
import { retrieveRelevantCases } from "@/services/exchange/cases";
import type { StructuredSearchIntent } from "@/services/matching/search-intent-types";

export const EXCHANGE_INTELLIGENCE_PROMPT_VERSION =
  "exchange-intelligence-shadow-v1";

const EXCHANGE_INTELLIGENCE_CONSTITUTION = `You are REMATCHER Exchange Intelligence — neutral matching intelligence in SHADOW MODE.
You do not represent buyer, seller, or REMATCHER deal-closing interest.
Goal: assess whether commercial overlap is real enough for a relevant opportunity.
Never invent inventory/demand. Never override Hard Constraints. Never use private dealer identity/PII.
Never use Dealer Memory. Treat learnings as hypotheses with uncertainty, not facts.
Output JSON only.`;

export type IntelligenceShadowDecision = {
  decision: "STRONG" | "GOOD" | "ALTERNATIVE" | "NO_MATCH";
  commercialRationale: string;
  keyFits: string[];
  keyTensions: string[];
  relevantHistoricalSignals: string[];
  uncertainties: string[];
  confidence: number;
  modelVersion: string;
  promptVersion: string;
};

function privacySafeVehicle(vehicle: {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  mileage?: number | null;
  color?: string | null;
  trim?: string | null;
  b2bPrice?: number | null;
  retailPrice?: number | null;
  region?: string | null;
}) {
  return {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    mileage: vehicle.mileage,
    color: vehicle.color,
    trim: vehicle.trim,
    price: vehicle.b2bPrice ?? vehicle.retailPrice,
    region: vehicle.region,
  };
}

export async function runExchangeIntelligenceShadow(params: {
  candidateMatchId: string;
  intent: StructuredSearchIntent;
  engine: MatchEvaluationV2;
  vehicle: {
    make?: string | null;
    model?: string | null;
    year?: number | null;
    mileage?: number | null;
    color?: string | null;
    trim?: string | null;
    b2bPrice?: number | null;
    retailPrice?: number | null;
    region?: string | null;
  };
}): Promise<IntelligenceShadowDecision | null> {
  if (!isOpenAIConfigured()) return null;

  const learnings = await retrieveRelevantLearnings({
    make: params.vehicle.make,
    model: params.vehicle.model,
    limit: 4,
  });
  const safeLearnings = learnings.map(privacySafeLearningProjection);
  const safeCases = await retrieveRelevantCases({
    make: params.vehicle.make,
    model: params.vehicle.model,
    limit: 4,
  });

  const model = AI_MODELS.agentLoop;
  const openai = getOpenAIClient();
  const started = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXCHANGE_INTELLIGENCE_CONSTITUTION },
        {
          role: "user",
          content: JSON.stringify({
            searchIntent: params.intent,
            deterministicEngine: {
              band: params.engine.band,
              score: params.engine.score,
              fits: params.engine.fits,
              compromises: params.engine.compromises,
              unknowns: params.engine.unknowns,
              hardChecks: params.engine.hardChecks,
            },
            vehicle: privacySafeVehicle(params.vehicle),
            exchangeLearnings: safeLearnings,
            exchangeCases: safeCases,
            requiredOutput: {
              decision: "STRONG|GOOD|ALTERNATIVE|NO_MATCH",
              commercialRationale: "string",
              keyFits: [],
              keyTensions: [],
              relevantHistoricalSignals: [],
              uncertainties: [],
              confidence: 0.0,
            },
          }),
        },
      ],
    });

    await logAiOperation({
      operation: "exchange_intelligence_shadow",
      model,
      promptVersion: EXCHANGE_INTELLIGENCE_PROMPT_VERSION,
      success: true,
      latencyMs: Date.now() - started,
      usageJson: completion.usage ?? {},
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<IntelligenceShadowDecision>;
    const decision: IntelligenceShadowDecision = {
      decision:
        parsed.decision === "STRONG" ||
        parsed.decision === "GOOD" ||
        parsed.decision === "ALTERNATIVE" ||
        parsed.decision === "NO_MATCH"
          ? parsed.decision
          : params.engine.band ?? "ALTERNATIVE",
      commercialRationale: String(parsed.commercialRationale ?? "").slice(0, 800),
      keyFits: Array.isArray(parsed.keyFits)
        ? parsed.keyFits.map(String).slice(0, 8)
        : [],
      keyTensions: Array.isArray(parsed.keyTensions)
        ? parsed.keyTensions.map(String).slice(0, 8)
        : [],
      relevantHistoricalSignals: Array.isArray(parsed.relevantHistoricalSignals)
        ? parsed.relevantHistoricalSignals.map(String).slice(0, 8)
        : [],
      uncertainties: Array.isArray(parsed.uncertainties)
        ? parsed.uncertainties.map(String).slice(0, 8)
        : [],
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.4,
      modelVersion: model,
      promptVersion: EXCHANGE_INTELLIGENCE_PROMPT_VERSION,
    };

    await prisma.matchDecisionComparison.create({
      data: {
        candidateMatchId: params.candidateMatchId,
        engineBand: params.engine.band ?? "NEEDS_INFORMATION",
        engineScore: params.engine.score,
        intelligenceDecision: toPrismaJson(decision),
        intelligenceBand: decision.decision,
        intelligenceConfidence: decision.confidence,
        modelVersion: decision.modelVersion,
        promptVersion: decision.promptVersion,
      },
    });

    await prisma.candidateMatch.update({
      where: { id: params.candidateMatchId },
      data: { intelligenceShadowJson: toPrismaJson(decision) },
    });

    return decision;
  } catch {
    await logAiOperation({
      operation: "exchange_intelligence_shadow",
      model,
      promptVersion: EXCHANGE_INTELLIGENCE_PROMPT_VERSION,
      success: false,
      latencyMs: Date.now() - started,
      errorMessage: "shadow_failed",
    });
    return null;
  }
}

// silence unused import if tree-shaken
void AI_PROMPT_VERSIONS;

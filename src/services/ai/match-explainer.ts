import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import {
  matchExplanationSchema,
  type MatchEvaluation,
  type MatchExplanation,
} from "@/lib/schemas/ai";
import { callOpenAIStructured, isOpenAIConfigured } from "./client";

const SYSTEM_PROMPT = `You write concise Hebrew explanations for vehicle match results in a B2B dealer exchange.
Rules:
- You receive a PRE-DETERMINED match evaluation from our engine. You do NOT decide if it's a match.
- Use headline exactly as provided in evaluation band.
- Be neutral about price gaps — never say seller is flexible or buyer can pay more (I-10, I-20).
- No dealer identity, no private data, no manipulation.
- Keep it short and scannable.`;

function buildFallbackExplanation(evaluation: MatchEvaluation): MatchExplanation {
  const headline =
    evaluation.overallBand === "STRONG"
      ? "התאמה גבוהה"
      : evaluation.overallBand === "ALTERNATIVE"
        ? "התאמה טובה עם פער"
        : "לא רלוונטי";

  return {
    headline,
    summary:
      evaluation.gaps.length > 0
        ? `הרכב מתאים ברוב הפרמטרים. ${evaluation.gaps[0]}`
        : "הרכב מתאים לדרישות החיפוש.",
    fits: evaluation.fits,
    gaps: evaluation.gaps,
  };
}

export async function explainMatch(
  evaluation: MatchEvaluation,
  userId?: string
): Promise<MatchExplanation> {
  const headline =
    evaluation.overallBand === "STRONG"
      ? "התאמה גבוהה"
      : evaluation.overallBand === "ALTERNATIVE"
        ? "התאמה טובה עם פער"
        : "לא רלוונטי";

  if (!isOpenAIConfigured()) {
    return buildFallbackExplanation(evaluation);
  }

  const userContent = JSON.stringify({
    headline,
    scoreBand: evaluation.overallBand,
    fits: evaluation.fits,
    gaps: evaluation.gaps,
    fieldResults: evaluation.fieldResults.map((f) => ({
      field: f.field,
      result: f.result,
      label: f.label,
    })),
  });

  try {
    const { data } = await callOpenAIStructured<MatchExplanation>({
      operation: "match_explain",
      promptVersion: AI_PROMPT_VERSIONS.matchExplainer,
      model: AI_MODELS.matchExplainer,
      systemPrompt: SYSTEM_PROMPT,
      userContent,
      schemaName: "match_explanation",
      schema: {
        type: "object",
        properties: {
          headline: {
            type: "string",
            enum: ["התאמה גבוהה", "התאמה טובה עם פער", "לא רלוונטי"],
          },
          summary: { type: "string" },
          fits: { type: "array", items: { type: "string" } },
          gaps: { type: "array", items: { type: "string" } },
        },
        required: ["headline", "summary", "fits", "gaps"],
        additionalProperties: false,
      },
      userId,
    });

    return matchExplanationSchema.parse(data);
  } catch {
    return buildFallbackExplanation(evaluation);
  }
}

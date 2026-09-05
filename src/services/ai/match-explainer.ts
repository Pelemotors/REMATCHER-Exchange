import type {
  MatchEvaluation,
  MatchExplanation,
} from "@/lib/schemas/ai";

/**
 * Matching explanations are deterministic in the hot path.
 * The LLM never decides eligibility and no network round-trip is allowed to
 * block create/update/import matching during the pilot.
 */
function buildDeterministicExplanation(
  evaluation: MatchEvaluation
): MatchExplanation {
  const headline =
    evaluation.overallBand === "STRONG"
      ? "התאמה גבוהה"
      : evaluation.overallBand === "ALTERNATIVE"
        ? "התאמה טובה עם פער"
        : evaluation.overallBand === "GOOD"
          ? "התאמה גבוהה"
          : "לא רלוונטי";

  return {
    headline,
    summary:
      evaluation.gaps.length > 0
        ? `הרכב מתאים ברוב הפרמטרים. ${evaluation.gaps[0]}`
        : "הרכב מתאים לתנאי החיפוש.",
    fits: evaluation.fits,
    gaps: evaluation.gaps,
  };
}

export async function explainMatch(
  evaluation: MatchEvaluation,
  _userId?: string
): Promise<MatchExplanation> {
  return buildDeterministicExplanation(evaluation);
}

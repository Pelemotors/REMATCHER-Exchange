/**
 * Controlled Live Exchange Intelligence — ranking assist only.
 * Deterministic Hard Gates remain authority; AI never resurrects NO_MATCH.
 */
import "server-only";
import type { MatchEvaluationV2 } from "@/services/matching/engine-v2";
import type { StructuredSearchIntent } from "@/services/matching/search-intent-types";
import { runExchangeIntelligenceShadow } from "@/services/exchange/intelligence-shadow";

export const MATCHING_INTELLIGENCE_LIVE_MODE =
  "controlled_ranking_v1" as const;

const MIN_CONFIDENCE = 0.75;
const TIMEOUT_MS = 2500;

export type IntelligenceLiveResult = {
  mode: "live_ranking" | "shadow_only" | "fallback_deterministic";
  adjustedScore: number;
  intelligenceBand: string | null;
  usedLive: boolean;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch(() => {
      clearTimeout(t);
      resolve(null);
    });
  });
}

/**
 * After deterministic evaluation produced an eligible resolved match,
 * optionally nudge ranking using Intelligence. Never changes NO_MATCH /
 * NEEDS_INFORMATION outcomes.
 */
export async function applyControlledIntelligenceRanking(params: {
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
}): Promise<IntelligenceLiveResult> {
  const baseScore = params.engine.score;

  if (
    params.engine.resolutionState !== "RESOLVED" ||
    !params.engine.band ||
    params.engine.band === "NO_MATCH"
  ) {
    return {
      mode: "fallback_deterministic",
      adjustedScore: baseScore,
      intelligenceBand: null,
      usedLive: false,
    };
  }

  const shadow = await withTimeout(
    runExchangeIntelligenceShadow({
      candidateMatchId: params.candidateMatchId,
      intent: params.intent,
      engine: params.engine,
      vehicle: params.vehicle,
    }),
    TIMEOUT_MS
  );

  if (!shadow) {
    return {
      mode: "fallback_deterministic",
      adjustedScore: baseScore,
      intelligenceBand: null,
      usedLive: false,
    };
  }

  // Never resurrect / never upgrade NO_MATCH; never override HARD fail
  if (shadow.decision === "NO_MATCH") {
    return {
      mode: "shadow_only",
      adjustedScore: baseScore,
      intelligenceBand: shadow.decision,
      usedLive: false,
    };
  }

  if (shadow.confidence < MIN_CONFIDENCE) {
    return {
      mode: "shadow_only",
      adjustedScore: baseScore,
      intelligenceBand: shadow.decision,
      usedLive: false,
    };
  }

  // Controlled ranking nudge within same eligibility set (±5 points max)
  let adjusted = baseScore;
  const bandRank: Record<string, number> = {
    STRONG: 3,
    GOOD: 2,
    ALTERNATIVE: 1,
  };
  const engineRank = bandRank[params.engine.band] ?? 0;
  const intelRank = bandRank[shadow.decision] ?? 0;
  if (intelRank > engineRank) adjusted = Math.min(100, baseScore + 4);
  else if (intelRank < engineRank) adjusted = Math.max(0, baseScore - 3);

  return {
    mode: "live_ranking",
    adjustedScore: adjusted,
    intelligenceBand: shadow.decision,
    usedLive: true,
  };
}

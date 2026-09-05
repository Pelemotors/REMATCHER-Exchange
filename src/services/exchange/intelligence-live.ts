/**
 * Controlled Live Exchange Intelligence — ranking assist only.
 * Deterministic Hard Gates remain authority; AI never resurrects NO_MATCH.
 *
 * Pilot reliability mode: no remote intelligence call is allowed to block the
 * synchronous matching path. The deterministic engine score is returned as-is.
 */
import "server-only";
import type { MatchEvaluationV2 } from "@/services/matching/engine-v2";
import type { StructuredSearchIntent } from "@/services/matching/search-intent-types";

export const MATCHING_INTELLIGENCE_LIVE_MODE =
  "controlled_ranking_v1" as const;

export type IntelligenceLiveResult = {
  mode: "live_ranking" | "shadow_only" | "fallback_deterministic";
  adjustedScore: number;
  intelligenceBand: string | null;
  usedLive: boolean;
};

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
  return {
    mode: "fallback_deterministic",
    adjustedScore: params.engine.score,
    intelligenceBand: null,
    usedLive: false,
  };
}

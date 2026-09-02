import "server-only";

/** Compute percentile from sorted numeric array (0-100). Returns null if empty. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

export function median(sorted: number[]): number | null {
  return percentile(sorted, 50);
}

export interface TimingDistribution {
  count: number;
  averageMs: number | null;
  medianMs: number | null;
  p75Ms: number | null;
  p90Ms: number | null;
}

export function timingDistribution(valuesMs: number[]): TimingDistribution {
  if (valuesMs.length === 0) {
    return {
      count: 0,
      averageMs: null,
      medianMs: null,
      p75Ms: null,
      p90Ms: null,
    };
  }
  const sorted = [...valuesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    averageMs: Math.round(sum / sorted.length),
    medianMs: median(sorted),
    p75Ms: percentile(sorted, 75),
    p90Ms: percentile(sorted, 90),
  };
}

export function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function formatDurationMs(ms: number | null): string | null {
  if (ms == null) return null;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

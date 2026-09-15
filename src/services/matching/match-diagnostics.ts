/**
 * Privacy-safe match diagnostics for THIS dealer's demand.
 * Aggregates why evaluateMatchV2 rejected / softened candidates — no other-dealer identity.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import {
  evaluateMatchV2,
  type DimensionFitResult,
  type MatchEvaluationV2,
} from "@/services/matching/engine-v2";
import {
  emptyStructuredIntent,
  type StructuredSearchIntent,
} from "@/services/matching/search-intent-types";
import { legacyToSearchIntent } from "@/services/matching/legacy-search-intent-adapter";

export type NearMatchSummary = {
  failField: string;
  failDetail: string;
  count: number;
  /** Redacted relative gap examples, e.g. year off by 1 */
  examples: string[];
};

export type DemandMatchDiagnostic = {
  demandId: string;
  demandLabel: string;
  exactOrBandMatches: number;
  evaluatedVehicles: number;
  hardFailTotals: Array<{ field: string; count: number; detailSamples: string[] }>;
  nearMatches: NearMatchSummary[];
  softScoreDrops: Array<{ field: string; count: number }>;
  summaryHe: string;
};

function intentForDemand(confirmed: unknown): StructuredSearchIntent {
  try {
    return legacyToSearchIntent(confirmed, []).structuredIntent;
  } catch {
    return emptyStructuredIntent();
  }
}

function hardFails(ev: MatchEvaluationV2): DimensionFitResult[] {
  return ev.dimensions.filter(
    (d) => d.status === "HARD_FAIL" || (d.critical && d.fit === 0)
  );
}

/**
 * Diagnose matching for one of THIS dealer's demands against active network inventory
 * without exposing seller identity or forbidden commercial details.
 */
export async function diagnoseDemandMatches(
  dealerId: string,
  demandId: string
): Promise<DemandMatchDiagnostic | { error: string }> {
  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId },
    select: {
      id: true,
      confirmedJson: true,
      rawText: true,
      status: true,
      constraints: true,
    },
  });
  if (!demand) return { error: "not_found" };

  let intent: StructuredSearchIntent;
  try {
    intent = legacyToSearchIntent(
      demand.confirmedJson,
      demand.constraints
    ).structuredIntent;
  } catch {
    intent = intentForDemand(demand.confirmedJson);
  }

  const vehicles = await prisma.vehicle.findMany({
    where: {
      status: "ACTIVE",
      dealerId: { not: dealerId },
    },
    take: 400,
  });

  let bandMatches = 0;
  const hardFailMap = new Map<string, { count: number; details: string[] }>();
  const nearMap = new Map<
    string,
    { failField: string; failDetail: string; count: number; examples: string[] }
  >();
  const softDrop = new Map<string, number>();

  for (const v of vehicles) {
    const ev = evaluateMatchV2({ vehicle: v, intent });
    if (ev.hardPassed && ev.band && ev.band !== "NO_MATCH") {
      bandMatches += 1;
      for (const d of ev.dimensions) {
        if (
          d.status === "PARTIAL" ||
          (d.fit > 0 && d.fit < 0.85 && d.status !== "OPEN")
        ) {
          softDrop.set(d.field, (softDrop.get(d.field) ?? 0) + 1);
        }
      }
      continue;
    }

    const fails = hardFails(ev);
    for (const f of fails) {
      const key = f.field;
      const cur = hardFailMap.get(key) ?? { count: 0, details: [] };
      cur.count += 1;
      if (cur.details.length < 3 && f.detail) cur.details.push(f.detail);
      hardFailMap.set(key, cur);
    }

    // Near match: failed exactly one hard dimension
    if (fails.length === 1 && !ev.hardPassed) {
      const f = fails[0]!;
      const key = `${f.field}|${f.detail}`;
      const cur = nearMap.get(key) ?? {
        failField: f.field,
        failDetail: f.detail,
        count: 0,
        examples: [],
      };
      cur.count += 1;
      if (cur.examples.length < 2) {
        cur.examples.push(redactExample(f.field, f.detail, v.year, v.b2bPrice));
      }
      nearMap.set(key, cur);
    }
  }

  const label = (() => {
    const c = (demand.confirmedJson ?? {}) as Record<string, unknown>;
    return (
      `${c.make ?? ""} ${c.model ?? ""} ${c.yearMin ?? c.year ?? ""}`.trim() ||
      demand.id
    );
  })();

  const nearMatches = [...nearMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const hardFailTotals = [...hardFailMap.entries()]
    .map(([field, v]) => ({
      field,
      count: v.count,
      detailSamples: v.details,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const summaryHe = buildSummaryHe({
    bandMatches,
    evaluated: vehicles.length,
    nearMatches,
    hardFailTotals,
  });

  return {
    demandId: demand.id,
    demandLabel: label,
    exactOrBandMatches: bandMatches,
    evaluatedVehicles: vehicles.length,
    hardFailTotals,
    nearMatches,
    softScoreDrops: [...softDrop.entries()]
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    summaryHe,
  };
}

function redactExample(
  field: string,
  detail: string,
  year: number | null,
  price: number | null
): string {
  if (field === "year" && year != null) return `שנה ${year}`;
  if ((field === "price" || field === "b2bPrice") && price != null) {
    return `פער מחיר (מסוכם)`;
  }
  return detail.slice(0, 80);
}

/** Exported for unit tests — Hebrew diagnostic summary from aggregates */
export function buildSummaryHe(input: {
  bandMatches: number;
  evaluated: number;
  nearMatches: NearMatchSummary[];
  hardFailTotals: Array<{ field: string; count: number }>;
}): string {
  if (input.bandMatches > 0) {
    return `נמצאו ${input.bandMatches} התאמות בטווח המנוע מתוך ${input.evaluated} רכבים פעילים ברשת.`;
  }
  if (input.nearMatches.length === 0) {
    const top = input.hardFailTotals[0];
    return top
      ? `אין התאמות כרגע. הנפילה העיקרית: ${top.field} (${top.count}).`
      : `אין התאמות כרגע מתוך ${input.evaluated} רכבים שנבדקו.`;
  }
  const lines = input.nearMatches.slice(0, 3).map((n) => {
    return `${n.count} נפלו בעיקר על ${n.failField}: ${n.failDetail}`;
  });
  return `אין התאמה מדויקת. קרוב:\n- ${lines.join("\n- ")}`;
}

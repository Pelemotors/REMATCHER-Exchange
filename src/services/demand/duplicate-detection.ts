import type { DemandConfirmed } from "@/lib/demand-display";

export type DuplicateLevel =
  | "NEARLY_IDENTICAL"
  | "HIGHLY_SIMILAR"
  | "DIFFERENT";

export interface DuplicateCheckResult {
  level: DuplicateLevel;
  existingDemandId: string | null;
  differences: Array<{ field: string; from: string; to: string }>;
}

const MAKE_ALIASES: Record<string, string> = {
  מאזדה: "mazda",
  mazda: "mazda",
  טויוטה: "toyota",
  toyota: "toyota",
  יונדאי: "hyundai",
  hyundai: "hyundai",
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function normMake(s: string | null | undefined): string {
  const n = norm(s);
  return MAKE_ALIASES[n] ?? MAKE_ALIASES[s ?? ""] ?? n;
}

function normModel(s: string | null | undefined): string {
  return norm(s).replace(/[\s\-_]/g, "");
}

function fingerprint(confirmed: DemandConfirmed) {
  return {
    make: normMake(confirmed.make),
    model: normModel(confirmed.model),
    yearMin: confirmed.yearMin ?? null,
    budgetMax: confirmed.budgetMax ?? null,
    colors: [...(confirmed.colorExclusions ?? [])].map(norm).sort(),
  };
}

function colorSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export function compareDemands(
  incoming: DemandConfirmed,
  existing: DemandConfirmed
): { level: DuplicateLevel; differences: DuplicateCheckResult["differences"] } {
  const a = fingerprint(incoming);
  const b = fingerprint(existing);
  const differences: DuplicateCheckResult["differences"] = [];

  if (!a.make || !b.make || a.make !== b.make) {
    return { level: "DIFFERENT", differences };
  }
  if (!a.model || !b.model || a.model !== b.model) {
    return { level: "DIFFERENT", differences };
  }

  if (a.yearMin !== b.yearMin) {
    differences.push({
      field: "שנתון",
      from: String(b.yearMin ?? "—"),
      to: String(a.yearMin ?? "—"),
    });
  }
  if (a.budgetMax !== b.budgetMax) {
    differences.push({
      field: "תקציב",
      from: b.budgetMax ? String(b.budgetMax) : "—",
      to: a.budgetMax ? String(a.budgetMax) : "—",
    });
  }
  if (!colorSetsEqual(a.colors, b.colors)) {
    differences.push({
      field: "צבע",
      from: b.colors.join(", ") || "—",
      to: a.colors.join(", ") || "—",
    });
  }

  if (differences.length === 0) {
    return { level: "NEARLY_IDENTICAL", differences };
  }

  const onlyBudgetOrYear =
    differences.every((d) => d.field === "שנתון" || d.field === "תקציב");
  if (onlyBudgetOrYear && differences.length <= 2) {
    return { level: "HIGHLY_SIMILAR", differences };
  }

  return { level: "DIFFERENT", differences };
}

export function findDuplicateDemand(
  incoming: DemandConfirmed,
  existingDemands: Array<{
    id: string;
    status: string;
    confirmedJson: unknown;
  }>
): DuplicateCheckResult {
  const active = existingDemands.filter((d) =>
    ["ACTIVE", "PENDING_CONFIRMATION", "DRAFT"].includes(d.status)
  );

  let best: DuplicateCheckResult = {
    level: "DIFFERENT",
    existingDemandId: null,
    differences: [],
  };

  for (const d of active) {
    const confirmed = (d.confirmedJson ?? {}) as DemandConfirmed;
    if (!confirmed.make && !confirmed.model) continue;

    const { level, differences } = compareDemands(incoming, confirmed);
    if (level === "NEARLY_IDENTICAL") {
      return { level, existingDemandId: d.id, differences };
    }
    if (
      level === "HIGHLY_SIMILAR" &&
      best.level !== "NEARLY_IDENTICAL"
    ) {
      best = { level, existingDemandId: d.id, differences };
    }
  }

  return best;
}

/** Normalize raw text hints for pre-parse duplicate hint */
export function confirmedFromParsed(parsed: Record<string, unknown>): DemandConfirmed {
  const getVal = (f: unknown) => {
    if (f && typeof f === "object" && "value" in f) {
      return (f as { value: unknown }).value;
    }
    return f;
  };
  return {
    make: getVal(parsed.make) as string | null,
    model: getVal(parsed.model) as string | null,
    yearMin: getVal(parsed.yearMin) as number | null,
    budgetMax: getVal(parsed.budgetMax) as number | null,
    colorExclusions: (parsed.colorExclusions as string[]) ?? [],
  };
}

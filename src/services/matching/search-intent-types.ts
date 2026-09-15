/**
 * Search Intent 2.0 — structured commercial intent for a Demand version.
 * Agent understands language; this is the deterministic structure Matching uses.
 */

export const INTENT_IMPORTANCE = [
  "HARD",
  "VERY_HIGH",
  "HIGH",
  "MEDIUM",
  "PREFERENCE",
  "OPEN",
] as const;

export type IntentImportance = (typeof INTENT_IMPORTANCE)[number];

export const IMPORTANCE_WEIGHT: Record<IntentImportance, number> = {
  HARD: 0,
  VERY_HIGH: 5,
  HIGH: 4,
  MEDIUM: 2,
  PREFERENCE: 1,
  OPEN: 0,
};

export type NumericFlexibility = {
  target?: number | null;
  comfortableMin?: number | null;
  comfortableMax?: number | null;
  stretchMin?: number | null;
  stretchMax?: number | null;
  hardMin?: number | null;
  hardMax?: number | null;
};

export type DimensionIntent<T = unknown> = {
  importance: IntentImportance;
  target?: T | null;
  acceptable?: T[] | null;
  exclusions?: T[] | null;
  flexibility?: NumericFlexibility | null;
  confidence?: number;
  provenance?: "user_stated" | "agent_inferred" | "legacy_adapter" | "system";
  notes?: string | null;
};

export type FeatureRequirement = {
  feature: string;
  importance: IntentImportance;
  provenance?: "user_stated" | "agent_inferred" | "legacy_adapter" | "system";
  notes?: string | null;
};

/** Customer's offered trade-in vehicle — NOT ownershipSource of the desired car */
export type CustomerTradeInOffer = {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  notes?: string | null;
  provenance?: "user_stated" | "agent_inferred";
};

export type StructuredSearchIntent = {
  schemaVersion: 2;
  make?: DimensionIntent<string>;
  model?: DimensionIntent<string>;
  /** Explicit acceptable vehicle universe beyond primary make/model */
  vehicleUniverse?: Array<{ make?: string; model?: string }>;
  year?: DimensionIntent<number> & { flexibility?: NumericFlexibility };
  price?: DimensionIntent<number> & { flexibility?: NumericFlexibility };
  mileage?: DimensionIntent<number> & { flexibility?: NumericFlexibility };
  engineDisplacementCc?: DimensionIntent<number> & { flexibility?: NumericFlexibility };
  trim?: DimensionIntent<string>;
  fuel?: DimensionIntent<string>;
  transmission?: DimensionIntent<string>;
  drivetrain?: DimensionIntent<string>;
  color?: DimensionIntent<string>;
  /** Origin of the desired vehicle (private/leasing/…)—never customer trade-in */
  ownershipSource?: DimensionIntent<string>;
  /** Vehicle the customer offers as trade-in (separate from ownershipSource) */
  customerTradeIn?: CustomerTradeInOffer | null;
  hand?: DimensionIntent<number> & { flexibility?: NumericFlexibility };
  region?: DimensionIntent<string>;
  seats?: DimensionIntent<number>;
  featureRequirements?: FeatureRequirement[];
  freeFormRequirements?: string[];
  tradeOffNotes?: string[];
};

const TRADE_IN_OWNERSHIP_RE =
  /^(TRADE_IN|trade[\s_-]*in|טרייד[\s־-]*אין)$/i;

/** Move mistaken TRADE_IN ownershipSource into customerTradeIn. Mutates + returns intent. */
export function sanitizeTradeInOutOfOwnership(
  intent: StructuredSearchIntent
): StructuredSearchIntent {
  const target = intent.ownershipSource?.target;
  if (target == null) return intent;
  const asStr = String(target);
  if (!TRADE_IN_OWNERSHIP_RE.test(asStr)) return intent;
  const next: StructuredSearchIntent = { ...intent };
  if (!next.customerTradeIn) {
    next.customerTradeIn = {
      notes: "טרייד-אין לקוח (הופרד ממקוריות)",
      provenance: intent.ownershipSource?.provenance === "user_stated"
        ? "user_stated"
        : "agent_inferred",
    };
  }
  delete next.ownershipSource;
  return next;
}

export type SearchIntentDraft = {
  naturalLanguageSummary: string;
  structuredIntent: StructuredSearchIntent;
  source?: string;
};

export function emptyStructuredIntent(): StructuredSearchIntent {
  return { schemaVersion: 2 };
}

export function summarizeIntentHe(intent: StructuredSearchIntent): string {
  const parts: string[] = [];
  if (intent.make?.target || intent.model?.target) {
    parts.push(`${intent.make?.target ?? ""} ${intent.model?.target ?? ""}`.trim());
  }
  if (intent.year?.flexibility?.hardMin != null || intent.year?.target != null) {
    const y = intent.year.flexibility?.hardMin ?? intent.year.target ?? intent.year.flexibility?.comfortableMin;
    if (y != null) parts.push(intent.year.importance === "HARD" ? `${y} ומעלה (חובה)` : `סביב ${y}`);
  }
  if (intent.price?.target != null || intent.price?.flexibility?.comfortableMax != null) {
    const p = intent.price.target ?? intent.price.flexibility?.comfortableMax;
    if (p != null) {
      const flex = intent.price.importance === "HARD" ? "תקרה" : intent.price.flexibility?.stretchMax ? "גמיש מעט" : "סביב";
      parts.push(`${flex} ${p.toLocaleString("he-IL")}`);
    }
  }
  if (intent.mileage?.flexibility?.hardMax != null) {
    parts.push(`עד ${intent.mileage.flexibility.hardMax.toLocaleString("he-IL")} ק״מ`);
  } else if (intent.mileage?.target != null) {
    parts.push(`ק״מ סביב ${intent.mileage.target.toLocaleString("he-IL")}`);
  }
  if (intent.fuel?.target) parts.push(`דלק ${intent.fuel.target}`);
  if (intent.engineDisplacementCc?.target != null) parts.push(`מנוע ${intent.engineDisplacementCc.target} סמ״ק`);
  if (intent.hand?.target != null) parts.push(`עד יד ${intent.hand.target}`);
  if (intent.ownershipSource?.target) {
    const own = String(intent.ownershipSource.target);
    if (!TRADE_IN_OWNERSHIP_RE.test(own)) {
      parts.push(`מקוריות ${own}`);
    }
  }
  if (intent.customerTradeIn) {
    const t = intent.customerTradeIn;
    const vehicleBit = [t.make, t.model, t.year].filter((x) => x != null && x !== "").join(" ");
    const noteBit = t.notes?.trim() || "";
    parts.push(
      `טרייד-אין לקוח: ${[vehicleBit, noteBit].filter(Boolean).join(" — ") || "כן"}`
    );
  }
  if (intent.featureRequirements?.length) {
    parts.push(
      `פיצ'רים ${intent.featureRequirements
        .map((r) => `${r.feature}${r.importance === "HARD" ? " (חובה)" : ""}`)
        .join(", ")}`
    );
  }
  if (intent.color?.importance === "OPEN") parts.push("צבע לא משנה");
  if (intent.color?.exclusions?.length) parts.push(`לא ${intent.color.exclusions.join("/")}`);
  if (intent.tradeOffNotes?.length) parts.push(intent.tradeOffNotes[0]!);
  return parts.filter(Boolean).join(", ") || "חיפוש בפיתוח";
}

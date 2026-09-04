/**
 * Matching Engine 2.0 — deterministic evaluation from Search Intent.
 * AI understands intent; this code enforces Hard Gates, fits, bands.
 */
import type { Vehicle } from "@prisma/client";
import {
  IMPORTANCE_WEIGHT,
  type DimensionIntent,
  type IntentImportance,
  type NumericFlexibility,
  type StructuredSearchIntent,
} from "@/services/matching/search-intent-types";

export const MATCH_ENGINE_VERSION = "matching-engine-2.0";

export type MatchBandV2 = "STRONG" | "GOOD" | "ALTERNATIVE" | "NO_MATCH";

export type CandidateResolutionState = "RESOLVED" | "NEEDS_INFORMATION";

export type DimensionFitResult = {
  field: string;
  importance: IntentImportance;
  fit: number; // 0..1
  status: "MATCH" | "PARTIAL" | "MISMATCH" | "UNKNOWN" | "OPEN" | "HARD_FAIL";
  detail: string;
  critical: boolean;
};

export type MatchEvaluationV2 = {
  engineVersion: typeof MATCH_ENGINE_VERSION;
  /** Quality band when RESOLVED; null when NEEDS_INFORMATION */
  band: MatchBandV2 | null;
  resolutionState: CandidateResolutionState;
  /** Internal numeric for analytics only */
  score: number;
  hardPassed: boolean;
  verificationRequired: boolean;
  dimensions: DimensionFitResult[];
  fits: string[];
  compromises: string[];
  unknowns: string[];
  hardChecks: string[];
  criticalResults: string[];
  /** Fields that truly block a Match decision for this Search Intent */
  decisionBlockingUnknowns: string[];
  knownFits: string[];
  knownTensions: string[];
  whyPotential: string | null;
  searchIntentVersionId?: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function includesToken(hay: string, needle: string): boolean {
  const h = norm(hay);
  const n = norm(needle);
  if (!h || !n) return false;
  return h === n || h.includes(n) || n.includes(h);
}

function colorNorm(color: string | null | undefined): string {
  if (!color) return "";
  const map: Record<string, string> = {
    אדום: "red",
    red: "red",
    לבן: "white",
    white: "white",
    שחור: "black",
    black: "black",
    כסף: "silver",
    silver: "silver",
  };
  const c = color.toLowerCase();
  return map[c] ?? c;
}

function numericFit(
  value: number | null | undefined,
  flex: NumericFlexibility | null | undefined,
  direction: "max" | "min" | "around"
): { fit: number; status: DimensionFitResult["status"]; detail: string } {
  if (value == null || !Number.isFinite(value)) {
    return { fit: 0, status: "UNKNOWN", detail: "מידע חסר ברכב" };
  }
  if (!flex) {
    return { fit: 1, status: "OPEN", detail: "אין גמישות מוגדרת" };
  }

  if (direction === "max") {
    const hard = flex.hardMax;
    const stretch = flex.stretchMax ?? hard;
    const comfortable = flex.comfortableMax ?? stretch;
    const target = flex.target ?? comfortable;
    if (hard != null && value > hard) {
      return { fit: 0, status: "HARD_FAIL", detail: `מעל תקרה ${hard}` };
    }
    if (comfortable != null && value <= comfortable) {
      return {
        fit: target != null && value <= target ? 1 : 0.92,
        status: "MATCH",
        detail: "בטווח נוח",
      };
    }
    if (stretch != null && value <= stretch) {
      return { fit: 0.65, status: "PARTIAL", detail: "בטווח מתיחה" };
    }
    if (hard != null && value <= hard) {
      return { fit: 0.4, status: "PARTIAL", detail: "קרוב לתקרה הקשיחה" };
    }
    return { fit: 0.2, status: "MISMATCH", detail: "מחוץ לטווח" };
  }

  if (direction === "min") {
    const hard = flex.hardMin;
    const stretch = flex.stretchMin ?? hard;
    const comfortable = flex.comfortableMin ?? stretch;
    const target = flex.target ?? comfortable;
    if (hard != null && value < hard) {
      return { fit: 0, status: "HARD_FAIL", detail: `מתחת לסף ${hard}` };
    }
    if (comfortable != null && value >= comfortable) {
      return {
        fit: target != null && value >= target ? 1 : 0.92,
        status: "MATCH",
        detail: "בטווח נוח",
      };
    }
    if (stretch != null && value >= stretch) {
      return { fit: 0.65, status: "PARTIAL", detail: "בטווח מתיחה" };
    }
    return { fit: 0.2, status: "MISMATCH", detail: "מתחת לטווח" };
  }

  // around
  const target = flex.target;
  if (target == null) return { fit: 1, status: "OPEN", detail: "אין יעד" };
  const comfortableDelta =
    ((flex.comfortableMax ?? target) - (flex.comfortableMin ?? target)) / 2 ||
    target * 0.05;
  const stretchDelta =
    ((flex.stretchMax ?? target) - (flex.stretchMin ?? target)) / 2 ||
    target * 0.1;
  const delta = Math.abs(value - target);
  if (delta <= comfortableDelta) {
    return { fit: 1, status: "MATCH", detail: "קרוב ליעד" };
  }
  if (delta <= stretchDelta) {
    return { fit: 0.6, status: "PARTIAL", detail: "סטייה מקובלת" };
  }
  return { fit: 0.25, status: "MISMATCH", detail: "רחוק מהיעד" };
}

function identityFit(
  vehicle: Vehicle,
  intent: StructuredSearchIntent
): DimensionFitResult {
  const makeDim = intent.make;
  const modelDim = intent.model;
  const importance: IntentImportance =
    makeDim?.importance === "HARD" || modelDim?.importance === "HARD"
      ? "HARD"
      : makeDim?.importance === "VERY_HIGH" ||
          modelDim?.importance === "VERY_HIGH"
        ? "VERY_HIGH"
        : makeDim?.importance ?? modelDim?.importance ?? "OPEN";

  if (importance === "OPEN" && !makeDim?.target && !modelDim?.target) {
    return {
      field: "vehicleIdentity",
      importance: "OPEN",
      fit: 1,
      status: "OPEN",
      detail: "אין זהות רכב מוגדרת",
      critical: false,
    };
  }

  const makeOk =
    !makeDim?.target ||
    !vehicle.make ||
    includesToken(vehicle.make, makeDim.target);
  const modelOk =
    !modelDim?.target ||
    !vehicle.model ||
    includesToken(vehicle.model, modelDim.target);

  if (vehicle.make == null && makeDim?.target) {
    return {
      field: "vehicleIdentity",
      importance,
      fit: 0,
      status: "UNKNOWN",
      detail: "יצרן חסר ברכב",
      critical: true,
    };
  }
  if (vehicle.model == null && modelDim?.target) {
    return {
      field: "vehicleIdentity",
      importance,
      fit: 0,
      status: "UNKNOWN",
      detail: "דגם חסר ברכב",
      critical: true,
    };
  }

  // Acceptable alternatives
  let altOk = false;
  if (intent.vehicleUniverse?.length) {
    altOk = intent.vehicleUniverse.some(
      (u) =>
        (!u.make || includesToken(vehicle.make ?? "", u.make)) &&
        (!u.model || includesToken(vehicle.model ?? "", u.model))
    );
  }

  const ok = (makeOk && modelOk) || altOk;
  if (!ok && importance === "HARD") {
    return {
      field: "vehicleIdentity",
      importance,
      fit: 0,
      status: "HARD_FAIL",
      detail: "רכב לא תואם ליעד",
      critical: true,
    };
  }
  if (!ok) {
    return {
      field: "vehicleIdentity",
      importance,
      fit: 0.05,
      status: "MISMATCH",
      detail: "רכב לא תואם ליעד",
      critical: true,
    };
  }
  return {
    field: "vehicleIdentity",
    importance,
    fit: altOk && !(makeOk && modelOk) ? 0.85 : 1,
    status: "MATCH",
    detail: altOk && !(makeOk && modelOk) ? "חלופה מאושרת" : "תואם",
    critical: true,
  };
}

function evalCategorical(
  field: string,
  label: string,
  vehicleValue: string | null | undefined,
  dim: DimensionIntent<string> | undefined,
  critical = false
): DimensionFitResult | null {
  if (!dim || dim.importance === "OPEN") return null;
  if (dim.exclusions?.length && vehicleValue) {
    const v = field === "color" ? colorNorm(vehicleValue) : norm(vehicleValue);
    for (const ex of dim.exclusions) {
      const e = field === "color" ? colorNorm(String(ex)) : norm(String(ex));
      if (v && e && v === e) {
        return {
          field,
          importance: dim.importance,
          fit: 0,
          status: dim.importance === "HARD" ? "HARD_FAIL" : "MISMATCH",
          detail: `${label} מוחרג`,
          critical: dim.importance === "HARD" || critical,
        };
      }
    }
  }
  if (!dim.target && !dim.acceptable?.length) {
    if (dim.exclusions?.length) {
      return {
        field,
        importance: dim.importance,
        fit: 1,
        status: "MATCH",
        detail: `${label} לא מוחרג`,
        critical: false,
      };
    }
    return null;
  }
  if (vehicleValue == null || vehicleValue === "") {
    return {
      field,
      importance: dim.importance,
      fit: 0,
      status: "UNKNOWN",
      detail: `${label} חסר`,
      critical: dim.importance === "HARD" || critical,
    };
  }
  const ok =
    (dim.target && includesToken(vehicleValue, dim.target)) ||
    dim.acceptable?.some((a) => includesToken(vehicleValue, String(a)));
  if (!ok && dim.importance === "HARD") {
    return {
      field,
      importance: dim.importance,
      fit: 0,
      status: "HARD_FAIL",
      detail: `${label} לא תואם`,
      critical: true,
    };
  }
  return {
    field,
    importance: dim.importance,
    fit: ok ? 1 : dim.importance === "PREFERENCE" ? 0.7 : 0.2,
    status: ok ? "MATCH" : "MISMATCH",
    detail: ok ? `${label} מתאים` : `${label} לא מתאים`,
    critical,
  };
}

/** Vehicle row plus optional attrs not yet first-class columns (fuel etc.) */
export type MatchVehicleInput = Vehicle & {
  fuel?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
};

function readOptionalVehicleAttr(
  vehicle: MatchVehicleInput,
  field: string
): string | null {
  if (field === "color") return vehicle.color;
  if (field === "trim") return vehicle.trim;
  if (field === "region") return vehicle.region;
  if (field === "fuel" && vehicle.fuel != null) return vehicle.fuel;
  if (field === "transmission" && vehicle.transmission != null)
    return vehicle.transmission;
  if (field === "drivetrain" && vehicle.drivetrain != null)
    return vehicle.drivetrain;
  const prov = vehicle.fieldProvenance;
  if (prov && typeof prov === "object" && !Array.isArray(prov)) {
    const v = (prov as Record<string, unknown>)[field];
    if (typeof v === "string" && v.trim()) return v;
    if (v && typeof v === "object" && "value" in v) {
      const inner = (v as { value?: unknown }).value;
      if (typeof inner === "string" && inner.trim()) return inner;
    }
  }
  return null;
}

export function evaluateMatchV2(params: {
  vehicle: MatchVehicleInput;
  intent: StructuredSearchIntent;
  searchIntentVersionId?: string | null;
}): MatchEvaluationV2 {
  const { vehicle, intent } = params;
  const dimensions: DimensionFitResult[] = [];
  const fits: string[] = [];
  const compromises: string[] = [];
  const unknowns: string[] = [];
  const hardChecks: string[] = [];
  const criticalResults: string[] = [];

  const id = identityFit(vehicle, intent);
  dimensions.push(id);
  criticalResults.push(`${id.field}:${id.status}`);
  if (id.status === "HARD_FAIL") {
    return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [
      id.detail,
    ]);
  }
  if (id.status === "MATCH") fits.push(id.detail);
  if (id.status === "MISMATCH") {
    return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [
      id.detail,
    ]);
  }
  if (id.status === "UNKNOWN") unknowns.push(id.detail);

  // Year
  if (intent.year && intent.year.importance !== "OPEN") {
    const flex = intent.year.flexibility ?? {
      hardMin:
        typeof intent.year.target === "number" ? intent.year.target : null,
      comfortableMin:
        typeof intent.year.target === "number" ? intent.year.target : null,
      target:
        typeof intent.year.target === "number" ? intent.year.target : null,
    };
    const r = numericFit(vehicle.year, flex, "min");
    const dim: DimensionFitResult = {
      field: "year",
      importance: intent.year.importance,
      fit: r.fit,
      status:
        intent.year.importance === "HARD" && r.status === "MISMATCH"
          ? "HARD_FAIL"
          : r.status === "HARD_FAIL"
            ? "HARD_FAIL"
            : r.status,
      detail: r.detail,
      critical: intent.year.importance === "HARD" || intent.year.importance === "VERY_HIGH",
    };
    dimensions.push(dim);
    if (dim.status === "HARD_FAIL") {
      hardChecks.push(`year:${dim.detail}`);
      return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [
        dim.detail,
      ]);
    }
    if (dim.status === "MATCH") fits.push(`שנתון — ${dim.detail}`);
    if (dim.status === "PARTIAL") compromises.push(`שנתון — ${dim.detail}`);
    if (dim.status === "UNKNOWN") unknowns.push(`שנתון — ${dim.detail}`);
    if (dim.critical) criticalResults.push(`year:${dim.status}`);
  }

  // Price
  if (intent.price && intent.price.importance !== "OPEN") {
    const price = vehicle.b2bPrice ?? vehicle.retailPrice;
    const flex =
      intent.price.flexibility ??
      (intent.price.target != null
        ? {
            target: intent.price.target,
            comfortableMax: intent.price.target,
            stretchMax: Math.round(intent.price.target * 1.05),
            hardMax: Math.round(intent.price.target * 1.08),
          }
        : null);
    const r = numericFit(price, flex, "max");
    const dim: DimensionFitResult = {
      field: "price",
      importance: intent.price.importance,
      fit: r.fit,
      status:
        intent.price.importance === "HARD" && r.status === "MISMATCH"
          ? "HARD_FAIL"
          : r.status,
      detail: r.detail,
      critical: true,
    };
    dimensions.push(dim);
    criticalResults.push(`price:${dim.status}`);
    if (dim.status === "HARD_FAIL") {
      hardChecks.push(`price:${dim.detail}`);
      return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [
        dim.detail,
      ]);
    }
    if (dim.status === "MATCH") fits.push(`מחיר — ${dim.detail}`);
    if (dim.status === "PARTIAL") compromises.push(`מחיר — ${dim.detail}`);
    if (dim.status === "UNKNOWN") unknowns.push(`מחיר — ${dim.detail}`);
    if (dim.status === "MISMATCH" && intent.price.importance === "VERY_HIGH") {
      // anti-compensation: extreme commercial miss
      return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [
        dim.detail,
      ]);
    }
  }

  // Mileage
  if (intent.mileage && intent.mileage.importance !== "OPEN") {
    const flex =
      intent.mileage.flexibility ??
      (intent.mileage.target != null
        ? {
            target: intent.mileage.target,
            comfortableMax: intent.mileage.target,
            stretchMax: Math.round(intent.mileage.target * 1.15),
            hardMax: intent.mileage.target,
          }
        : null);
    const r = numericFit(vehicle.mileage, flex, "max");
    const dim: DimensionFitResult = {
      field: "mileage",
      importance: intent.mileage.importance,
      fit: r.fit,
      status:
        intent.mileage.importance === "HARD" &&
        (r.status === "MISMATCH" || r.status === "HARD_FAIL")
          ? "HARD_FAIL"
          : r.status,
      detail: r.detail,
      critical:
        intent.mileage.importance === "HARD" ||
        intent.mileage.importance === "VERY_HIGH",
    };
    dimensions.push(dim);
    if (dim.critical) criticalResults.push(`mileage:${dim.status}`);
    if (dim.status === "HARD_FAIL") {
      hardChecks.push(`mileage:${dim.detail}`);
      return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [
        dim.detail,
      ]);
    }
    if (dim.status === "MATCH") fits.push(`ק״מ — ${dim.detail}`);
    if (dim.status === "PARTIAL") compromises.push(`ק״מ — ${dim.detail}`);
    if (dim.status === "UNKNOWN") unknowns.push(`ק״מ — ${dim.detail}`);
  }

  let verificationRequired = false;

  for (const [field, label, dim, critical] of [
    ["fuel", "דלק", intent.fuel, true],
    ["color", "צבע", intent.color, false],
    ["trim", "גימור", intent.trim, false],
    ["transmission", "גיר", intent.transmission, false],
    ["region", "אזור", intent.region, false],
  ] as const) {
    // fuel/transmission/drivetrain may appear on extended vehicle or fieldProvenance; else UNKNOWN
    const value = readOptionalVehicleAttr(vehicle, field);
    const result = evalCategorical(
      field,
      label,
      value,
      dim as DimensionIntent<string> | undefined,
      critical
    );
    if (!result) continue;
    dimensions.push(result);
    if (result.status === "HARD_FAIL") {
      hardChecks.push(`${field}:${result.detail}`);
      return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [
        result.detail,
      ]);
    }
    if (result.status === "UNKNOWN" && result.importance === "HARD") {
      hardChecks.push(`${field}:verification_required`);
      unknowns.push(result.detail);
      verificationRequired = true;
    }
    if (result.status === "MATCH") fits.push(result.detail);
    if (result.status === "MISMATCH" && result.importance === "PREFERENCE") {
      compromises.push(result.detail);
    } else if (result.status === "MISMATCH") {
      compromises.push(result.detail);
    }
    if (result.status === "UNKNOWN" && result.importance !== "HARD")
      unknowns.push(result.detail);
    if (result.critical) criticalResults.push(`${field}:${result.status}`);
  }

  // Dynamic importance scoring — only active non-OPEN dimensions
  let weighted = 0;
  let total = 0;
  for (const d of dimensions) {
    if (d.importance === "OPEN" || d.status === "OPEN") continue;
    const w = IMPORTANCE_WEIGHT[d.importance] || 0;
    if (w <= 0 && d.importance === "HARD") {
      // hard already gated
      continue;
    }
    if (w <= 0) continue;
    total += w;
    weighted += w * d.fit;
    if (d.status === "UNKNOWN" && d.critical) verificationRequired = true;
  }

  const score = total > 0 ? Math.round((weighted / total) * 100) : 50;

  // Anti-compensation: critical identity + price must meet minimums (when known)
  const identity = dimensions.find((d) => d.field === "vehicleIdentity");
  const price = dimensions.find((d) => d.field === "price");
  const mileage = dimensions.find((d) => d.field === "mileage");
  if (identity && identity.fit < 0.5 && identity.importance !== "OPEN") {
    return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [
      "זהות רכב לא עומדת בסף קריטי",
    ]);
  }
  if (
    price &&
    price.critical &&
    price.status !== "UNKNOWN" &&
    price.fit < 0.35
  ) {
    return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [
      "פער מחיר מסחרי קיצוני",
    ]);
  }

  const decisionBlockingUnknowns = collectDecisionBlockingUnknowns(dimensions);
  const knownFits = dimensions
    .filter((d) => d.status === "MATCH" || d.status === "PARTIAL")
    .map((d) => d.detail);
  const knownTensions = dimensions
    .filter((d) => d.status === "MISMATCH" || d.status === "PARTIAL")
    .map((d) => d.detail);

  // Mass 2.5: decision-blocking UNKNOWN → Potential / NEEDS_INFORMATION (not fake ALTERNATIVE)
  if (decisionBlockingUnknowns.length > 0) {
    const identityOk =
      !identity ||
      identity.status === "OPEN" ||
      identity.status === "MATCH" ||
      (identity.status === "PARTIAL" && identity.fit >= 0.85);
    const knownCommercialOk =
      !price ||
      price.status === "UNKNOWN" ||
      price.status === "OPEN" ||
      price.fit >= 0.5;
    const knownMileageOk =
      !mileage ||
      mileage.status === "UNKNOWN" ||
      mileage.status === "OPEN" ||
      mileage.status === "MATCH" ||
      mileage.status === "PARTIAL" ||
      (mileage.status === "MISMATCH" && mileage.importance === "PREFERENCE");

    if (identityOk && knownCommercialOk && knownMileageOk) {
      const why = `מידע ידוע תומך בפוטנציאל מסחרי, אך חסר: ${decisionBlockingUnknowns.join(", ")}`;
      return {
        engineVersion: MATCH_ENGINE_VERSION,
        band: null,
        resolutionState: "NEEDS_INFORMATION",
        score,
        hardPassed: true,
        verificationRequired: true,
        dimensions,
        fits,
        compromises,
        unknowns,
        hardChecks,
        criticalResults,
        decisionBlockingUnknowns,
        knownFits,
        knownTensions,
        whyPotential: why,
        searchIntentVersionId: params.searchIntentVersionId ?? null,
      };
    }
    return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [
      "מידע חסר ללא פוטנציאל מסחרי מספיק",
    ]);
  }

  let band: MatchBandV2 = "NO_MATCH";
  if (score >= 88 && identity && identity.fit >= 0.85 && (!price || price.fit >= 0.65)) {
    band = "STRONG";
  } else if (score >= 72) {
    band = "GOOD";
  } else if (score >= 55) {
    band = "ALTERNATIVE";
  } else {
    band = "NO_MATCH";
  }

  if (band === "NO_MATCH") {
    return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [
      "ציון כולל נמוך",
    ]);
  }

  return {
    engineVersion: MATCH_ENGINE_VERSION,
    band,
    resolutionState: "RESOLVED",
    score,
    hardPassed: true,
    verificationRequired: false,
    dimensions,
    fits,
    compromises,
    unknowns,
    hardChecks,
    criticalResults,
    decisionBlockingUnknowns: [],
    knownFits,
    knownTensions,
    whyPotential: null,
    searchIntentVersionId: params.searchIntentVersionId ?? null,
  };
}

/** Fields that block Match decision for this intent — OPEN/PREFERENCE never block. */
function collectDecisionBlockingUnknowns(
  dimensions: DimensionFitResult[]
): string[] {
  const out: string[] = [];
  for (const d of dimensions) {
    if (d.status !== "UNKNOWN") continue;
    if (d.importance === "OPEN" || d.importance === "PREFERENCE") continue;
    // HARD / VERY_HIGH / HIGH always block when unknown; MEDIUM only if marked critical
    if (
      d.importance === "HARD" ||
      d.importance === "VERY_HIGH" ||
      d.importance === "HIGH" ||
      (d.importance === "MEDIUM" && d.critical)
    ) {
      out.push(d.field);
    }
  }
  return out;
}

function noMatch(
  searchIntentVersionId: string | null | undefined,
  dimensions: DimensionFitResult[],
  hardChecks: string[],
  reasons: string[]
): MatchEvaluationV2 {
  return {
    engineVersion: MATCH_ENGINE_VERSION,
    band: "NO_MATCH",
    resolutionState: "RESOLVED",
    score: 0,
    hardPassed: hardChecks.length === 0,
    verificationRequired: false,
    dimensions,
    fits: [],
    compromises: reasons,
    unknowns: [],
    hardChecks,
    criticalResults: reasons,
    decisionBlockingUnknowns: [],
    knownFits: [],
    knownTensions: reasons,
    whyPotential: null,
    searchIntentVersionId: searchIntentVersionId ?? null,
  };
}

/** Map V2 band to Prisma ScoreBand (compat with existing UI) */
export function matchBandV2ToScoreBand(
  band: MatchBandV2 | null
): "STRONG" | "GOOD" | "ALTERNATIVE" | "HIDDEN" {
  if (!band || band === "NO_MATCH") return "HIDDEN";
  return band;
}

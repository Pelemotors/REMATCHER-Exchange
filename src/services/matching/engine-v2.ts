/**
 * Matching Engine 2.0 — deterministic evaluation from Search Intent.
 * AI understands intent; this code enforces hard gates, bilingual normalization,
 * seller-only missing-information gating and final bands.
 */
import type { Vehicle } from "@prisma/client";
import {
  IMPORTANCE_WEIGHT,
  type DimensionIntent,
  type IntentImportance,
  type NumericFlexibility,
  type StructuredSearchIntent,
} from "@/services/matching/search-intent-types";
import {
  canonicalizeFuelType,
  canonicalizeOwnershipSource,
  canonicalizeVehicleIdentity,
  normalizeEngineDisplacementCc,
} from "@/services/exchange/vehicle-identity";
import {
  canonicalizeVehicleFeature,
  canonicalizeVehicleFeatures,
  vehicleFeatureLabelHe,
} from "@/services/exchange/vehicle-features";

export const MATCH_ENGINE_VERSION = "matching-engine-2.2";
export const MAX_SELLER_OVER_BUYER_PRICE_RATIO = 1.1;

export type MatchBandV2 = "STRONG" | "GOOD" | "ALTERNATIVE" | "NO_MATCH";
export type CandidateResolutionState = "RESOLVED" | "NEEDS_INFORMATION";

export type DimensionFitResult = {
  field: string;
  importance: IntentImportance;
  fit: number;
  status: "MATCH" | "PARTIAL" | "MISMATCH" | "UNKNOWN" | "OPEN" | "HARD_FAIL";
  detail: string;
  critical: boolean;
};

export type MatchEvaluationV2 = {
  engineVersion: string;
  band: MatchBandV2 | null;
  resolutionState: CandidateResolutionState;
  score: number;
  hardPassed: boolean;
  verificationRequired: boolean;
  dimensions: DimensionFitResult[];
  fits: string[];
  compromises: string[];
  unknowns: string[];
  hardChecks: string[];
  criticalResults: string[];
  decisionBlockingUnknowns: string[];
  knownFits: string[];
  knownTensions: string[];
  whyPotential: string | null;
  searchIntentVersionId?: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").trim().toLowerCase();
}

function includesToken(hay: string, needle: string): boolean {
  const h = norm(hay);
  const n = norm(needle);
  return !!h && !!n && (h === n || h.includes(n) || n.includes(h));
}

function colorNorm(color: string | null | undefined): string {
  const map: Record<string, string> = {
    אדום: "red", red: "red", לבן: "white", white: "white",
    שחור: "black", black: "black", כסף: "silver", silver: "silver",
  };
  const c = norm(color);
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
  if (!flex) return { fit: 1, status: "OPEN", detail: "אין גמישות מוגדרת" };

  if (direction === "max") {
    const hard = flex.hardMax;
    const stretch = flex.stretchMax ?? hard;
    const comfortable = flex.comfortableMax ?? stretch;
    const target = flex.target ?? comfortable;
    if (hard != null && value > hard) return { fit: 0, status: "HARD_FAIL", detail: `מעל תקרה ${hard}` };
    if (comfortable != null && value <= comfortable) {
      return { fit: target != null && value <= target ? 1 : 0.92, status: "MATCH", detail: "בטווח נוח" };
    }
    if (stretch != null && value <= stretch) return { fit: 0.65, status: "PARTIAL", detail: "בטווח מתיחה" };
    if (hard != null && value <= hard) return { fit: 0.4, status: "PARTIAL", detail: "קרוב לתקרה הקשיחה" };
    return { fit: 0.2, status: "MISMATCH", detail: "מחוץ לטווח" };
  }

  if (direction === "min") {
    const hard = flex.hardMin;
    const stretch = flex.stretchMin ?? hard;
    const comfortable = flex.comfortableMin ?? stretch;
    const target = flex.target ?? comfortable;
    if (hard != null && value < hard) return { fit: 0, status: "HARD_FAIL", detail: `מתחת לסף ${hard}` };
    if (comfortable != null && value >= comfortable) {
      return { fit: target != null && value >= target ? 1 : 0.92, status: "MATCH", detail: "בטווח נוח" };
    }
    if (stretch != null && value >= stretch) return { fit: 0.65, status: "PARTIAL", detail: "בטווח מתיחה" };
    return { fit: 0.2, status: "MISMATCH", detail: "מתחת לטווח" };
  }

  const target = flex.target;
  if (target == null) return { fit: 1, status: "OPEN", detail: "אין יעד" };
  const comfortableDelta = ((flex.comfortableMax ?? target) - (flex.comfortableMin ?? target)) / 2 || target * 0.05;
  const stretchDelta = ((flex.stretchMax ?? target) - (flex.stretchMin ?? target)) / 2 || target * 0.1;
  const delta = Math.abs(value - target);
  if (flex.hardMin != null && value < flex.hardMin) return { fit: 0, status: "HARD_FAIL", detail: `מתחת לסף ${flex.hardMin}` };
  if (flex.hardMax != null && value > flex.hardMax) return { fit: 0, status: "HARD_FAIL", detail: `מעל תקרה ${flex.hardMax}` };
  if (delta <= comfortableDelta) return { fit: 1, status: "MATCH", detail: "קרוב ליעד" };
  if (delta <= stretchDelta) return { fit: 0.6, status: "PARTIAL", detail: "סטייה מקובלת" };
  return { fit: 0.25, status: "MISMATCH", detail: "רחוק מהיעד" };
}

function identityFit(vehicle: Vehicle, intent: StructuredSearchIntent): DimensionFitResult {
  const makeDim = intent.make;
  const modelDim = intent.model;
  const importance: IntentImportance =
    makeDim?.importance === "HARD" || modelDim?.importance === "HARD" ? "HARD" :
    makeDim?.importance === "VERY_HIGH" || modelDim?.importance === "VERY_HIGH" ? "VERY_HIGH" :
    makeDim?.importance ?? modelDim?.importance ?? "OPEN";

  if (importance === "OPEN" && !makeDim?.target && !modelDim?.target) {
    return { field: "vehicleIdentity", importance: "OPEN", fit: 1, status: "OPEN", detail: "אין זהות רכב מוגדרת", critical: false };
  }

  const vehicleIdentity = canonicalizeVehicleIdentity({ make: vehicle.make, model: vehicle.model });
  const targetIdentity = canonicalizeVehicleIdentity({ make: makeDim?.target ?? null, model: modelDim?.target ?? null });

  if (!vehicleIdentity.make && targetIdentity.make) {
    return { field: "vehicleIdentity", importance, fit: 0, status: "UNKNOWN", detail: "יצרן חסר ברכב", critical: true };
  }
  if (!vehicleIdentity.model && targetIdentity.model) {
    return { field: "vehicleIdentity", importance, fit: 0, status: "UNKNOWN", detail: "דגם חסר ברכב", critical: true };
  }

  const makeOk = !targetIdentity.make || includesToken(vehicleIdentity.make ?? "", targetIdentity.make);
  const modelOk = !targetIdentity.model || includesToken(vehicleIdentity.model ?? "", targetIdentity.model);
  let altOk = false;
  if (intent.vehicleUniverse?.length) {
    altOk = intent.vehicleUniverse.some((u) => {
      const alt = canonicalizeVehicleIdentity(u);
      return (!alt.make || includesToken(vehicleIdentity.make ?? "", alt.make)) &&
        (!alt.model || includesToken(vehicleIdentity.model ?? "", alt.model));
    });
  }
  const ok = (makeOk && modelOk) || altOk;
  if (!ok && importance === "HARD") {
    return { field: "vehicleIdentity", importance, fit: 0, status: "HARD_FAIL", detail: "רכב לא תואם ליעד", critical: true };
  }
  if (!ok) return { field: "vehicleIdentity", importance, fit: 0.05, status: "MISMATCH", detail: "רכב לא תואם ליעד", critical: true };
  return { field: "vehicleIdentity", importance, fit: altOk && !(makeOk && modelOk) ? 0.85 : 1, status: "MATCH", detail: altOk && !(makeOk && modelOk) ? "חלופה מאושרת" : "תואם", critical: true };
}

type StringNormalizer = (value: string | null | undefined) => string | null;

function evalCategorical(
  field: string,
  label: string,
  vehicleValue: string | null | undefined,
  dim: DimensionIntent<string> | undefined,
  critical = false,
  normalizer?: StringNormalizer
): DimensionFitResult | null {
  if (!dim || dim.importance === "OPEN") return null;
  const normalizeValue = (value: string | null | undefined) => normalizer?.(value) ?? (field === "color" ? colorNorm(value) : norm(value));
  const v = vehicleValue == null || vehicleValue === "" ? null : normalizeValue(vehicleValue);

  if (dim.exclusions?.length && v) {
    for (const ex of dim.exclusions) {
      const e = normalizeValue(String(ex));
      if (e && v === e) {
        return { field, importance: dim.importance, fit: 0, status: dim.importance === "HARD" ? "HARD_FAIL" : "MISMATCH", detail: `${label} מוחרג`, critical: dim.importance === "HARD" || critical };
      }
    }
  }
  if (!dim.target && !dim.acceptable?.length) {
    if (dim.exclusions?.length) return { field, importance: dim.importance, fit: 1, status: "MATCH", detail: `${label} לא מוחרג`, critical: false };
    return null;
  }
  if (!v) return { field, importance: dim.importance, fit: 0, status: "UNKNOWN", detail: `${label} חסר`, critical: dim.importance === "HARD" || critical };

  const targets = [dim.target, ...(dim.acceptable ?? [])].filter((x): x is string => typeof x === "string" && !!x);
  const ok = targets.some((target) => {
    const t = normalizeValue(target);
    return !!t && (v === t || includesToken(v, t));
  });
  if (!ok && dim.importance === "HARD") {
    return { field, importance: dim.importance, fit: 0, status: "HARD_FAIL", detail: `${label} לא תואם`, critical: true };
  }
  return { field, importance: dim.importance, fit: ok ? 1 : dim.importance === "PREFERENCE" ? 0.7 : 0.2, status: ok ? "MATCH" : "MISMATCH", detail: ok ? `${label} מתאים` : `${label} לא מתאים`, critical };
}

export type MatchVehicleInput = Vehicle & {
  fuel?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
};

function provenanceValue(vehicle: MatchVehicleInput, keys: string[]): string | number | null {
  const prov = vehicle.fieldProvenance;
  if (!prov || typeof prov !== "object" || Array.isArray(prov)) return null;
  const record = prov as Record<string, unknown>;
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === "string" || typeof raw === "number") return raw;
    if (raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw) {
      const inner = (raw as { value?: unknown }).value;
      if (typeof inner === "string" || typeof inner === "number") return inner;
    }
  }
  return null;
}

function provenanceArray(vehicle: MatchVehicleInput, key: string): string[] {
  const prov = vehicle.fieldProvenance;
  if (!prov || typeof prov !== "object" || Array.isArray(prov)) return [];
  const raw = (prov as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

function readOptionalVehicleAttr(vehicle: MatchVehicleInput, field: string): string | null {
  if (field === "color") return vehicle.color;
  if (field === "trim") return vehicle.trim;
  if (field === "region") return vehicle.region;
  if (field === "fuel" && vehicle.fuel != null) return vehicle.fuel;
  if (field === "transmission" && vehicle.transmission != null) return vehicle.transmission;
  if (field === "drivetrain" && vehicle.drivetrain != null) return vehicle.drivetrain;
  const keys = field === "fuel" ? ["fuel", "fuelType"] :
    field === "ownershipSource" ? ["ownershipSource", "ownershipType"] : [field];
  const value = provenanceValue(vehicle, keys);
  return value == null ? null : String(value);
}

function readEngineCc(vehicle: MatchVehicleInput): number | null {
  return normalizeEngineDisplacementCc(provenanceValue(vehicle, ["engineDisplacementCc", "engine", "engineCapacity"]));
}

function buyerReferencePrice(intent: StructuredSearchIntent): number | null {
  const values = [
    intent.price?.target,
    intent.price?.flexibility?.comfortableMax,
    intent.price?.flexibility?.hardMax,
  ];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function pushDimension(
  result: DimensionFitResult,
  dimensions: DimensionFitResult[],
  fits: string[],
  compromises: string[],
  unknowns: string[],
  criticalResults: string[]
) {
  dimensions.push(result);
  if (result.status === "MATCH") fits.push(result.detail);
  if (result.status === "PARTIAL" || result.status === "MISMATCH") compromises.push(result.detail);
  if (result.status === "UNKNOWN") unknowns.push(result.detail);
  if (result.critical) criticalResults.push(`${result.field}:${result.status}`);
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
  pushDimension(id, dimensions, fits, compromises, unknowns, criticalResults);
  if (id.status === "HARD_FAIL" || id.status === "MISMATCH") return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [id.detail]);

  // Commercial gate: a final match is impossible until BOTH sides supplied a price.
  // Product semantics use one asking price. b2bPrice is the current canonical storage field;
  // retailPrice remains a backward-compatible legacy alias until the DB schema is cleaned up.
  const buyerPrice = buyerReferencePrice(intent);
  const sellerPrice = vehicle.b2bPrice ?? vehicle.retailPrice;
  if (buyerPrice == null) {
    pushDimension(
      { field: "buyerPrice", importance: "HIGH", fit: 0, status: "UNKNOWN", detail: "מחיר/תקציב המחפש חסר", critical: true },
      dimensions, fits, compromises, unknowns, criticalResults
    );
  }
  if (sellerPrice == null) {
    pushDimension(
      { field: "price", importance: "HIGH", fit: 0, status: "UNKNOWN", detail: "מחיר מבוקש חסר ברכב", critical: true },
      dimensions, fits, compromises, unknowns, criticalResults
    );
  }
  if (buyerPrice != null && sellerPrice != null) {
    const maxAllowed = Math.round(buyerPrice * MAX_SELLER_OVER_BUYER_PRICE_RATIO);
    if (sellerPrice > maxAllowed) {
      hardChecks.push(`price:seller=${sellerPrice}>buyer+10%=${maxAllowed}`);
      return noMatch(params.searchIntentVersionId, dimensions, hardChecks, ["המחיר המבוקש גבוה ביותר מ־10% מתקציב המחפש"]);
    }
    const withinBudget = sellerPrice <= buyerPrice;
    pushDimension(
      {
        field: "price",
        importance: "HIGH",
        fit: withinBudget ? 1 : 0.65,
        status: withinBudget ? "MATCH" : "PARTIAL",
        detail: withinBudget ? "המחיר המבוקש בתוך תקציב המחפש" : "המחיר המבוקש עד 10% מעל תקציב המחפש",
        critical: true,
      },
      dimensions, fits, compromises, unknowns, criticalResults
    );
  }

  const numericDimensions: Array<{
    field: string;
    label: string;
    value: number | null | undefined;
    dim: (DimensionIntent<number> & { flexibility?: NumericFlexibility }) | undefined;
    direction: "max" | "min" | "around";
    critical: boolean;
  }> = [
    { field: "year", label: "שנתון", value: vehicle.year, dim: intent.year, direction: "min", critical: true },
    { field: "mileage", label: "ק״מ", value: vehicle.mileage, dim: intent.mileage, direction: "max", critical: false },
    { field: "hand", label: "יד", value: vehicle.ownershipHand, dim: intent.hand, direction: "max", critical: true },
  ];

  for (const item of numericDimensions) {
    const dim = item.dim;
    if (!dim || dim.importance === "OPEN") continue;
    let flex = dim.flexibility;
    if (!flex && dim.target != null) {
      flex = item.direction === "max"
        ? { target: dim.target, comfortableMax: dim.target, hardMax: dim.importance === "HARD" ? dim.target : null }
        : { target: dim.target, comfortableMin: dim.target, hardMin: dim.importance === "HARD" ? dim.target : null };
    }
    const r = numericFit(item.value, flex, item.direction);
    const status = dim.importance === "HARD" && (r.status === "MISMATCH" || r.status === "HARD_FAIL") ? "HARD_FAIL" : r.status;
    const result: DimensionFitResult = {
      field: item.field,
      importance: dim.importance,
      fit: r.fit,
      status,
      detail: `${item.label} — ${r.detail}`,
      critical: item.critical || dim.importance === "HARD" || dim.importance === "VERY_HIGH",
    };
    pushDimension(result, dimensions, fits, compromises, unknowns, criticalResults);
    if (result.status === "HARD_FAIL") {
      hardChecks.push(`${item.field}:${result.detail}`);
      return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [result.detail]);
    }
  }

  if (intent.engineDisplacementCc && intent.engineDisplacementCc.importance !== "OPEN") {
    const dim = intent.engineDisplacementCc;
    const fuel = canonicalizeFuelType(readOptionalVehicleAttr(vehicle, "fuel"));
    let result: DimensionFitResult;
    if ((fuel === "ELECTRIC" || fuel === "HYDROGEN") && dim.target != null) {
      result = {
        field: "engineDisplacementCc",
        importance: dim.importance,
        fit: 0,
        status: dim.importance === "HARD" ? "HARD_FAIL" : "MISMATCH",
        detail: "נפח מנוע — לא רלוונטי להנעה חשמלית/מימן",
        critical: dim.importance !== "PREFERENCE",
      };
    } else {
      const target = typeof dim.target === "number" ? dim.target : null;
      const tolerance = target != null ? Math.max(50, Math.round(target * 0.04)) : 50;
      const flex = dim.flexibility ?? (target != null ? {
        target,
        comfortableMin: target - tolerance,
        comfortableMax: target + tolerance,
        hardMin: dim.importance === "HARD" ? target - tolerance : null,
        hardMax: dim.importance === "HARD" ? target + tolerance : null,
      } : null);
      const r = numericFit(readEngineCc(vehicle), flex, "around");
      result = {
        field: "engineDisplacementCc",
        importance: dim.importance,
        fit: r.fit,
        status: dim.importance === "HARD" && (r.status === "MISMATCH" || r.status === "HARD_FAIL") ? "HARD_FAIL" : r.status,
        detail: `נפח מנוע — ${r.detail}`,
        critical: dim.importance === "HARD" || dim.importance === "VERY_HIGH" || dim.importance === "HIGH",
      };
    }
    pushDimension(result, dimensions, fits, compromises, unknowns, criticalResults);
    if (result.status === "HARD_FAIL") {
      hardChecks.push(`engineDisplacementCc:${result.detail}`);
      return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [result.detail]);
    }
  }

  for (const [field, label, dim, critical, normalizer] of [
    ["fuel", "דלק/הנעה", intent.fuel, true, (v: string | null | undefined) => canonicalizeFuelType(v)],
    ["ownershipSource", "מקוריות", intent.ownershipSource, true, (v: string | null | undefined) => canonicalizeOwnershipSource(v)],
    ["color", "צבע", intent.color, false, undefined],
    ["trim", "גימור", intent.trim, false, undefined],
    ["transmission", "גיר", intent.transmission, false, undefined],
    ["drivetrain", "סוג הנעה", intent.drivetrain, false, undefined],
    ["region", "אזור", intent.region, false, undefined],
  ] as const) {
    const value = readOptionalVehicleAttr(vehicle, field);
    const result = evalCategorical(field, label, value, dim as DimensionIntent<string> | undefined, critical, normalizer as StringNormalizer | undefined);
    if (!result) continue;
    pushDimension(result, dimensions, fits, compromises, unknowns, criticalResults);
    if (result.status === "HARD_FAIL") {
      hardChecks.push(`${field}:${result.detail}`);
      return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [result.detail]);
    }
  }

  const vehicleFeatures = new Set(canonicalizeVehicleFeatures(provenanceArray(vehicle, "features")));
  const absentFeatures = new Set(canonicalizeVehicleFeatures(provenanceArray(vehicle, "absentFeatures")));
  for (const requirement of intent.featureRequirements ?? []) {
    if (requirement.importance === "OPEN") continue;
    const feature = canonicalizeVehicleFeature(requirement.feature);
    if (!feature) continue;
    const present = vehicleFeatures.has(feature);
    const explicitlyAbsent = absentFeatures.has(feature);
    let result: DimensionFitResult;
    if (present) {
      result = {
        field: `feature:${feature}`,
        importance: requirement.importance,
        fit: 1,
        status: "MATCH",
        detail: `${vehicleFeatureLabelHe(feature)} קיים ברכב`,
        critical: requirement.importance === "HARD" || requirement.importance === "VERY_HIGH" || requirement.importance === "HIGH",
      };
    } else if (explicitlyAbsent) {
      result = {
        field: `feature:${feature}`,
        importance: requirement.importance,
        fit: 0,
        status: requirement.importance === "HARD" ? "HARD_FAIL" : "MISMATCH",
        detail: `${vehicleFeatureLabelHe(feature)} נבדק ואינו קיים ברכב`,
        critical: requirement.importance !== "PREFERENCE",
      };
    } else {
      result = {
        field: `feature:${feature}`,
        importance: requirement.importance,
        fit: 0,
        status: "UNKNOWN",
        detail: `לא ידוע אם קיים ${vehicleFeatureLabelHe(feature)}`,
        critical: requirement.importance === "HARD" || requirement.importance === "VERY_HIGH" || requirement.importance === "HIGH",
      };
    }
    pushDimension(result, dimensions, fits, compromises, unknowns, criticalResults);
    if (result.status === "HARD_FAIL") {
      hardChecks.push(`${result.field}:${result.detail}`);
      return noMatch(params.searchIntentVersionId, dimensions, hardChecks, [result.detail]);
    }
  }

  let weighted = 0;
  let total = 0;
  for (const d of dimensions) {
    if (d.importance === "OPEN" || d.status === "OPEN") continue;
    const w = IMPORTANCE_WEIGHT[d.importance] || 0;
    if (w <= 0) continue;
    total += w;
    weighted += w * d.fit;
  }
  const score = total > 0 ? Math.round((weighted / total) * 100) : 50;

  const identity = dimensions.find((d) => d.field === "vehicleIdentity");
  const price = dimensions.find((d) => d.field === "price");
  const mileage = dimensions.find((d) => d.field === "mileage");
  if (identity && identity.fit < 0.5 && identity.importance !== "OPEN") return noMatch(params.searchIntentVersionId, dimensions, hardChecks, ["זהות רכב לא עומדת בסף קריטי"]);
  if (price && price.critical && price.status !== "UNKNOWN" && price.fit < 0.35) return noMatch(params.searchIntentVersionId, dimensions, hardChecks, ["פער מחיר מסחרי קיצוני"]);

  const decisionBlockingUnknowns = collectDecisionBlockingUnknowns(dimensions);
  const knownFits = dimensions.filter((d) => d.status === "MATCH" || d.status === "PARTIAL").map((d) => d.detail);
  const knownTensions = dimensions.filter((d) => d.status === "MISMATCH" || d.status === "PARTIAL").map((d) => d.detail);

  if (decisionBlockingUnknowns.length > 0) {
    const identityOk = !identity || identity.status === "OPEN" || identity.status === "MATCH" || (identity.status === "PARTIAL" && identity.fit >= 0.85);
    const knownCommercialOk = !price || price.status === "UNKNOWN" || price.status === "OPEN" || price.fit >= 0.5;
    const knownMileageOk = !mileage || mileage.status === "UNKNOWN" || mileage.status === "OPEN" || mileage.status === "MATCH" || mileage.status === "PARTIAL" || (mileage.status === "MISMATCH" && mileage.importance === "PREFERENCE");
    if (identityOk && knownCommercialOk && knownMileageOk) {
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
        whyPotential: `מידע ידוע תומך בפוטנציאל מסחרי, אך חסר: ${decisionBlockingUnknowns.join(", ")}`,
        searchIntentVersionId: params.searchIntentVersionId ?? null,
      };
    }
    return noMatch(params.searchIntentVersionId, dimensions, hardChecks, ["מידע חסר ללא פוטנציאל מסחרי מספיק"]);
  }

  let band: MatchBandV2 = "NO_MATCH";
  if (score >= 88 && identity && identity.fit >= 0.85 && price && price.fit >= 0.65) band = "STRONG";
  else if (score >= 72) band = "GOOD";
  else if (score >= 55) band = "ALTERNATIVE";
  if (band === "NO_MATCH") return noMatch(params.searchIntentVersionId, dimensions, hardChecks, ["ציון כולל נמוך"]);

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

function collectDecisionBlockingUnknowns(dimensions: DimensionFitResult[]): string[] {
  const out: string[] = [];
  for (const d of dimensions) {
    if (d.status !== "UNKNOWN") continue;
    if (d.importance === "OPEN" || d.importance === "PREFERENCE") continue;
    if (d.importance === "HARD" || d.importance === "VERY_HIGH" || d.importance === "HIGH" || (d.importance === "MEDIUM" && d.critical)) out.push(d.field);
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

export function matchBandV2ToScoreBand(
  band: MatchBandV2 | null
): "STRONG" | "GOOD" | "ALTERNATIVE" | "HIDDEN" {
  if (!band || band === "NO_MATCH") return "HIDDEN";
  return band;
}

export const CANONICAL_VEHICLE_FEATURES = [
  "AWD_4X4",
  "SUNROOF",
  "PANORAMIC_ROOF",
  "LEATHER_SEATS",
  "ELECTRIC_SEATS",
  "HEATED_SEATS",
  "VENTILATED_SEATS",
  "ADAPTIVE_CRUISE",
  "LANE_ASSIST",
  "BLIND_SPOT_MONITOR",
  "PARKING_SENSORS",
  "REAR_CAMERA",
  "SURROUND_CAMERA",
  "TOW_BAR",
] as const;

export type CanonicalVehicleFeature = (typeof CANONICAL_VEHICLE_FEATURES)[number];

const FEATURE_SET = new Set<string>(CANONICAL_VEHICLE_FEATURES);

/**
 * Validation-only canonicalizer.
 * IMPORTANT: this layer does NOT interpret aliases or natural language.
 * Semantic normalization belongs to vehicle-feature-intelligence (AI).
 */
export function canonicalizeVehicleFeature(value: string | null | undefined): CanonicalVehicleFeature | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return FEATURE_SET.has(normalized) ? (normalized as CanonicalVehicleFeature) : null;
}

/** Validation + de-duplication of already-canonical AI output only. */
export function canonicalizeVehicleFeatures(values: Array<string | null | undefined>): CanonicalVehicleFeature[] {
  const out = new Set<CanonicalVehicleFeature>();
  for (const value of values) {
    const feature = canonicalizeVehicleFeature(value);
    if (feature) out.add(feature);
  }
  return [...out];
}

/**
 * @deprecated Do not infer feature meaning deterministically from free text.
 * Use normalizeVehicleFeaturesWithAi() from vehicle-feature-intelligence.ts.
 */
export function extractVehicleFeaturesFromText(_rawText: string): CanonicalVehicleFeature[] {
  return [];
}

export function vehicleFeatureLabelHe(feature: string): string {
  const labels: Record<string, string> = {
    AWD_4X4: "4x4 / הנעה כפולה",
    SUNROOF: "חלון גג",
    PANORAMIC_ROOF: "גג פנורמי",
    LEATHER_SEATS: "מושבי עור",
    ELECTRIC_SEATS: "מושבים חשמליים",
    HEATED_SEATS: "מושבים מחוממים",
    VENTILATED_SEATS: "מושבים מאווררים",
    ADAPTIVE_CRUISE: "בקרת שיוט אדפטיבית",
    LANE_ASSIST: "סיוע שמירת נתיב",
    BLIND_SPOT_MONITOR: "ניטור שטח מת",
    PARKING_SENSORS: "חיישני חניה",
    REAR_CAMERA: "מצלמת רוורס",
    SURROUND_CAMERA: "מצלמות 360°",
    TOW_BAR: "וו גרירה",
  };
  return labels[feature] ?? feature;
}

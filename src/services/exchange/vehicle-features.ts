export const CANONICAL_VEHICLE_FEATURES = [
  "AWD_4X4",
  "SUNROOF",
  "PANORAMIC_ROOF",
  "LEATHER_SEATS",
  "ELECTRIC_SEATS",
  "HEATED_SEATS",
  "VENTILATED_SEATS",
  "MEMORY_SEATS",
  "MASSAGE_SEATS",
  "ADAPTIVE_CRUISE",
  "LANE_ASSIST",
  "BLIND_SPOT_MONITOR",
  "PARKING_SENSORS",
  "REAR_CAMERA",
  "SURROUND_CAMERA",
  "PARK_ASSIST",
  "AUTOMATIC_PARKING",
  "TOW_BAR",
  "MATRIX_LED",
  "LED_HEADLIGHTS",
  "HEAD_UP_DISPLAY",
  "DIGITAL_COCKPIT",
  "POWER_TAILGATE",
  "KEYLESS_ENTRY",
  "KEYLESS_START",
  "APPLE_CARPLAY",
  "ANDROID_AUTO",
  "WIRELESS_CARPLAY",
  "PREMIUM_AUDIO",
  "ROOF_RAILS",
  "AIR_SUSPENSION",
  "ADAPTIVE_SUSPENSION",
  "THIRD_ROW_SEATS",
  "SEVEN_SEATS",
  "REMOTE_START",
  "NIGHT_VISION",
] as const;

export type CanonicalVehicleFeature = (typeof CANONICAL_VEHICLE_FEATURES)[number];

const FEATURE_SET = new Set<string>(CANONICAL_VEHICLE_FEATURES);

/** Validation-only canonicalizer. Semantic normalization belongs to the AI layer. */
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

/** @deprecated Semantic feature extraction must go through normalizeVehicleFeaturesWithAi(). */
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
    MEMORY_SEATS: "זיכרונות למושבים",
    MASSAGE_SEATS: "מושבי מסאז׳",
    ADAPTIVE_CRUISE: "בקרת שיוט אדפטיבית",
    LANE_ASSIST: "סיוע שמירת נתיב",
    BLIND_SPOT_MONITOR: "ניטור שטח מת",
    PARKING_SENSORS: "חיישני חניה",
    REAR_CAMERA: "מצלמת רוורס",
    SURROUND_CAMERA: "מצלמות 360°",
    PARK_ASSIST: "סיוע חניה",
    AUTOMATIC_PARKING: "חניה אוטומטית",
    TOW_BAR: "וו גרירה",
    MATRIX_LED: "תאורת Matrix LED",
    LED_HEADLIGHTS: "פנסי LED",
    HEAD_UP_DISPLAY: "תצוגה עילית",
    DIGITAL_COCKPIT: "לוח מחוונים דיגיטלי",
    POWER_TAILGATE: "דלת תא מטען חשמלית",
    KEYLESS_ENTRY: "כניסה ללא מפתח",
    KEYLESS_START: "הנעה ללא מפתח",
    APPLE_CARPLAY: "Apple CarPlay",
    ANDROID_AUTO: "Android Auto",
    WIRELESS_CARPLAY: "CarPlay אלחוטי",
    PREMIUM_AUDIO: "מערכת שמע פרימיום",
    ROOF_RAILS: "מסילות גג",
    AIR_SUSPENSION: "מתלי אוויר",
    ADAPTIVE_SUSPENSION: "מתלים אדפטיביים",
    THIRD_ROW_SEATS: "שורת מושבים שלישית",
    SEVEN_SEATS: "7 מושבים",
    REMOTE_START: "הנעה מרחוק",
    NIGHT_VISION: "ראיית לילה",
  };
  return labels[feature] ?? feature;
}

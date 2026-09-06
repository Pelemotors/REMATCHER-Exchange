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

function clean(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/["'׳״`]/g, "")
    .replace(/[._/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FEATURE_ALIASES: Record<string, CanonicalVehicleFeature> = {
  "4x4": "AWD_4X4",
  "4 x 4": "AWD_4X4",
  "4wd": "AWD_4X4",
  "awd": "AWD_4X4",
  "הנעה כפולה": "AWD_4X4",
  "כפולה": "AWD_4X4",
  "ארבע על ארבע": "AWD_4X4",
  "גג שמש": "SUNROOF",
  "חלון בגג": "SUNROOF",
  "סאנרוף": "SUNROOF",
  "sunroof": "SUNROOF",
  "גג פנורמי": "PANORAMIC_ROOF",
  "פנורמי": "PANORAMIC_ROOF",
  "panoramic roof": "PANORAMIC_ROOF",
  "panorama roof": "PANORAMIC_ROOF",
  "עור": "LEATHER_SEATS",
  "מושבי עור": "LEATHER_SEATS",
  "leather": "LEATHER_SEATS",
  "leather seats": "LEATHER_SEATS",
  "מושבים חשמליים": "ELECTRIC_SEATS",
  "electric seats": "ELECTRIC_SEATS",
  "מושבים מחוממים": "HEATED_SEATS",
  "heated seats": "HEATED_SEATS",
  "מושבים מאווררים": "VENTILATED_SEATS",
  "ventilated seats": "VENTILATED_SEATS",
  "קרוז אדפטיבי": "ADAPTIVE_CRUISE",
  "בקרת שיוט אדפטיבית": "ADAPTIVE_CRUISE",
  "adaptive cruise": "ADAPTIVE_CRUISE",
  "שמירת נתיב": "LANE_ASSIST",
  "תיקון סטייה מנתיב": "LANE_ASSIST",
  "lane assist": "LANE_ASSIST",
  "שטח מת": "BLIND_SPOT_MONITOR",
  "ניטור שטח מת": "BLIND_SPOT_MONITOR",
  "blind spot": "BLIND_SPOT_MONITOR",
  "חיישני חניה": "PARKING_SENSORS",
  "parking sensors": "PARKING_SENSORS",
  "מצלמת רוורס": "REAR_CAMERA",
  "rear camera": "REAR_CAMERA",
  "מצלמות 360": "SURROUND_CAMERA",
  "מצלמת 360": "SURROUND_CAMERA",
  "360 camera": "SURROUND_CAMERA",
  "וו גרירה": "TOW_BAR",
  "tow bar": "TOW_BAR",
};

export function canonicalizeVehicleFeature(value: string | null | undefined): CanonicalVehicleFeature | null {
  if (!value) return null;
  const normalized = clean(value);
  if (!normalized) return null;
  if ((CANONICAL_VEHICLE_FEATURES as readonly string[]).includes(value as CanonicalVehicleFeature)) {
    return value as CanonicalVehicleFeature;
  }
  return FEATURE_ALIASES[normalized] ?? null;
}

export function canonicalizeVehicleFeatures(values: Array<string | null | undefined>): CanonicalVehicleFeature[] {
  const out = new Set<CanonicalVehicleFeature>();
  for (const value of values) {
    const feature = canonicalizeVehicleFeature(value);
    if (feature) out.add(feature);
  }
  if (out.has("PANORAMIC_ROOF")) out.add("SUNROOF");
  return [...out];
}

export function extractVehicleFeaturesFromText(rawText: string): CanonicalVehicleFeature[] {
  const text = clean(rawText);
  const found: CanonicalVehicleFeature[] = [];
  for (const [alias, feature] of Object.entries(FEATURE_ALIASES)) {
    if (text.includes(alias)) found.push(feature);
  }
  return canonicalizeVehicleFeatures(found);
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

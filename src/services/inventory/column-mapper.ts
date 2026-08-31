/** Deterministic column header → vehicle field mapping */

export type VehicleImportField =
  | "make"
  | "model"
  | "trim"
  | "year"
  | "mileage"
  | "color"
  | "b2bPrice"
  | "retailPrice"
  | "region"
  | "ownershipHand"
  | "dealerRefId"
  | "licensePlate"
  | "vin";

const ALIASES: Record<VehicleImportField, string[]> = {
  make: ["make", "manufacturer", "יצרן", "יצר", "מותג"],
  model: ["model", "דגם"],
  trim: ["trim", "version", "גרסה", "רמת גימור", "גימור"],
  year: ["year", "שנה", "שנתון", "שנת ייצור"],
  mileage: ["mileage", "km", "קמ", 'ק"מ', "קילומטראז", "קילומטראז'"],
  color: ["color", "צבע"],
  b2bPrice: ["b2b", "b2bprice", "מחיר b2b", "מחיר סוחר", "מחיר סיטונאי"],
  retailPrice: ["price", "retail", "retailprice", "מחיר", "מחיר קמעונאי", "מחיר מחירון"],
  region: ["region", "city", "אזור", "עיר", "מיקום"],
  ownershipHand: ["hand", "ownership", "יד", "בעלות"],
  dealerRefId: ["id", "ref", "code", "מזהה", "קוד", "מספר פנימי"],
  licensePlate: ["plate", "license", "מספר רישוי", "לוחית", "רישוי"],
  vin: ["vin", "מספר שלדה", "שלדה"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

export function mapHeaders(headers: string[]): Partial<Record<VehicleImportField, number>> {
  const mapping: Partial<Record<VehicleImportField, number>> = {};
  const normalized = headers.map(normalizeHeader);

  for (const [field, aliases] of Object.entries(ALIASES) as [
    VehicleImportField,
    string[],
  ][]) {
    for (let i = 0; i < normalized.length; i++) {
      const h = normalized[i];
      if (aliases.some((a) => h === normalizeHeader(a) || h.includes(normalizeHeader(a)))) {
        if (mapping[field] === undefined) {
          mapping[field] = i;
        }
        break;
      }
    }
  }

  return mapping;
}

export function parseNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && !Number.isNaN(value)) return Math.round(value);
  const s = String(value).replace(/[,\s₪]/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function parseRow(
  row: unknown[],
  mapping: Partial<Record<VehicleImportField, number>>
): Record<VehicleImportField, string | number | null> {
  const get = (field: VehicleImportField) => {
    const idx = mapping[field];
    if (idx === undefined) return null;
    const raw = row[idx];
    if (raw == null || raw === "") return null;
    return raw as string | number;
  };

  return {
    make: get("make") != null ? String(get("make")).trim() : null,
    model: get("model") != null ? String(get("model")).trim() : null,
    trim: get("trim") != null ? String(get("trim")).trim() : null,
    year: parseNumber(get("year")),
    mileage: parseNumber(get("mileage")),
    color: get("color") != null ? String(get("color")).trim() : null,
    b2bPrice: parseNumber(get("b2bPrice")),
    retailPrice: parseNumber(get("retailPrice")),
    region: get("region") != null ? String(get("region")).trim() : null,
    ownershipHand: parseNumber(get("ownershipHand")),
    dealerRefId: get("dealerRefId") != null ? String(get("dealerRefId")).trim() : null,
    licensePlate:
      get("licensePlate") != null ? String(get("licensePlate")).trim() : null,
    vin: get("vin") != null ? String(get("vin")).trim() : null,
  };
}

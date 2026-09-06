/** Deterministic column header / content → vehicle field mapping */

export type VehicleImportField =
  | "make" | "model" | "trim" | "year" | "mileage" | "color"
  | "b2bPrice" | "retailPrice" | "region" | "ownershipHand"
  | "dealerRefId" | "licensePlate" | "vin";

const ALIASES: Record<VehicleImportField, string[]> = {
  make: ["make", "manufacturer", "brand", "יצרן", "יצר", "מותג", "תוצרת"],
  model: ["model", "דגם", "מודל"],
  trim: ["trim", "version", "variant", "גרסה", "רמת גימור", "גימור", "תת דגם"],
  year: ["year", "model year", "שנה", "שנתון", "שנת ייצור", "עליה לכביש", "עלייה לכביש"],
  mileage: ["mileage", "km", "kms", "kilometers", "קמ", 'ק"מ', "קילומטר", "קילומטרים", "קילומטראז", "קילומטראז'", "נסועה"],
  color: ["color", "colour", "צבע"],
  b2bPrice: ["b2b", "b2bprice", "wholesale", "מחיר b2b", "מחיר סוחר", "מחיר לסוחר", "מחיר סיטונאי", "נטו"],
  retailPrice: ["price", "retail", "retailprice", "asking price", "מחיר", "מחיר מכירה", "מחיר מבוקש", "מחיר קמעונאי", "מחיר מחירון"],
  region: ["region", "city", "location", "branch", "אזור", "עיר", "מיקום", "סניף"],
  ownershipHand: ["hand", "ownership", "owners", "יד", "בעלות", "מספר יד"],
  dealerRefId: ["id", "ref", "code", "stock", "stock id", "מזהה", "קוד", "מספר פנימי", "מס מלאי", "מספר מלאי"],
  licensePlate: ["plate", "license", "license plate", "registration", "מספר רישוי", "מס רישוי", "מספר רכב", "לוחית", "רישוי"],
  vin: ["vin", "chassis", "מספר שלדה", "מס שלדה", "שלדה"],
};

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function normalizeHeader(h: string): string {
  return cleanText(h).toLowerCase().replace(/[._:/\\-]+/g, " ").replace(/\s+/g, " ");
}

export function mapHeaders(headers: string[]): Partial<Record<VehicleImportField, number>> {
  const mapping: Partial<Record<VehicleImportField, number>> = {};
  const normalized = headers.map(normalizeHeader);
  for (const [field, aliases] of Object.entries(ALIASES) as [VehicleImportField, string[]][]) {
    for (let i = 0; i < normalized.length; i++) {
      const h = normalized[i];
      if (aliases.some((a) => h === normalizeHeader(a) || h.includes(normalizeHeader(a)))) {
        if (mapping[field] === undefined) mapping[field] = i;
        break;
      }
    }
  }
  return mapping;
}

function numeric(value: unknown): number | null {
  const s = cleanText(value).replace(/[,₪€$£\s]/g, "");
  if (!s || !/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isYear(value: unknown): boolean {
  const n = numeric(value);
  return n != null && Number.isInteger(n) && n >= 1980 && n <= new Date().getFullYear() + 2;
}

function looksLikePlate(value: unknown): boolean {
  const s = cleanText(value).replace(/[-\s]/g, "");
  return /^\d{7,8}$/.test(s);
}

function looksLikeVin(value: unknown): boolean {
  const s = cleanText(value).replace(/\s/g, "").toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(s);
}

function looksLikePrice(value: unknown): boolean {
  const s = cleanText(value);
  const n = numeric(value);
  return n != null && n >= 5000 && n <= 5000000 && (/[₪€$£]/.test(s) || n >= 10000);
}

/**
 * Fallback for dealer exports with no header row. It infers the stable columns
 * from values across several rows. A common Israeli layout is supported:
 * date, plate/ref, make, model, year, km, color, dealer/branch, city, price.
 */
export function inferMappingFromRows(rows: unknown[][]): Partial<Record<VehicleImportField, number>> {
  const sample = rows.filter((r) => r.some((v) => cleanText(v) !== "")).slice(0, 25);
  const mapping: Partial<Record<VehicleImportField, number>> = {};
  if (!sample.length) return mapping;
  const width = Math.max(...sample.map((r) => r.length));
  const score = (i: number, fn: (v: unknown) => boolean) => sample.reduce((n, r) => n + (fn(r[i]) ? 1 : 0), 0);

  let yearIdx = -1;
  let yearScore = 0;
  for (let i = 0; i < width; i++) {
    const s = score(i, isYear);
    if (s > yearScore) { yearScore = s; yearIdx = i; }
  }
  if (yearIdx >= 0 && yearScore >= Math.max(1, Math.ceil(sample.length * 0.4))) {
    mapping.year = yearIdx;
    // Dealer spreadsheets overwhelmingly place make/model directly before year.
    if (yearIdx >= 2) { mapping.make = yearIdx - 2; mapping.model = yearIdx - 1; }
    if (yearIdx + 1 < width) mapping.mileage = yearIdx + 1;
    if (yearIdx + 2 < width) mapping.color = yearIdx + 2;
  }

  for (let i = 0; i < width; i++) {
    if (score(i, looksLikeVin) >= Math.max(1, Math.ceil(sample.length * 0.4))) mapping.vin ??= i;
    if (score(i, looksLikePlate) >= Math.max(1, Math.ceil(sample.length * 0.4))) mapping.licensePlate ??= i;
  }

  // Prefer the right-most price-looking column; exports often contain internal ids earlier.
  for (let i = width - 1; i >= 0; i--) {
    if (i === mapping.mileage || i === mapping.year || i === mapping.licensePlate) continue;
    if (score(i, looksLikePrice) >= Math.max(1, Math.ceil(sample.length * 0.4))) {
      mapping.retailPrice = i;
      break;
    }
  }

  // City/region is commonly immediately before the retail price.
  if (mapping.retailPrice != null && mapping.retailPrice > 0) {
    const idx = mapping.retailPrice - 1;
    const textCount = score(idx, (v) => /[A-Za-z\u0590-\u05ff]/.test(cleanText(v)));
    if (textCount >= Math.max(1, Math.ceil(sample.length * 0.4))) mapping.region = idx;
  }
  return mapping;
}

export function hasUsableHeaderMapping(mapping: Partial<Record<VehicleImportField, number>>): boolean {
  const core = [mapping.make, mapping.model, mapping.year].filter((v) => v !== undefined).length;
  return core >= 2;
}

export function parseNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && !Number.isNaN(value)) return Math.round(value);
  const n = numeric(value);
  return n != null ? Math.round(n) : null;
}

export function parseRow(row: unknown[], mapping: Partial<Record<VehicleImportField, number>>): Record<VehicleImportField, string | number | null> {
  const get = (field: VehicleImportField) => {
    const idx = mapping[field];
    if (idx === undefined) return null;
    const raw = row[idx];
    if (raw == null || cleanText(raw) === "") return null;
    return raw as string | number;
  };
  const text = (field: VehicleImportField) => get(field) != null ? cleanText(get(field)) : null;
  return {
    make: text("make"), model: text("model"), trim: text("trim"), year: parseNumber(get("year")),
    mileage: parseNumber(get("mileage")), color: text("color"), b2bPrice: parseNumber(get("b2bPrice")),
    retailPrice: parseNumber(get("retailPrice")), region: text("region"), ownershipHand: parseNumber(get("ownershipHand")),
    dealerRefId: text("dealerRefId"), licensePlate: text("licensePlate")?.replace(/[-\s]/g, "") ?? null,
    vin: text("vin")?.replace(/\s/g, "").toUpperCase() ?? null,
  };
}

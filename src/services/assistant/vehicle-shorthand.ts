/**
 * Deterministic HIGH-confidence vehicle shorthand normalization.
 * Invention forbidden — only known dealer nicknames / safe year/price patterns.
 */

export type ShorthandHit = {
  make?: string;
  model?: string;
  confidence: "high" | "medium";
};

/** Known model nicknames → make + model (HIGH confidence only). */
const MODEL_ALIASES: Array<{
  pattern: RegExp;
  make: string;
  model: string;
}> = [
  { pattern: /קורולה|corolla/i, make: "Toyota", model: "Corolla" },
  { pattern: /camry|קאמרי/i, make: "Toyota", model: "Camry" },
  { pattern: /rav[\s-]?4|ראב/i, make: "Toyota", model: "RAV4" },
  { pattern: /cx[\s-]?5|סי[\s-]?איקס[\s-]?5/i, make: "Mazda", model: "CX-5" },
  { pattern: /cx[\s-]?3/i, make: "Mazda", model: "CX-3" },
  { pattern: /mazda\s*3|מאזדה\s*3/i, make: "Mazda", model: "3" },
  { pattern: /ספורטאז|sportage/i, make: "Kia", model: "Sportage" },
  { pattern: /טוסון|tucson/i, make: "Hyundai", model: "Tucson" },
  { pattern: /איוניק|ioniq/i, make: "Hyundai", model: "Ioniq" },
  { pattern: /קיה\s*פיקנטו|picanto/i, make: "Kia", model: "Picanto" },
  { pattern: /גולף|golf/i, make: "Volkswagen", model: "Golf" },
  { pattern: /פאסאט|passat/i, make: "Volkswagen", model: "Passat" },
];

const MAKE_ALIASES: Array<{ pattern: RegExp; make: string }> = [
  { pattern: /טויוטה|toyota/i, make: "Toyota" },
  { pattern: /מאזדה|mazda/i, make: "Mazda" },
  { pattern: /יונדאי|hyundai/i, make: "Hyundai" },
  { pattern: /קיה|kia/i, make: "Kia" },
  { pattern: /סקודה|skoda/i, make: "Skoda" },
  { pattern: /פולקסווגן|volkswagen|vw\b/i, make: "Volkswagen" },
  { pattern: /מרצדס|mercedes|benz/i, make: "Mercedes-Benz" },
  { pattern: /ב.?מ.?ו|bmw/i, make: "BMW" },
  { pattern: /אאודי|audi/i, make: "Audi" },
];

export function resolveVehicleShorthand(raw: string): ShorthandHit | null {
  for (const alias of MODEL_ALIASES) {
    if (alias.pattern.test(raw)) {
      return { make: alias.make, model: alias.model, confidence: "high" };
    }
  }
  for (const alias of MAKE_ALIASES) {
    if (alias.pattern.test(raw)) {
      return { make: alias.make, confidence: "high" };
    }
  }
  return null;
}

export function parseYearFromText(raw: string): number | null {
  const full = raw.match(/\b(20[0-3]\d)\b/);
  if (full) return parseInt(full[1], 10);
  // "22" / "'22" near vehicle context — prefer trailing year tokens
  const short = raw.match(/(?:^|[\s,])('?\d{2})(?:\s|$|,)/);
  if (short) {
    let y = parseInt(short[1].replace("'", ""), 10);
    if (y < 100) y += 2000;
    if (y >= 2000 && y <= 2035) return y;
  }
  return null;
}

export function parseMileageFromText(raw: string): number | null {
  const aluf = raw.match(/(\d+(?:[.,]\d+)?)\s*אלף(?:\s*(?:ק["״]?מ|km))?/i);
  if (aluf) return Math.round(parseFloat(aluf[1].replace(",", ".")) * 1000);
  const km = raw.match(/(\d{4,7})\s*(?:ק["״]?מ|km)/i);
  if (km) return parseInt(km[1], 10);
  return null;
}

export function parseDealerPriceFromText(raw: string): number | null {
  const labeled = raw.match(
    /(?:לסוחר(?:ים)?|b\s*2\s*b|בי\s*טו\s*בי)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:אלף)?/i
  );
  if (labeled) {
    let n = parseFloat(labeled[1].replace(",", "."));
    if (/אלף/i.test(labeled[0]) || n < 1000) n *= 1000;
    return Math.round(n);
  }
  const trailing = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:אלף\s*)?לסוחר(?:ים)?/i);
  if (trailing) {
    let n = parseFloat(trailing[1].replace(",", "."));
    if (/אלף/i.test(trailing[0]) || n < 1000) n *= 1000;
    return Math.round(n);
  }
  return null;
}

/**
 * Apply HIGH-confidence shorthand onto partial fields without inventing model
 * when only make is known (e.g. "טויוטה 22" must NOT become Corolla).
 */
export function applyShorthandToFields(
  raw: string,
  fields: {
    make: string | null;
    model: string | null;
    year: number | null;
    mileage: number | null;
    b2bPrice: number | null;
  }
): typeof fields {
  const next = { ...fields };
  const hit = resolveVehicleShorthand(raw);
  if (hit?.model && hit.make) {
    if (!next.make) next.make = hit.make;
    if (!next.model) next.model = hit.model;
  } else if (hit?.make && !hit.model) {
    if (!next.make) next.make = hit.make;
    // do NOT invent model
  }
  if (next.year == null) next.year = parseYearFromText(raw);
  if (next.mileage == null) next.mileage = parseMileageFromText(raw);
  if (next.b2bPrice == null) next.b2bPrice = parseDealerPriceFromText(raw);
  return next;
}

/** Never invent Corolla from Toyota alone */
export function assertNoInventedModel(raw: string, model: string | null): boolean {
  if (!model) return true;
  if (/טויוטה|toyota/i.test(raw) && !/קורולה|corolla|camry|rav|קאמרי/i.test(raw)) {
    if (/corolla/i.test(model)) return false;
  }
  return true;
}

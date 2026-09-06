export type CanonicalFuelType =
  | "GASOLINE"
  | "DIESEL"
  | "HYBRID"
  | "PLUG_IN_HYBRID"
  | "ELECTRIC"
  | "LPG"
  | "CNG"
  | "HYDROGEN"
  | "OTHER";

export type CanonicalOwnershipSource =
  | "PRIVATE"
  | "LEASING"
  | "RENTAL"
  | "COMPANY"
  | "TRADE_IN"
  | "OTHER";

function clean(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function key(value: string | null | undefined): string {
  return clean(value)
    .toLowerCase()
    .replace(/["'׳״`]/g, "")
    .replace(/[._/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MAKE_ALIASES: Record<string, string> = {
  "סקודה": "Skoda", "שקודה": "Skoda", skoda: "Skoda",
  "פולקסווגן": "Volkswagen", "פולקסוואגן": "Volkswagen", "פולקסוגן": "Volkswagen", volkswagen: "Volkswagen",
  "טויוטה": "Toyota", toyota: "Toyota", "יונדאי": "Hyundai", "יונדי": "Hyundai", "יונדיי": "Hyundai", hyundai: "Hyundai",
  "קיה": "Kia", kia: "Kia", "מאזדה": "Mazda", mazda: "Mazda", "מיצובישי": "Mitsubishi", mitsubishi: "Mitsubishi",
  "ניסאן": "Nissan", "ניסן": "Nissan", nissan: "Nissan", "רנו": "Renault", renault: "Renault", "פיגו": "Peugeot", "פיג'ו": "Peugeot", peugeot: "Peugeot",
  "סיאט": "Seat", seat: "Seat", "סוזוקי": "Suzuki", suzuki: "Suzuki", "אאודי": "Audi", audi: "Audi",
  "במוו": "BMW", "ב מ וו": "BMW", bmw: "BMW", "מרצדס": "Mercedes-Benz", mercedes: "Mercedes-Benz", "mercedes benz": "Mercedes-Benz",
  "סובארו": "Subaru", subaru: "Subaru", "הונדה": "Honda", honda: "Honda", "פורד": "Ford", ford: "Ford",
  "שברולט": "Chevrolet", chevrolet: "Chevrolet", "סיטרואן": "Citroen", citroen: "Citroen", "אופל": "Opel", opel: "Opel",
  "וולוו": "Volvo", volvo: "Volvo", "לקסוס": "Lexus", lexus: "Lexus", "ג'יפ": "Jeep", "ג׳יפ": "Jeep", jeep: "Jeep",
  "דאצ'יה": "Dacia", "דאציה": "Dacia", dacia: "Dacia", "טסלה": "Tesla", tesla: "Tesla", "ג'ילי": "Geely", "ג׳ילי": "Geely", geely: "Geely",
  "צ'רי": "Chery", "צ׳רי": "Chery", chery: "Chery", "בי וואי די": "BYD", "ביואידי": "BYD", byd: "BYD"
};

const MODEL_ALIASES: Record<string, string> = {
  "אקסנט": "Accent", accent: "Accent",
  "סופרב": "Superb", superb: "Superb", "אוקטביה": "Octavia", octavia: "Octavia", "קודיאק": "Kodiaq", kodiaq: "Kodiaq", "קארוק": "Karoq", karoq: "Karoq",
  "טוסון": "Tucson", tucson: "Tucson", "ספורטאז": "Sportage", "ספורטאז'": "Sportage", "ספורטז": "Sportage", sportage: "Sportage",
  "קשקאי": "Qashqai", qashqai: "Qashqai", "אקסטרייל": "X-Trail", "x trail": "X-Trail", xtrail: "X-Trail",
  "אאוטלנדר": "Outlander", outlander: "Outlander", "קורולה": "Corolla", corolla: "Corolla", "יאריס": "Yaris", yaris: "Yaris",
  "סוויפט": "Swift", swift: "Swift", "ויטרה": "Vitara", vitara: "Vitara", "גולף": "Golf", golf: "Golf", "טיגואן": "Tiguan", tiguan: "Tiguan",
  "לאון": "Leon", leon: "Leon", "ארונה": "Arona", arona: "Arona", "אטקה": "Ateca", ateca: "Ateca", "מגאן": "Megane", megane: "Megane",
  "קפצור": "Captur", captur: "Captur", "cx5": "CX-5", "cx 5": "CX-5", "סי אקס 5": "CX-5"
};

const FUEL_ALIASES: Record<string, CanonicalFuelType> = {
  "בנזין": "GASOLINE", gasoline: "GASOLINE", petrol: "GASOLINE",
  "דיזל": "DIESEL", diesel: "DIESEL", "סולר": "DIESEL",
  "היברידי": "HYBRID", hybrid: "HYBRID", hev: "HYBRID",
  "פלאג אין": "PLUG_IN_HYBRID", "פלאגאין": "PLUG_IN_HYBRID", phev: "PLUG_IN_HYBRID", "plug in hybrid": "PLUG_IN_HYBRID",
  "חשמלי": "ELECTRIC", electric: "ELECTRIC", ev: "ELECTRIC",
  "גפמ": "LPG", lpg: "LPG", "גז": "LPG",
  cng: "CNG", "מימן": "HYDROGEN", hydrogen: "HYDROGEN"
};

const OWNERSHIP_ALIASES: Record<string, CanonicalOwnershipSource> = {
  "פרטי": "PRIVATE", private: "PRIVATE", privately: "PRIVATE",
  "ליסינג": "LEASING", leasing: "LEASING", lease: "LEASING",
  "השכרה": "RENTAL", rental: "RENTAL", rent: "RENTAL",
  "חברה": "COMPANY", company: "COMPANY", corporate: "COMPANY",
  "טרייד אין": "TRADE_IN", "טריידאין": "TRADE_IN", "trade in": "TRADE_IN", tradein: "TRADE_IN",
};

export function canonicalizeMake(value: string | null | undefined): string | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return MAKE_ALIASES[key(cleaned)] ?? cleaned;
}

export function canonicalizeModel(value: string | null | undefined): string | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return MODEL_ALIASES[key(cleaned)] ?? cleaned;
}

export function canonicalizeVehicleIdentity(input: { make?: string | null; model?: string | null }) {
  return {
    make: canonicalizeMake(input.make),
    model: canonicalizeModel(input.model),
  };
}

export function canonicalizeFuelType(value: string | null | undefined): CanonicalFuelType | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return FUEL_ALIASES[key(cleaned)] ?? "OTHER";
}

export function canonicalizeOwnershipSource(value: string | null | undefined): CanonicalOwnershipSource | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return OWNERSHIP_ALIASES[key(cleaned)] ?? "OTHER";
}

export function ownershipSourceLabelHe(value: string | null | undefined): string | null {
  switch (canonicalizeOwnershipSource(value)) {
    case "PRIVATE": return "פרטי";
    case "LEASING": return "ליסינג";
    case "RENTAL": return "השכרה";
    case "COMPANY": return "חברה";
    case "TRADE_IN": return "טרייד־אין";
    case "OTHER": return value ? clean(value) : "אחר";
    default: return null;
  }
}

export function fuelTypeLabelHe(value: string | null | undefined): string | null {
  switch (value) {
    case "GASOLINE": return "בנזין";
    case "DIESEL": return "דיזל";
    case "HYBRID": return "היברידי";
    case "PLUG_IN_HYBRID": return "פלאג־אין היברידי";
    case "ELECTRIC": return "חשמלי";
    case "LPG": return "גפ״מ";
    case "CNG": return "CNG";
    case "HYDROGEN": return "מימן";
    case "OTHER": return "אחר";
    default: return null;
  }
}

export function normalizeEngineDisplacementCc(value: unknown): number | null {
  if (value == null || value === "") return null;
  const text = String(value).toLowerCase().replace(/,/g, ".");
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  let n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/\b(l|liter|litre|ליטר)\b/.test(text) || n < 20) n *= 1000;
  const cc = Math.round(n);
  return cc >= 400 && cc <= 10000 ? cc : null;
}

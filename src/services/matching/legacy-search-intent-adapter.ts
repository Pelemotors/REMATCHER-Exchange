/**
 * Legacy Demand confirmedJson / DemandConstraint → Search Intent 2.0 adapter.
 */
import type { DemandConstraint } from "@prisma/client";
import { confirmedFromJson, type DemandConfirmed } from "@/lib/demand-display";
import {
  emptyStructuredIntent,
  summarizeIntentHe,
  type StructuredSearchIntent,
} from "@/services/matching/search-intent-types";

/**
 * Matching identity must be language-independent. Inventory normalization commonly
 * stores Latin manufacturer/model names while dealer demand can be entered in Hebrew.
 * Keep this deterministic: no AI/network call is allowed in the matching path.
 */
const VEHICLE_IDENTITY_ALIASES: Record<string, string> = {
  // Makes
  "סקודה": "Skoda",
  "שקודה": "Skoda",
  "פולקסווגן": "Volkswagen",
  "פולקסוואגן": "Volkswagen",
  "פולקסוגן": "Volkswagen",
  "טויוטה": "Toyota",
  "יונדאי": "Hyundai",
  "קיה": "Kia",
  "מאזדה": "Mazda",
  "מיצובישי": "Mitsubishi",
  "ניסאן": "Nissan",
  "ניסן": "Nissan",
  "רנו": "Renault",
  "פיג'ו": "Peugeot",
  "פיגו": "Peugeot",
  "סיאט": "Seat",
  "סוזוקי": "Suzuki",
  "אאודי": "Audi",
  "ב.מ.וו": "BMW",
  "במוו": "BMW",
  "מרצדס": "Mercedes-Benz",
  "סובארו": "Subaru",
  "הונדה": "Honda",
  "פורד": "Ford",
  "שברולט": "Chevrolet",
  "סיטרואן": "Citroen",
  "אופל": "Opel",
  "וולוו": "Volvo",
  "לקסוס": "Lexus",
  "ג'יפ": "Jeep",
  "ג׳יפ": "Jeep",
  "דאצ'יה": "Dacia",
  "דאציה": "Dacia",
  "טסלה": "Tesla",
  "ג'ילי": "Geely",
  "ג׳ילי": "Geely",
  "צ'רי": "Chery",
  "צ׳רי": "Chery",
  "בי.וואי.די": "BYD",
  "ביואידי": "BYD",
  // Common model transliterations where Hebrew and Latin otherwise cannot compare.
  "סופרב": "Superb",
  "אוקטביה": "Octavia",
  "קודיאק": "Kodiaq",
  "קארוק": "Karoq",
  "טוסון": "Tucson",
  "ספורטאז'": "Sportage",
  "ספורטז'": "Sportage",
  "ספורטאז׳": "Sportage",
  "קשקאי": "Qashqai",
  "אקסטרייל": "X-Trail",
  "אאוטלנדר": "Outlander",
  "קורולה": "Corolla",
  "יאריס": "Yaris",
  "סוויפט": "Swift",
  "ויטרה": "Vitara",
  "גולף": "Golf",
  "טיגואן": "Tiguan",
  "לאון": "Leon",
  "ארונה": "Arona",
  "אטקה": "Ateca",
  "מגאן": "Megane",
  "מגאן": "Megane",
  "קפצ'ור": "Captur",
  "קפצ׳ור": "Captur",
};

function canonicalVehicleIdentity(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return VEHICLE_IDENTITY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function legacyToSearchIntent(
  confirmedJson: unknown,
  constraints: DemandConstraint[] = []
): { structuredIntent: StructuredSearchIntent; naturalLanguageSummary: string } {
  const confirmed = confirmedFromJson(confirmedJson);
  const intent = emptyStructuredIntent();

  const canonicalMake = canonicalVehicleIdentity(confirmed.make);
  const canonicalModel = canonicalVehicleIdentity(confirmed.model);

  if (canonicalMake) {
    intent.make = {
      importance: "VERY_HIGH",
      target: canonicalMake,
      provenance: "legacy_adapter",
      confidence: 0.9,
    };
  }
  if (canonicalModel) {
    intent.model = {
      importance: "VERY_HIGH",
      target: canonicalModel,
      provenance: "legacy_adapter",
      confidence: 0.9,
    };
  }
  if (confirmed.yearMin != null || confirmed.yearMax != null) {
    intent.year = {
      importance: "HARD",
      target: confirmed.yearMin ?? confirmed.yearMax ?? null,
      flexibility: {
        hardMin: confirmed.yearMin ?? null,
        hardMax: confirmed.yearMax ?? null,
        comfortableMin: confirmed.yearMin ?? null,
        comfortableMax: confirmed.yearMax ?? null,
      },
      provenance: "legacy_adapter",
      confidence: 0.85,
    };
  }
  if (confirmed.budgetMax != null) {
    const hardMax = Math.round(confirmed.budgetMax * 1.1);
    intent.price = {
      importance: "HIGH",
      target: confirmed.budgetMax,
      flexibility: {
        target: confirmed.budgetMax,
        comfortableMax: confirmed.budgetMax,
        stretchMax: hardMax,
        hardMax,
      },
      provenance: "legacy_adapter",
      confidence: 0.8,
      notes: "Legacy soft +10% budget rule mapped into stretch/hardMax",
    };
  }
  if (confirmed.trimPreference) {
    intent.trim = {
      importance: "PREFERENCE",
      target: confirmed.trimPreference,
      provenance: "legacy_adapter",
    };
  }
  if (confirmed.colorExclusions?.length) {
    intent.color = {
      importance: "HARD",
      exclusions: confirmed.colorExclusions,
      provenance: "legacy_adapter",
    };
  }

  for (const c of constraints) {
    const val = c.value as { description?: string; value?: unknown };
    const field = c.field.toLowerCase();
    if (c.constraintType === "HARD") {
      if (field === "fuel" || field === "engine") {
        intent.fuel = {
          importance: "HARD",
          target: String(val?.value ?? val ?? ""),
          provenance: "legacy_adapter",
        };
      }
      if (field === "mileage" || field === "mileagemax") {
        const n = Number(val?.value ?? val);
        if (Number.isFinite(n)) {
          intent.mileage = {
            importance: "HARD",
            flexibility: { hardMax: n, comfortableMax: n },
            provenance: "legacy_adapter",
          };
        }
      }
    }
    if (c.constraintType === "EXCLUSION" && field === "color") {
      intent.color = {
        importance: "HARD",
        exclusions: [
          ...(intent.color?.exclusions ?? []),
          String(val?.value ?? c.value),
        ],
        provenance: "legacy_adapter",
      };
    }
  }

  return {
    structuredIntent: intent,
    naturalLanguageSummary: summarizeIntentHe(intent),
  };
}

export function searchIntentToLegacyConfirmed(
  intent: StructuredSearchIntent
): DemandConfirmed {
  return {
    make: intent.make?.target ?? null,
    model: intent.model?.target ?? null,
    yearMin:
      intent.year?.flexibility?.hardMin ??
      intent.year?.flexibility?.comfortableMin ??
      (typeof intent.year?.target === "number" ? intent.year.target : null),
    yearMax:
      intent.year?.flexibility?.hardMax ??
      intent.year?.flexibility?.comfortableMax ??
      null,
    budgetMax:
      intent.price?.flexibility?.comfortableMax ??
      intent.price?.target ??
      intent.price?.flexibility?.hardMax ??
      null,
    trimPreference: intent.trim?.target ?? null,
    colorExclusions: intent.color?.exclusions ?? [],
  };
}

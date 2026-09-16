/**
 * Deterministic catalog finance simulation.
 * Not credit approval. No balloon. Retail price only.
 */
export const FINANCE_RATE_USED = 0.099;
export const FINANCE_RATE_NEW_ZERO_KM = 0.084;

export type FinanceConditionClass = "USED" | "NEW_ZERO_KM";

export function getMaxFinanceTerm(
  vehicleYear: number | null | undefined
): number | null {
  if (vehicleYear == null || !Number.isInteger(vehicleYear)) return null;
  if (vehicleYear < 2005) return null;
  if (vehicleYear <= 2020) return 60;
  if (vehicleYear === 2021) return 72;
  if (vehicleYear === 2022) return 84;
  if (vehicleYear >= 2023 && vehicleYear <= 2025) return 100;
  return 120;
}

/**
 * Only mileage === 0 is a reliable NEW/0km signal in this domain.
 * Year is never used to infer newness.
 */
export function classifyFinanceCondition(input: {
  mileage?: number | null;
}): FinanceConditionClass {
  return input.mileage === 0 ? "NEW_ZERO_KM" : "USED";
}

export function getAnnualFinanceRate(cls: FinanceConditionClass): number {
  return cls === "NEW_ZERO_KM" ? FINANCE_RATE_NEW_ZERO_KM : FINANCE_RATE_USED;
}

/** Standard amortizing (Spitzer) payment. r=0 → P/n. */
export function monthlyPaymentSpitzer(
  principal: number,
  annualNominalRate: number,
  n: number
): number {
  if (!Number.isFinite(principal) || principal <= 0) return NaN;
  if (!Number.isFinite(n) || n <= 0) return NaN;
  const r = annualNominalRate / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export function roundIls(amount: number): number {
  return Math.round(amount);
}

export type CatalogFinanceQuote = {
  monthlyIls: number;
  termMonths: number;
  annualRate: number;
  principal: number;
  conditionClass: FinanceConditionClass;
};

export function simulateCatalogFinance(input: {
  enabled: boolean;
  retailPrice?: number | null;
  year?: number | null;
  mileage?: number | null;
}): CatalogFinanceQuote | null {
  if (!input.enabled) return null;
  if (input.retailPrice == null || input.retailPrice <= 0) return null;
  const termMonths = getMaxFinanceTerm(input.year);
  if (!termMonths) return null;
  const conditionClass = classifyFinanceCondition({ mileage: input.mileage });
  const annualRate = getAnnualFinanceRate(conditionClass);
  const monthlyIls = roundIls(
    monthlyPaymentSpitzer(input.retailPrice, annualRate, termMonths)
  );
  if (!Number.isFinite(monthlyIls) || monthlyIls <= 0) return null;
  return {
    monthlyIls,
    termMonths,
    annualRate,
    principal: input.retailPrice,
    conditionClass,
  };
}

export const CATALOG_LEGAL_GENERAL =
  "ט.ל.ח. המידע, המחירים, התמונות ופרטי הרכב באתר נועדו להתרשמות כללית בלבד ועשויים להשתנות. יש לוודא מול הסוחר את פרטי הרכב, זמינותו ומחירו העדכני לפני ביצוע עסקה.";

export const CATALOG_LEGAL_FINANCE =
  "הצגת החזר חודשי, ככל שמופיעה, היא סימולציה משוערת בלבד ואינה מהווה הצעה, התחייבות או אישור למתן אשראי. קבלת מימון, סכומו ותנאיו כפופים לבדיקת זכאות, לאישור ולתנאי הגוף המממן. התנאים המחייבים הם אלה שייקבעו במסמכי העסקה והמימון.";

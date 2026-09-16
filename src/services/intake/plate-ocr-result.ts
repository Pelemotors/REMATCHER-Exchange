/**
 * Deterministic Israeli plate acceptance after vision.
 * The model only proposes digits/text; this module decides whether to trust them.
 * GOV remains canonical for vehicle identity.
 */

export const PLATE_OCR_MIN_CONFIDENCE = 0.85;

export type StructuredPlateProposal = {
  plateNumber?: string | null;
  visibleText?: string | null;
  confidence?: number | null;
};

export type AcceptedPlate = {
  value: string;
  confidence: number;
  rawText?: string;
};

/** Digits only. Punctuation and spaces are ignored. Never pads or invents. */
export function normalizePlateDigits(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function isPlausibleIsraeliPlateDigits(digits: string): boolean {
  return /^\d{7,8}$/.test(digits);
}

/**
 * Extract 7–8 digit plate tokens from free text (visible OCR).
 * Does not guess missing digits.
 */
export function plateTokensFromVisibleText(text: string): string[] {
  if (!text?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\b(\d{2,3}[-\s]?\d{2,3}[-\s]?\d{2,3}|\d{7,8})\b/g;
  for (const m of text.matchAll(re)) {
    const digits = normalizePlateDigits(m[1]);
    if (!isPlausibleIsraeliPlateDigits(digits) || seen.has(digits)) continue;
    seen.add(digits);
    out.push(digits);
  }
  return out;
}

/**
 * Accept a plate only when digits are complete and confident.
 * If plateNumber and visibleText disagree after normalization → reject
 * (a plausible wrong plate is worse than no result).
 */
export function resolveStructuredPlate(
  input: StructuredPlateProposal
): AcceptedPlate | null {
  const fromNumber = normalizePlateDigits(input.plateNumber);
  const fromVisible = plateTokensFromVisibleText(input.visibleText ?? "");
  const visibleJoined = normalizePlateDigits(input.visibleText);
  const confidence =
    typeof input.confidence === "number" &&
    input.confidence >= 0 &&
    input.confidence <= 1
      ? input.confidence
      : null;

  let digits: string | null = null;

  if (isPlausibleIsraeliPlateDigits(fromNumber)) {
    digits = fromNumber;
    if (fromVisible.length > 0 && !fromVisible.includes(fromNumber)) {
      return null;
    }
    if (
      isPlausibleIsraeliPlateDigits(visibleJoined) &&
      visibleJoined !== fromNumber
    ) {
      return null;
    }
  } else if (fromVisible.length === 1) {
    digits = fromVisible[0]!;
  }

  if (!digits || !isPlausibleIsraeliPlateDigits(digits)) return null;

  const agreed =
    fromVisible.length === 0 ||
    fromVisible.includes(digits) ||
    (fromVisible.length === 1 && fromVisible[0] === digits);
  if (!agreed) return null;

  const conf = confidence ?? (fromNumber && fromVisible.includes(fromNumber) ? 0.88 : 0);
  if (conf < PLATE_OCR_MIN_CONFIDENCE) return null;

  return {
    value: digits,
    confidence: conf,
    rawText: input.visibleText?.trim() || fromNumber || undefined,
  };
}

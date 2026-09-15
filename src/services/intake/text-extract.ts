import "server-only";

export type ExtractedField<T> = {
  value: T;
  source: "WHATSAPP_TEXT" | "OCR" | "VISION" | "DEALER";
  confidence: number;
};

/**
 * Deterministic Hebrew commercial extraction from share text.
 * Does not invent plates — only regex evidence with confidence.
 */
export function extractCommercialFromText(text: string): {
  plate?: ExtractedField<string>;
  fields: Record<string, unknown>;
  provenance: Record<string, unknown>;
} {
  const fields: Record<string, unknown> = {};
  const provenance: Record<string, unknown> = {};
  let plate: ExtractedField<string> | undefined;

  if (!text?.trim()) return { fields, provenance };

  // Israeli plates often appear as 12-345-67 / 123-45-678 / 12345678
  const plateMatch = text.match(
    /\b(\d{2,3}[-\s]?\d{2,3}[-\s]?\d{2,3}|\d{7,8})\b/
  );
  if (plateMatch) {
    const digits = plateMatch[1].replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 8) {
      plate = {
        value: digits,
        source: "WHATSAPP_TEXT",
        confidence: digits.length === 7 || digits.length === 8 ? 0.75 : 0.55,
      };
      provenance.detectedPlate = plate;
    }
  }

  const kmMatch = text.match(/(\d{1,3}(?:[,\s]\d{3})*|\d+)\s*ק\W{0,2}מ/i);
  if (kmMatch) {
    const mileage = Number(kmMatch[1].replace(/[,\s]/g, ""));
    if (Number.isFinite(mileage) && mileage > 0 && mileage < 2_000_000) {
      fields.mileage = mileage;
      provenance.mileage = {
        value: mileage,
        source: "WHATSAPP_TEXT",
        confidence: 0.7,
      };
    }
  }

  const priceMatch = text.match(
    /(?:מחיר|מבקש|עד)\s*:?\s*(\d{1,3}(?:[,\s]\d{3})+|\d{4,7})\s*(?:₪|ש["׳״]ח)?/i
  );
  if (!priceMatch) {
    const shekelMatch = text.match(
      /(\d{1,3}(?:[,\s]\d{3})+|\d{5,7})\s*(?:₪|ש["׳״]ח)/
    );
    if (shekelMatch) {
      const price = Number(shekelMatch[1].replace(/[,\s]/g, ""));
      if (Number.isFinite(price) && price >= 1000 && price <= 5_000_000) {
        fields.askingPrice = price;
        provenance.askingPrice = {
          value: price,
          source: "WHATSAPP_TEXT",
          confidence: 0.6,
        };
      }
    }
  } else {
    const price = Number(priceMatch[1].replace(/[,\s]/g, ""));
    if (Number.isFinite(price) && price >= 1000 && price <= 5_000_000) {
      fields.askingPrice = price;
      provenance.askingPrice = {
        value: price,
        source: "WHATSAPP_TEXT",
        confidence: 0.7,
      };
    }
  }

  const handMatch = text.match(/\bיד\s*([1-9]|ראשונה|שניה|שנייה|שלישית)\b/);
  if (handMatch) {
    const map: Record<string, number> = {
      ראשונה: 1,
      שניה: 2,
      שנייה: 2,
      שלישית: 3,
    };
    const hand = map[handMatch[1]] ?? Number(handMatch[1]);
    if (hand >= 1 && hand <= 9) {
      fields.ownershipHand = hand;
      provenance.ownershipHand = {
        value: hand,
        source: "WHATSAPP_TEXT",
        confidence: 0.65,
      };
    }
  }

  return { plate, fields, provenance };
}

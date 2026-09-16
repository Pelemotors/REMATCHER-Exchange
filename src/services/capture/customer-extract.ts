/**
 * Lightweight capture extractors for Customer / Demand cues from shared text.
 * Deterministic heuristics — no invented facts. AI enrichment can refine later.
 */

import { normalizePhoneIL } from "@/lib/phone";

export type CaptureCustomerHints = {
  name: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  demandCue: string | null;
  wantsClose: boolean;
  wantsPause: boolean;
  hardCeilingHint: boolean;
  softBudgetHint: boolean;
  hybridHard: boolean;
  hybridSoft: boolean;
  semanticAlternative: boolean;
};

const PHONE_RE =
  /(?:(?:\+?972[\s-]?)|0)(?:5\d|[2-489])[\s-]?\d{3}[\s-]?\d{4}/g;

const NAME_RE =
  /(?:לקוח|שם|קוראים לו|שמו|שמה)\s*[:\-]?\s*([א-תA-Za-z]{2,}(?:\s+[א-תA-Za-z]{2,}){0,2})/i;

export function extractCustomerHintsFromText(text: string): CaptureCustomerHints {
  const phones = text.match(PHONE_RE) ?? [];
  const rawPhone = phones[0]?.replace(/\s+/g, "") ?? null;
  const nameMatch = text.match(NAME_RE);
  // Fallback: "אחמד מחפש" / "עבור דני"
  let name = nameMatch?.[1]?.trim() ?? null;
  if (!name) {
    const m2 = text.match(
      /(?:^|\s)([א-ת]{2,12})\s+(?:מחפש|מעוניין|רוצה|צריך)/
    );
    name = m2?.[1] ?? null;
  }

  return {
    name,
    phone: rawPhone,
    normalizedPhone: normalizePhoneIL(rawPhone),
    demandCue: text.trim().slice(0, 500) || null,
    wantsClose: /מצאתי כבר|הסתדר|סגור(?:ים)? את החיפוש|כבר לקח/.test(text),
    wantsPause: /חודש הבא|תשים בצד|תעצור|pause|snooze|בהמשך/.test(text),
    hardCeilingHint: /\d+\s*גג|מקסימום\s*\d+|לא יותר מ/.test(text),
    softBudgetHint: /יכול לחרוג|בערך\s*\d+|גמיש|אפשר קצת יותר/.test(text),
    hybridHard: /רק היברידי|היברידי בלבד|חייב היברידי/.test(text),
    hybridSoft: /עדיף היברידי|אם יש היברידי/.test(text),
    semanticAlternative: /או משהו בסגנון|בסגנון|דומה ל|כמו/.test(text),
  };
}

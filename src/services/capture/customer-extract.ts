/**
 * Lightweight capture extractors for Customer / Demand cues from shared text.
 * Deterministic heuristics — no invented facts. AI enrichment can refine later.
 */

import { normalizePhoneIL } from "@/lib/phone";

export type PhoneAttribution = "HEADER" | "MESSAGE" | "UNKNOWN";
export type PhoneConfidence = "high" | "medium" | "low";

export type PhoneCandidate = {
  raw: string;
  normalized: string | null;
  attribution: PhoneAttribution;
  confidence: PhoneConfidence;
};

export type CaptureCustomerHints = {
  name: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  phoneCandidates: PhoneCandidate[];
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

const WHATSAPP_HEADER_RE =
  /^\[\d[^\]]*\]\s*[^:]+:\s*(.*)$/;

const NAME_RE =
  /(?:לקוח|שם|קוראים לו|שמו|שמה)\s*[:\-]?\s*([א-תA-Za-z]{2,}(?:\s+[א-תA-Za-z]{2,}){0,2})/i;

function lineAttribution(line: string, matchIndex: number): PhoneAttribution {
  const header = line.match(WHATSAPP_HEADER_RE);
  if (!header) return "UNKNOWN";
  const bodyStart = line.indexOf(header[1] ?? "");
  if (bodyStart >= 0 && matchIndex >= bodyStart) return "MESSAGE";
  return "HEADER";
}

const OWNERSHIP_PHONE_RE =
  /(?:הטלפון שלי|מספר שלי|זה הנייד שלי|my number is|call me at)/i;

const CUSTOMER_SPEAKER_RE =
  /(?:^|\])[\s]*(?:לקוח|customer|buyer|קונה)\s*[:\-]/i;

function confidenceFor(
  attribution: PhoneAttribution,
  normalized: string | null,
  line: string,
  fullText: string
): PhoneConfidence {
  if (!normalized) return "low";
  if (OWNERSHIP_PHONE_RE.test(line) || OWNERSHIP_PHONE_RE.test(fullText)) {
    return "high";
  }
  if (attribution === "MESSAGE") {
    if (CUSTOMER_SPEAKER_RE.test(line)) return "medium";
    return "low";
  }
  if (attribution === "HEADER") return "medium";
  return "low";
}

export function extractPhoneCandidates(text: string): PhoneCandidate[] {
  const seen = new Set<string>();
  const out: PhoneCandidate[] = [];
  const lines = text.split(/\n/);
  for (const line of lines) {
    const re = new RegExp(PHONE_RE.source, PHONE_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const raw = m[0].replace(/\s+/g, "");
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const normalized = normalizePhoneIL(raw);
      const attribution = lineAttribution(line, m.index);
      out.push({
        raw,
        normalized,
        attribution,
        confidence: confidenceFor(attribution, normalized, line, text),
      });
    }
  }
  return out;
}

function pickPreferredPhone(candidates: PhoneCandidate[]): {
  phone: string | null;
  normalizedPhone: string | null;
} {
  const high = candidates.filter((c) => c.confidence === "high" && c.normalized);
  if (high.length === 1) {
    return { phone: high[0]!.raw, normalizedPhone: high[0]!.normalized };
  }
  if (high.length > 1) {
    return { phone: null, normalizedPhone: null };
  }
  const medium = candidates.filter((c) => c.confidence === "medium" && c.normalized);
  if (medium.length === 1) {
    return { phone: medium[0]!.raw, normalizedPhone: medium[0]!.normalized };
  }
  return { phone: null, normalizedPhone: null };
}

/** Persist only when a single high-confidence ownership-attributed phone is found. */
export function isSafePhoneForPersist(hints: CaptureCustomerHints): boolean {
  const high = hints.phoneCandidates.filter(
    (c) => c.confidence === "high" && c.normalized
  );
  return high.length === 1 && hints.normalizedPhone != null;
}

export function extractCustomerHintsFromText(text: string): CaptureCustomerHints {
  const phoneCandidates = extractPhoneCandidates(text);
  const picked = pickPreferredPhone(phoneCandidates);
  const nameMatch = text.match(NAME_RE);
  let name = nameMatch?.[1]?.trim() ?? null;
  if (!name) {
    const m2 = text.match(
      /(?:^|\s)([א-ת]{2,12})\s+(?:מחפש|מעוניין|רוצה|צריך)/
    );
    name = m2?.[1] ?? null;
  }

  return {
    name,
    phone: picked.phone,
    normalizedPhone: picked.normalizedPhone,
    phoneCandidates,
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

/**
 * Dealer intent for an identified intake candidate.
 * Capture ≠ inventory. Relationship is chosen after identity.
 */
import type { DealerVehicleRelationship } from "@prisma/client";

export type IntakeIntentKind =
  | "OWNED"
  | "OFFERED_TO_ME"
  | "TRADE_IN_CANDIDATE"
  | "EXTERNAL";

export const INTENT_TO_RELATIONSHIP: Record<
  IntakeIntentKind,
  DealerVehicleRelationship
> = {
  OWNED: "OWNED",
  OFFERED_TO_ME: "OFFERED_TO_ME",
  TRADE_IN_CANDIDATE: "TRADE_IN_CANDIDATE",
  EXTERNAL: "EXTERNAL",
};

const INDEX_WORDS: Array<{ re: RegExp; index: number }> = [
  { re: /הראשון|(?<![א-ת])ראשון(?![א-ת])/i, index: 0 },
  { re: /השני|(?<![א-ת])שני(?![א-ת])/i, index: 1 },
  { re: /השלישי|(?<![א-ת])שלישי(?![א-ת])/i, index: 2 },
  { re: /הרביעי|(?<![א-ת])רביעי(?![א-ת])/i, index: 3 },
  { re: /החמישי|(?<![א-ת])חמישי(?![א-ת])/i, index: 4 },
  { re: /השישי|(?<![א-ת])שישי(?![א-ת])/i, index: 5 },
  { re: /השביעי|(?<![א-ת])שביעי(?![א-ת])/i, index: 6 },
];

function detectIntent(fragment: string): IntakeIntentKind | null {
  if (/טרייד|trade/i.test(fragment)) return "TRADE_IN_CANDIDATE";
  if (/מציעים|מציע|offered/i.test(fragment)) return "OFFERED_TO_ME";
  if (/רק בודק|בדיקה|external|רק לבדוק/i.test(fragment)) return "EXTERNAL";
  if (/למלאי|inventory|owned|(?:^|[\s,])שלי(?=[\s,]|$)/i.test(fragment)) {
    return "OWNED";
  }
  return null;
}

export type ParsedIntakeIntent = {
  all?: IntakeIntentKind;
  allExceptLast?: IntakeIntentKind;
  focused?: IntakeIntentKind;
  rest?: IntakeIntentKind;
  discard?: boolean;
  byIndex: Array<{ index: number; intent: IntakeIntentKind }>;
};

export function parseIntakeIntentText(message: string): ParsedIntakeIntent {
  const m = message.trim();
  const byIndex: Array<{ index: number; intent: IntakeIntentKind }> = [];

  if (/מחק|טעות בהעלאה|לא זה|זרוק את זה|תעיף/i.test(m) && !detectIntent(m)) {
    return { discard: true, byIndex };
  }

  if (/כולם\s*(למלאי|שלי)\s*חוץ\s*מהאחרון|כולם שלי חוץ מהאחרון/i.test(m)) {
    return { allExceptLast: "OWNED", byIndex };
  }

  if (/כולם\s*(למלאי|שלי)/i.test(m) || /^כולם שלי$/i.test(m)) {
    return { all: "OWNED", byIndex };
  }
  if (/כולם\s*(מציעים|טרייד|בודק)/i.test(m)) {
    const intent = detectIntent(m);
    if (intent) return { all: intent, byIndex };
  }

  if (/(הראשון|ראשון)\s*ו\s*(השני|שני)\s*(למלאי|שלי)/i.test(m)) {
    byIndex.push({ index: 0, intent: "OWNED" });
    byIndex.push({ index: 1, intent: "OWNED" });
  }

  for (const { re, index } of INDEX_WORDS) {
    if (byIndex.some((x) => x.index === index)) continue;
    const hit = m.match(new RegExp(`(${re.source})(.{0,14})`, "i"));
    if (hit) {
      const intent = detectIntent(hit[0]);
      if (intent) byIndex.push({ index, intent });
    }
  }

  let rest: IntakeIntentKind | undefined;
  const restMatch = m.match(/כל השאר\s*(למלאי|שלי|מציעים(?:\s+לי)?|טרייד|בודק|בדיקה)/i);
  if (restMatch) {
    rest = detectIntent(restMatch[0]) ?? undefined;
  }

  if (byIndex.length > 0) return { byIndex, rest };

  const focused = detectIntent(m);
  return { focused: focused ?? undefined, rest, byIndex };
}

export function intentFromButton(value: string): IntakeIntentKind | null {
  const v = value.trim();
  if (v === "OWNED" || v === "למלאי") return "OWNED";
  if (v === "OFFERED_TO_ME" || v === "מציעים לי") return "OFFERED_TO_ME";
  if (v === "TRADE_IN_CANDIDATE" || v === "טרייד") return "TRADE_IN_CANDIDATE";
  if (v === "EXTERNAL" || v === "רק בודק") return "EXTERNAL";
  return detectIntent(v);
}

export function isDiscardIntent(value: string | undefined | null): boolean {
  const v = (value ?? "").trim();
  return v === "DISCARD" || v === "מחק" || v === "טעות";
}

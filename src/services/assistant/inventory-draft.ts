/**
 * Structured inventory draft for Agent accompaniment.
 * Pure helpers — no DB. Create goes through createVehicleForDealer.
 */

export type InventoryGapId = "mileage" | "b2b_price";

export type InventoryDraftStatus = "DRAFT" | "WAITING_CONFIRMATION";

export interface InventoryDraftFields {
  make: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  mileage: number | null;
  color: string | null;
  ownershipHand: number | null;
  retailPrice: number | null;
  b2bPrice: number | null;
  region: string | null;
}

export interface PendingInventoryDraft {
  status: InventoryDraftStatus;
  sourceText: string;
  fields: InventoryDraftFields;
  askedGaps: InventoryGapId[];
  ambiguities?: string[];
}

export function emptyDraftFields(): InventoryDraftFields {
  return {
    make: null,
    model: null,
    trim: null,
    year: null,
    mileage: null,
    color: null,
    ownershipHand: null,
    retailPrice: null,
    b2bPrice: null,
    region: null,
  };
}

export function hasInventoryIdentity(fields: InventoryDraftFields): boolean {
  return Boolean(fields.make && fields.model && fields.year);
}

export function openGaps(fields: InventoryDraftFields): InventoryGapId[] {
  const gaps: InventoryGapId[] = [];
  if (fields.mileage == null) gaps.push("mileage");
  if (fields.b2bPrice == null && fields.retailPrice != null) {
    gaps.push("b2b_price");
  } else if (fields.b2bPrice == null && fields.retailPrice == null) {
    // no price at all — still offer B2B once as soft guidance
    gaps.push("b2b_price");
  }
  return gaps;
}

/** Next gap to ask: fixed order, never re-ask askedGaps */
export function nextGapToAsk(draft: PendingInventoryDraft): InventoryGapId | null {
  if (!hasInventoryIdentity(draft.fields)) return null;
  const asked = new Set(draft.askedGaps);
  for (const gap of openGaps(draft.fields)) {
    if (!asked.has(gap)) return gap;
  }
  return null;
}

export function gapQuestion(gap: InventoryGapId): string {
  if (gap === "mileage") {
    return 'לא ראיתי קילומטראז׳ — כמה יש על הרכב? אפשר גם לכתוב "לא יודע" ונמשיך.';
  }
  return 'חסר לי מחיר B2B — רוצה להוסיף או להמשיך בלי?';
}

export function isSkipAnswer(message: string): boolean {
  return /^(לא|לא יודע|לא ידוע|דלג|אין|skip|later|אחר כך|תמשיך|תמשיך בלי|בלי)$/i.test(
    message.trim()
  );
}

/** Parse a gap answer into a field update. Returns null if unparseable (not skip). */
export function parseGapAnswer(
  gap: InventoryGapId,
  message: string
): Partial<InventoryDraftFields> | "skip" | null {
  if (isSkipAnswer(message)) return "skip";
  const m = message.trim();

  if (gap === "mileage") {
    const aluf = m.match(/(\d+(?:[.,]\d+)?)\s*אלף/i);
    if (aluf) {
      return { mileage: Math.round(parseFloat(aluf[1].replace(",", ".")) * 1000) };
    }
    const num = m.replace(/[^\d]/g, "");
    if (num) {
      const n = parseInt(num, 10);
      if (n > 0 && n < 2_000_000) return { mileage: n };
    }
    return null;
  }

  // b2b_price — strip label then parse digits
  const cleaned = m.replace(/b\s*2\s*b/gi, "").replace(/לסוחר(ים)?/gi, "");
  const price = cleaned.replace(/[^\d]/g, "");
  if (price) {
    const n = parseInt(price, 10);
    if (n >= 1000 && n < 10_000_000) return { b2bPrice: n };
  }
  return null;
}

/** Detect amendment while WAITING_CONFIRMATION — e.g. "בעצם 58 אלף" */
export function parseAmendment(message: string): Partial<InventoryDraftFields> | null {
  const m = message.trim();
  if (!/בעצם|תקן|שנה|עדכן|actually|change/i.test(m) && !/ק.?מ|קילומטר|b2b|מחיר/i.test(m)) {
    // still allow bare mileage/price corrections in confirm state when clearly numeric
    if (!/^\s*\d/.test(m) && !/\d+\s*אלף/i.test(m)) return null;
  }

  const aluf = m.match(/(\d+(?:[.,]\d+)?)\s*אלף/i);
  if (aluf && /ק.?מ|קילומטר|מייל|mileage|בעצם/i.test(m)) {
    return { mileage: Math.round(parseFloat(aluf[1].replace(",", ".")) * 1000) };
  }

  if (/b2b|לסוחר/i.test(m)) {
    const n = parseInt(m.replace(/[^\d]/g, ""), 10);
    if (n >= 1000) return { b2bPrice: n };
  }

  if (/מחיר.*לקוח|קמעונאי|retail/i.test(m)) {
    const n = parseInt(m.replace(/[^\d]/g, ""), 10);
    if (n >= 1000) return { retailPrice: n };
  }

  const bareAluf = m.match(/(\d+(?:[.,]\d+)?)\s*אלף/i);
  if (bareAluf) {
    return { mileage: Math.round(parseFloat(bareAluf[1].replace(",", ".")) * 1000) };
  }

  return null;
}

function fmtNum(n: number | null): string {
  if (n == null) return "לא ידוע";
  return n.toLocaleString("he-IL");
}

export function buildStructuredSummary(draft: PendingInventoryDraft): string {
  const f = draft.fields;
  const name = [f.make, f.model].filter(Boolean).join(" ") || "רכב";
  const year = f.year != null ? String(f.year) : "שנה לא ידועה";
  const km =
    f.mileage != null ? `${fmtNum(f.mileage)} ק"מ` : 'ק"מ לא ידוע';
  const retail =
    f.retailPrice != null
      ? `מחיר לקוח ${fmtNum(f.retailPrice)}`
      : "מחיר לקוח לא ידוע";
  const b2b =
    f.b2bPrice != null ? `B2B ${fmtNum(f.b2bPrice)}` : "B2B לא ידוע";
  return `${name} | ${year} | ${km} | ${retail} | ${b2b}`;
}

export function canConfirm(draft: PendingInventoryDraft): boolean {
  return hasInventoryIdentity(draft.fields);
}

export function applyFields(
  draft: PendingInventoryDraft,
  patch: Partial<InventoryDraftFields>
): PendingInventoryDraft {
  return {
    ...draft,
    status: "DRAFT",
    fields: { ...draft.fields, ...patch },
  };
}

export function markGapAsked(
  draft: PendingInventoryDraft,
  gap: InventoryGapId
): PendingInventoryDraft {
  if (draft.askedGaps.includes(gap)) return draft;
  return { ...draft, askedGaps: [...draft.askedGaps, gap] };
}

export function advanceDraftAfterGap(
  draft: PendingInventoryDraft,
  gap: InventoryGapId,
  result: Partial<InventoryDraftFields> | "skip"
): PendingInventoryDraft {
  let next = markGapAsked(draft, gap);
  if (result !== "skip") {
    next = applyFields(next, result);
  } else {
    next = { ...next, status: "DRAFT" };
  }
  return next;
}

export function readyForConfirmation(draft: PendingInventoryDraft): boolean {
  return (
    hasInventoryIdentity(draft.fields) && nextGapToAsk(draft) === null
  );
}

/**
 * Structured inventory draft for Agent accompaniment (v2.6).
 * Pure helpers — no DB. Create goes through createVehicleForDealer.
 * Conversational reasoning stays structured — not only in message text.
 */

export type InventoryGapId =
  | "make"
  | "model"
  | "year"
  | "mileage"
  | "dealer_price"
  | "ownership"
  | "trim"
  | "color";

/** @deprecated Use dealer_price — kept for reading older conversation payloads */
export type LegacyInventoryGapId = InventoryGapId | "b2b_price";

export type InventoryDraftStatus = "DRAFT" | "WAITING_CONFIRMATION";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface InventoryDraftFields {
  make: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  mileage: number | null;
  color: string | null;
  ownershipHand: number | null;
  ownershipType: string | null;
  retailPrice: number | null;
  b2bPrice: number | null;
  region: string | null;
}

export interface PendingInventoryDraft {
  status: InventoryDraftStatus;
  sourceText: string;
  fields: InventoryDraftFields;
  /** Gaps already asked (including skipped) — conversational hints, not locks */
  askedGaps: InventoryGapId[];
  /** Explicitly skipped by dealer */
  skippedGaps?: InventoryGapId[];
  ambiguities?: string[];
  /** Selected vehicle when managing updates */
  selectedVehicleId?: string | null;
  /** Other drafts from multi-vehicle input awaiting attention */
  queuedDrafts?: PendingInventoryDraft[];
  lastAskedGap?: InventoryGapId | null;
  interpretationNote?: string | null;
  rejectedInterpretations?: string[];
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
    ownershipType: null,
    retailPrice: null,
    b2bPrice: null,
    region: null,
  };
}

export function hasInventoryIdentity(fields: InventoryDraftFields): boolean {
  return Boolean(fields.make && fields.model && fields.year);
}

function wasResolved(
  draft: PendingInventoryDraft,
  gap: InventoryGapId
): boolean {
  const asked = new Set(normalizeAskedGaps(draft.askedGaps));
  const skipped = new Set(normalizeAskedGaps(draft.skippedGaps ?? []));
  return asked.has(gap) || skipped.has(gap);
}

/** Normalize legacy b2b_price → dealer_price */
export function normalizeAskedGaps(
  gaps: Array<InventoryGapId | "b2b_price" | string>
): InventoryGapId[] {
  return gaps.map((g) => (g === "b2b_price" ? "dealer_price" : g) as InventoryGapId);
}

function missingIdentityGap(fields: InventoryDraftFields): InventoryGapId | null {
  if (!fields.make) return "make";
  if (!fields.model) return "model";
  if (!fields.year) return "year";
  return null;
}

function hasDealerPrice(fields: InventoryDraftFields): boolean {
  return fields.b2bPrice != null || fields.retailPrice != null;
}

function hasOwnership(fields: InventoryDraftFields): boolean {
  return fields.ownershipHand != null || Boolean(fields.ownershipType);
}

/**
 * Would another Dealer have enough reliable info to decide whether to check this vehicle?
 * Identity + high commercial value resolved (filled or skipped) — not schema completeness.
 */
export function isCommerciallyComplete(draft: PendingInventoryDraft): boolean {
  if (!hasInventoryIdentity(draft.fields)) return false;
  const f = draft.fields;
  const mileageOk = f.mileage != null || wasResolved(draft, "mileage");
  const priceOk = hasDealerPrice(f) || wasResolved(draft, "dealer_price");
  const ownershipOk = hasOwnership(f) || wasResolved(draft, "ownership");
  return mileageOk && priceOk && ownershipOk;
}

/** High-value open gaps in commercial priority order (not fixed mileage→B2B only). */
export function openCommercialGaps(draft: PendingInventoryDraft): InventoryGapId[] {
  const f = draft.fields;
  const gaps: InventoryGapId[] = [];

  const idGap = missingIdentityGap(f);
  if (idGap) {
    gaps.push(idGap);
    return gaps;
  }

  if (f.mileage == null && !wasResolved(draft, "mileage")) gaps.push("mileage");
  if (!hasDealerPrice(f) && !wasResolved(draft, "dealer_price")) {
    gaps.push("dealer_price");
  }
  if (!hasOwnership(f) && !wasResolved(draft, "ownership")) {
    gaps.push("ownership");
  }

  // Optional — only after commercially complete path would otherwise confirm
  // (exposed for AI, not auto-asked by default)
  return gaps;
}

/** Next single clarification — dynamic commercial priority */
export function nextGapToAsk(draft: PendingInventoryDraft): InventoryGapId | null {
  if (isCommerciallyComplete(draft)) return null;
  const open = openCommercialGaps(draft);
  return open[0] ?? null;
}

/** @deprecated Prefer openCommercialGaps — kept for older tests */
export function openGaps(fields: InventoryDraftFields): InventoryGapId[] {
  return openCommercialGaps({
    status: "DRAFT",
    sourceText: "",
    fields,
    askedGaps: [],
  });
}

export function gapQuestion(gap: InventoryGapId, fields?: InventoryDraftFields): string {
  switch (gap) {
    case "make":
      return "חסר לי היצרן. מאיזה יצרן הרכב?";
    case "model": {
      const make = fields?.make;
      return make
        ? `הבנתי ${make}${fields?.year ? ` ${fields.year}` : ""}. איזה דגם?`
        : "חסר לי הדגם. איזה דגם?";
    }
    case "year":
      return "חסר לי שנת ייצור. איזו שנה?";
    case "mileage":
      return "חסר לי קילומטראז׳. כמה יש על הרכב?";
    case "dealer_price":
      return "חסר לי מחיר לסוחר. רוצה להוסיף, או להמשיך בלי?";
    case "ownership":
      return "מה המקור של הרכב — פרטי, ליסינג, השכרה או חברה? ואם יש — איזו יד?";
    case "trim":
      return "יש רמת גימור שאתה יודע עליה, או להשאיר בלי?";
    case "color":
      return "יש צבע שכדאי לרשום, או נשאיר בלי?";
    default:
      return "חסר לי עוד פרט קצר — אפשר להשלים?";
  }
}

export function isSkipAnswer(message: string): boolean {
  return /^(לא|לא יודע|לא ידוע|דלג|אין|skip|later|אחר כך|תמשיך|תמשיך בלי|בלי|להשאיר בלי)$/i.test(
    message.trim()
  );
}

export function parseOwnershipAnswer(
  message: string
): Partial<InventoryDraftFields> | "skip" | null {
  if (isSkipAnswer(message)) return "skip";
  const m = message.trim();
  const patch: Partial<InventoryDraftFields> = {};

  const hand =
    m.match(/יד\s*(\d)/i) ||
    m.match(/\b([1-4])\s*יד/i) ||
    (/^([1-4])$/.test(m) ? [m, m] : null);
  if (hand) {
    const n = parseInt(hand[1], 10);
    if (n >= 1 && n <= 9) patch.ownershipHand = n;
  }

  if (/פרטי|פרטית|private/i.test(m)) patch.ownershipType = "private";
  else if (/ליסינג|leasing/i.test(m)) patch.ownershipType = "leasing";
  else if (/השכרה|רנט|rental/i.test(m)) patch.ownershipType = "rental";
  else if (/חברה|company|צי/i.test(m)) patch.ownershipType = "company";

  if (patch.ownershipHand != null || patch.ownershipType) return patch;
  return null;
}

function parsePriceNumber(message: string): number | null {
  const aluf = message.match(/(\d+(?:[.,]\d+)?)\s*אלף/i);
  if (aluf) {
    return Math.round(parseFloat(aluf[1].replace(",", ".")) * 1000);
  }
  const digits = message.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  if (n >= 1000 && n < 10_000_000) return n;
  if (n > 0 && n < 1000) return n * 1000;
  return null;
}

function parseMileageNumber(message: string): number | null {
  const aluf = message.match(/(\d+(?:[.,]\d+)?)\s*אלף/i);
  if (aluf) {
    return Math.round(parseFloat(aluf[1].replace(",", ".")) * 1000);
  }
  const num = message.replace(/[^\d]/g, "");
  if (!num) return null;
  const n = parseInt(num, 10);
  if (n > 0 && n < 2_000_000) return n;
  return null;
}

/** Parse a gap answer into a field update. Returns null if unparseable (not skip). */
export function parseGapAnswer(
  gap: InventoryGapId,
  message: string
): Partial<InventoryDraftFields> | "skip" | null {
  if (isSkipAnswer(message)) return "skip";
  const m = message.trim();

  if (gap === "mileage") {
    const n = parseMileageNumber(m);
    return n != null ? { mileage: n } : null;
  }

  if (gap === "dealer_price") {
    const trailing = m.match(/(\d+(?:[.,]\d+)?)\s*(?:אלף\s*)?לסוחר/i);
    if (trailing) {
      let n = parseFloat(trailing[1].replace(",", "."));
      if (/אלף/i.test(trailing[0]) || n < 1000) n *= 1000;
      return { b2bPrice: Math.round(n) };
    }
    const cleaned = m
      .replace(/b\s*2\s*b/gi, "")
      .replace(/לסוחר(ים)?/gi, "")
      .replace(/מחיר/gi, "");
    const n = parsePriceNumber(cleaned);
    return n != null ? { b2bPrice: n } : null;
  }

  if (gap === "ownership") {
    return parseOwnershipAnswer(m);
  }

  if (gap === "year") {
    const y = m.match(/(20\d{2}|\d{2})/);
    if (!y) return null;
    let year = parseInt(y[1], 10);
    if (year < 100) year += 2000;
    if (year >= 1990 && year <= 2035) return { year };
    return null;
  }

  if (gap === "make") {
    if (m.length >= 2 && m.length < 40) return { make: m };
    return null;
  }

  if (gap === "model") {
    if (m.length >= 1 && m.length < 40) return { model: m };
    return null;
  }

  if (gap === "trim") {
    if (m.length >= 1 && m.length < 60) return { trim: m };
    return null;
  }

  if (gap === "color") {
    if (m.length >= 1 && m.length < 40) return { color: m };
    return null;
  }

  return null;
}

/** Detect amendment while WAITING_CONFIRMATION */
export function parseAmendment(message: string): Partial<InventoryDraftFields> | null {
  const m = message.trim();
  if (
    !/בעצם|תקן|שנה|עדכן|actually|change/i.test(m) &&
    !/ק.?מ|קילומטר|מחיר|לסוחר|b2b|יד|צבע|גימור/i.test(m)
  ) {
    if (!/^\s*\d/.test(m) && !/\d+\s*אלף/i.test(m)) return null;
  }

  const ownership = parseOwnershipAnswer(m);
  if (ownership && ownership !== "skip") return ownership;

  if (/צבע/i.test(m)) {
    const color = m.replace(/.*צבע\s*/i, "").trim();
    if (color) return { color };
  }

  if (/גימור|trim|executive|luxury|comfort/i.test(m)) {
    const trimMatch = m.match(
      /(?:גימור|trim|רמת)\s*[:=]?\s*([^\n,]+)/i
    );
    if (trimMatch) return { trim: trimMatch[1].trim() };
    if (/executive|luxury|comfort|premium/i.test(m)) {
      const t = m.match(/(executive|luxury|comfort|premium)/i);
      if (t) return { trim: t[1] };
    }
  }

  if (/לסוחר|b2b|בי\s*טו/i.test(m)) {
    const n = parsePriceNumber(m);
    if (n != null) return { b2bPrice: n };
  }

  if (/מחיר.*לקוח|קמעונאי|retail/i.test(m)) {
    const n = parsePriceNumber(m);
    if (n != null) return { retailPrice: n };
  }

  if (/ק.?מ|קילומטר|מייל|mileage/i.test(m) || /\d+\s*אלף/i.test(m)) {
    const n = parseMileageNumber(m);
    if (n != null) return { mileage: n };
  }

  return null;
}

function fmtNum(n: number | null): string {
  if (n == null) return "לא ידוע";
  return n.toLocaleString("he-IL");
}

function ownershipLabel(fields: InventoryDraftFields): string | null {
  const parts: string[] = [];
  if (fields.ownershipHand != null) parts.push(`יד ${fields.ownershipHand}`);
  if (fields.ownershipType) {
    const map: Record<string, string> = {
      private: "פרטית",
      leasing: "ליסינג",
      rental: "השכרה",
      company: "חברה",
    };
    parts.push(map[fields.ownershipType] ?? fields.ownershipType);
  }
  return parts.length ? parts.join(" ") : null;
}

export function buildStructuredSummary(draft: PendingInventoryDraft): string {
  const f = draft.fields;
  const name = [f.make, f.model, f.trim].filter(Boolean).join(" ") || "רכב";
  const year = f.year != null ? String(f.year) : "שנה לא ידועה";
  const lines = [`${name} ${year}`.trim()];
  if (f.mileage != null) lines.push(`${fmtNum(f.mileage)} ק״מ`);
  const own = ownershipLabel(f);
  if (own) lines.push(own);
  if (f.b2bPrice != null) lines.push(`מחיר לסוחר ${fmtNum(f.b2bPrice)} ₪`);
  else if (f.retailPrice != null) lines.push(`מחיר לקוח ${fmtNum(f.retailPrice)} ₪`);
  if (f.color) lines.push(`צבע ${f.color}`);
  return lines.join("\n");
}

/** Compact one-line for multi-vehicle lists */
export function buildCompactSummary(draft: PendingInventoryDraft): string {
  const f = draft.fields;
  const name = [f.make, f.model].filter(Boolean).join(" ") || "רכב";
  const year = f.year != null ? String(f.year) : "";
  const bits = [`${name} ${year}`.trim()];
  if (f.mileage != null) bits.push(`${fmtNum(f.mileage)} ק״מ`);
  if (f.b2bPrice != null) bits.push(`מחיר לסוחר ${fmtNum(f.b2bPrice)}`);
  return bits.join(" · ");
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
  const asked = normalizeAskedGaps(draft.askedGaps);
  if (asked.includes(gap)) return { ...draft, lastAskedGap: gap };
  return { ...draft, askedGaps: [...asked, gap], lastAskedGap: gap };
}

export function markGapSkipped(
  draft: PendingInventoryDraft,
  gap: InventoryGapId
): PendingInventoryDraft {
  const skipped = normalizeAskedGaps(draft.skippedGaps ?? []);
  const withAsked = markGapAsked(draft, gap);
  if (skipped.includes(gap)) return withAsked;
  return { ...withAsked, skippedGaps: [...skipped, gap] };
}

export function advanceDraftAfterGap(
  draft: PendingInventoryDraft,
  gap: InventoryGapId,
  result: Partial<InventoryDraftFields> | "skip"
): PendingInventoryDraft {
  if (result === "skip") {
    return markGapSkipped(draft, gap);
  }
  let next = markGapAsked(draft, gap);
  next = applyFields(next, result);
  return next;
}

export function readyForConfirmation(draft: PendingInventoryDraft): boolean {
  return hasInventoryIdentity(draft.fields) && isCommerciallyComplete(draft);
}

/** Split multi-vehicle free text into chunks (never mix fields across vehicles). */
export function splitMultiVehicleText(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*\d.)\]]+\s*/, "").trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    const vehicleish = lines.filter((l) =>
      /\d{2,4}|אלף|לסוחר|b2b|ק.?מ|קורולה|cx|טויוטה|מאזדה|יונדאי|קיה/i.test(l)
    );
    if (vehicleish.length >= 2) return vehicleish;
  }

  // Semicolon / "וגם" separators
  const parts = trimmed
    .split(/\s*(?:;|וגם|,?\s*ו[-–]\s*)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 8);

  if (parts.length >= 2) {
    return parts;
  }

  return [trimmed];
}

export function identityPartialMessage(fields: InventoryDraftFields): string {
  const known: string[] = [];
  const name = [fields.make, fields.model].filter(Boolean).join(" ");
  if (name) known.push(name);
  else if (fields.make) known.push(fields.make);
  if (fields.year) known.push(String(fields.year));
  if (fields.mileage != null) known.push(`עם ${fmtNum(fields.mileage)} ק״מ`);
  if (fields.b2bPrice != null) {
    known.push(`מחיר לסוחר ${fmtNum(fields.b2bPrice)} ₪`);
  } else if (fields.retailPrice != null) {
    known.push(`מחיר ${fmtNum(fields.retailPrice)} ₪`);
  }
  if (fields.color) known.push(`צבע ${fields.color}`);
  const prefix =
    known.length > 0 ? `הבנתי ${known.join(", ")}. ` : "הבנתי חלק מהפרטים. ";

  const gap = missingIdentityGap(fields);
  if (gap === "model" && fields.make) {
    return `${prefix}איזה דגם של ${fields.make}?`;
  }
  if (gap === "make") return `${prefix}מאיזה יצרן?`;
  if (gap === "year") return `${prefix}איזו שנה?`;
  if (gap === "model") return `${prefix}איזה דגם?`;
  return `${prefix}חסר לי עוד פרט זיהוי קצר.`;
}

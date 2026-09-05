/**
 * Deterministic Privacy Sanitizer for Exchange Events / learning payloads.
 * Prefer allow-listed structured fields; strip negotiation/PII categories.
 */
import "server-only";

const BLOCKED_KEY_EXACT = new Set(
  [
    "password",
    "token",
    "phone",
    "email",
    "contactname",
    "businessname",
    "address",
    "conversation",
    "transcript",
    "dealermemory",
    "rawconversation",
    "closingprice",
    "soldprice",
    "saleprice",
    "finalprice",
    "dealprice",
    "actualprice",
    "floorprice",
    "privatefloor",
    "privatenegotiation",
    "negotiation",
    "negotiationoffer",
    "offerprice",
    "margin",
    "profit",
    "dealermargin",
    "discount",
    "typicaldiscount",
    "urgency",
    "privateurgency",
    "financialpressure",
    "cashflow",
    "cashflowpressure",
    "willingness",
    "compromise",
    "customername",
    "customerphone",
    "customerid",
    "idnumber",
    "salary",
    "credit",
    "creditscore",
    "financedocs",
    "financingdetails",
    "payslip",
    "tradeindocs",
  ].map((s) => s.toLowerCase())
);

const BLOCKED_KEY_SUBSTRINGS = [
  "closing",
  "floor",
  "negotiat",
  "margin",
  "profit",
  "urgency",
  "cashflow",
  "customer",
  "salary",
  "credit",
  "transcript",
  "conversation",
  "dealermemory",
];

/** Keys allowed in agent-derived Exchange eventData (allow-list). */
export const EXCHANGE_EVENT_DATA_ALLOWLIST = new Set([
  "outcomeReason",
  "reason",
  "relevanceOutcome",
  "transactionOutcome",
  "fields",
  "updatedFields",
  "requestedFields",
  "openRequestCount",
  "aggregated",
  "note",
  "source",
  "band",
  "engineVersion",
  "searchIntentVersionId",
  "decisionBlockingUnknowns",
  "whyPotential",
  "make",
  "model",
  "year",
  "external",
  "eventKind",
]);

export function isBlockedPrivacyKey(key: string): boolean {
  const k = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (BLOCKED_KEY_EXACT.has(k)) return true;
  return BLOCKED_KEY_SUBSTRINGS.some((s) => k.includes(s));
}

export function sanitizeExchangePayload(
  data: Record<string, unknown> | null | undefined,
  opts?: { allowlistOnly?: boolean }
): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const allowlistOnly = opts?.allowlistOnly ?? false;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isBlockedPrivacyKey(key)) continue;
    if (allowlistOnly && !EXCHANGE_EVENT_DATA_ALLOWLIST.has(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = sanitizeExchangePayload(
        value as Record<string, unknown>,
        opts
      );
      if (nested && Object.keys(nested).length > 0) out[key] = nested;
      continue;
    }
    if (typeof value === "string") {
      const cleaned = scrubProhibitedText(value);
      if (cleaned) out[key] = cleaned;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Remove obvious closing/floor price phrases from free text notes. */
export function scrubProhibitedText(text: string): string {
  let t = text;
  t = t.replace(
    /(סגר(?:תי|נו)?\s*(?:איתו|אותו)?|מכר(?:תי|נו)?\s*(?:בסוף)?|closing\s*price|sold\s*(?:for|at)|floor\s*price|מחיר\s*רצפה|משחרר\s*(?:אותו)?)\s*[^\d]{0,16}\d{2,3}(?:[.,]\d{3})?(?:\s*(?:אלף|k|₪))?/gi,
    "[מחיר פרטי הוסר]"
  );
  return t.trim();
}

export function assertNoProhibitedLearningData(
  payload: unknown
): { ok: true } | { ok: false; reason: string } {
  const json = JSON.stringify(payload ?? {});
  if (/"closingPrice"|"floorPrice"|"soldPrice"|"margin"|"customerPhone"/i.test(json)) {
    return { ok: false, reason: "prohibited_key_present" };
  }
  if (/dealerMemory|rawConversation|transcript/i.test(json)) {
    return { ok: false, reason: "conversation_or_memory_leak" };
  }
  return { ok: true };
}

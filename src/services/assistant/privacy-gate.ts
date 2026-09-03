/**
 * Privacy / fishing gate — REMATCHER owns AUTHORIZATION (deterministic).
 *
 * Architecture rule:
 * - Understanding = Turn Interpreter (what is the dealer asking?)
 * - Authorization = this gate (is network-inventory fishing forbidden?)
 *
 * This gate MUST NOT treat every mention of "רכבים" / "כמה רכבים" as fishing.
 * Own-inventory workflow help ("טמפלייט", "כמה רכבים ביחד") is ALLOWED.
 * Network inventory fishing ("ברשת", "סוחרים אחרים", "יש למישהו") is BLOCKED.
 *
 * Runs before Turn Interpreter for clear network-fishing signals only.
 * Ambiguous product-help text must pass through so the Agent can understand it.
 */

/**
 * Own-inventory / workflow-help signals — never treat as network fishing.
 * Checked FIRST to prevent false positives from broad fishing patterns.
 */
const WORKFLOW_HELP_ALLOW = [
  /טמפלייט|תבנית|פורמט|דוגמ[האה]/i,
  /כמה\s*רכבים\s*(?:ביחד|יחד|בהודעה|לשלוח|לכתוב|אפשר|בבת\s*אחת)/i,
  /(?:לכתוב|לשלוח|להזין|לרשום)\s*(?:לך\s*)?(?:כמה|מספר)?\s*רכבים/i,
  /איך\s*(?:לכתוב|לשלוח|להזין|לרשום|נוח\s*לשלוח)/i,
  /פרטי\s*רכב\s*שצריך/i,
  /יש\s*לי\s+\d+\s+רכבים\s*(?:להוסיף|לשלוח|להעלות)/i,
  /(?:תן|תכין|יכול)\s*(?:לי\s*)?(?:טמפלייט|תבנית|פורמט|דוגמ)/i,
];

/**
 * True network-inventory fishing / inference attacks (I-01, I-19).
 * Require network / other-dealer / hidden-match signals — not bare "רכבים".
 */
const FISHING_PATTERNS = [
  /כמה.*ברשת/i,
  /יש.*ברשת/i,
  /מלאי.*ברשת/i,
  /ברשת.*מלאי/i,
  /מלאי\s*(?:של\s*)?(?:ה)?רשת/i,
  /כל\s*(?:ה)?רכבים\s*(?:שיש\s*)?(?:ל)?סוחרים/i,
  /רכבים\s*(?:של\s*)?(?:סוחרים\s*)?אחרים/i,
  /איזה\s*סוחר\s*(?:מחזיק|יש\s*לו)/i,
  /יש\s*למישהו/i,
  /תראה\s*(?:לי\s*)?(?:את\s*)?(?:כל\s*)?(?:ה)?מלאי/i,
  /למה לא קיבלתי/i,
  /כמה כמעט/i,
  /תעלה תקציב/i,
  /יש רכבים קצת מעל/i,
];

const INFERENCE_PATTERNS = [
  /תעלה.*₪/i,
  /תעלה.*שקל/i,
  /וייפתחו אפשרויות/i,
];

export function isWorkflowHelpRequest(message: string): boolean {
  const m = message.trim();
  return WORKFLOW_HELP_ALLOW.some((p) => p.test(m));
}

export function checkPrivacyGate(message: string): {
  blocked: boolean;
  reason?: "fishing" | "inference";
} {
  const m = message.trim();

  // Own-inventory workflow help must never be classified as network fishing
  if (isWorkflowHelpRequest(m)) {
    return { blocked: false };
  }

  if (FISHING_PATTERNS.some((p) => p.test(m))) {
    return { blocked: true, reason: "fishing" };
  }
  if (INFERENCE_PATTERNS.some((p) => p.test(m))) {
    return { blocked: true, reason: "inference" };
  }
  return { blocked: false };
}

export function privacyBlockedMessage(reason: "fishing" | "inference"): string {
  if (reason === "fishing") {
    return "אני לא מציג את המלאי של הרשת. אם אתה מחפש רכב, אני יכול לפתוח חיפוש ולבדוק אם נוצרת התאמה שאפשר להציג.";
  }
  return "אני יכול לעדכן את החיפוש שלך, אבל אני לא מציג מראש מה קיים ברשת לפני שנוצרת התאמה שמותר להציג.";
}

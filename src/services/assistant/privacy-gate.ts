const FISHING_PATTERNS = [
  /כמה.*ברשת/i,
  /יש.*ברשת/i,
  /כמה רכבים/i,
  /יש למישהו/i,
  /כמה cx/i,
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

export function checkPrivacyGate(message: string): {
  blocked: boolean;
  reason?: "fishing" | "inference";
} {
  const m = message.trim();
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
    return "מלאי הרשת אינו חשוף לחיפוש ישיר. אני יכול לפתוח עבורך חיפוש לפי הקריטריונים שתגדיר.";
  }
  return "אני לא יכול לרמוז על מידע שלא מורשה להצגה. אפשר לבדוק התאמות קיימות או לעדכן חיפוש.";
}

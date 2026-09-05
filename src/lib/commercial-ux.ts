/**
 * Central commercial UX vocabulary — map technical enums to dealer language.
 * Screens must use these helpers; do not invent per-screen labels.
 */

export type CommercialPrimaryState =
  | "needs_action"
  | "waiting_other_side"
  | "has_interest"
  | "mutual_interest"
  | "connection_created"
  | "needs_validation"
  | "active"
  | "expiring_soon"
  | "ended"
  | "sold"
  | "available"
  | "network_searching"
  | "match_found"
  | "missing_info"
  | "has_matches";

export function commercialStateLabel(state: CommercialPrimaryState): string {
  switch (state) {
    case "needs_action":
      return "דורש פעולה";
    case "waiting_other_side":
      return "ממתין לצד השני";
    case "has_interest":
      return "יש עניין";
    case "mutual_interest":
      return "עניין הדדי";
    case "connection_created":
      return "נוצר חיבור";
    case "needs_validation":
      return "דורש אימות";
    case "active":
      return "פעיל";
    case "expiring_soon":
      return "מסתיים בקרוב";
    case "ended":
      return "הסתיים";
    case "sold":
      return "נמכר";
    case "available":
      return "זמין";
    case "network_searching":
      return "הרשת מחפשת";
    case "match_found":
      return "נמצאה התאמה";
    case "missing_info":
      return "מידע חסר";
    case "has_matches":
      return "יש התאמות";
  }
}

export function freshnessToCommercial(
  freshnessState: string
): CommercialPrimaryState {
  if (
    freshnessState === "STALE" ||
    freshnessState === "VALIDATION_REQUIRED"
  ) {
    return "needs_validation";
  }
  return "available";
}

export function vehiclePrimaryState(input: {
  status: string;
  freshnessState: string;
  hasInterest?: boolean;
  hasMatches?: boolean;
  missingB2b?: boolean;
}): { primary: CommercialPrimaryState; secondary?: string } {
  if (input.status === "SOLD" || input.status === "ARCHIVED") {
    return { primary: "sold" };
  }
  if (
    input.freshnessState === "STALE" ||
    input.freshnessState === "VALIDATION_REQUIRED"
  ) {
    return {
      primary: "needs_validation",
      secondary:
        input.freshnessState === "STALE"
          ? "עודכן לפני זמן — צריך לאמת זמינות"
          : "ממתין לאימות",
    };
  }
  if (input.hasInterest) {
    return { primary: "has_interest" };
  }
  if (input.hasMatches) {
    return { primary: "has_matches" };
  }
  if (input.missingB2b) {
    return {
      primary: "missing_info",
      secondary: "חסר מחיר",
    };
  }
  return { primary: "available" };
}

export function matchLaneLabel(
  lane: "action" | "waiting" | "history"
): string {
  switch (lane) {
    case "action":
      return "דורש ממני פעולה";
    case "waiting":
      return "ממתין לצד השני";
    case "history":
      return "היסטוריה";
  }
}

export function interestLane(
  status: string | null | undefined,
  revealId?: string | null
): "action" | "waiting" | "history" {
  if (revealId) return "history";
  if (!status || status === "NO_RESPONSE") return "action";
  if (status === "INTERESTED") return "waiting";
  return "history";
}

export function relativeDaysAgo(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}

export const EMPTY_COPY = {
  inventory: {
    title: "אין עדיין רכבים במלאי",
    description:
      "כדי ש-REMATCHER יוכל לזהות ביקושים מתאימים ברקע, הוסף את הרכב הראשון שלך.",
  },
  inventoryFilter: {
    title: "לא נמצאו רכבים שמתאימים לסינון הזה",
    description: "נסה סינון אחר או נקה את הסינון.",
  },
  matches: {
    title: "עדיין לא נמצאה התאמה",
    description: "REMATCHER ממשיך לבדוק את הרשת מול החיפושים שלך.",
  },
  activity: {
    title: "עדיין אין פעילות",
    description:
      "ברגע שתהיה התאמה, עניין או בקשה לפעולה — היא תופיע כאן.",
  },
  demandActivated: {
    title: "החיפוש הופעל",
    body: "REMATCHER בודק עכשיו את הרשת. אם תימצא התאמה תקבל עדכון.",
  },
} as const;

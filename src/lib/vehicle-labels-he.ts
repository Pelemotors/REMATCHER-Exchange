/**
 * Human Hebrew labels for Ownership (relationship) ≠ Visibility.
 * Never show raw DB enums to dealers.
 */

export type DealerRelationshipCode =
  | "OWNED"
  | "INVENTORY"
  | "OFFERED_TO_ME"
  | "TRADE_IN_CANDIDATE"
  | "EXTERNAL"
  | string;

export type VisibilityCode = "PRIVATE" | "ANONYMOUS_NETWORK" | string;

export function relationshipLabelHe(code: DealerRelationshipCode): string {
  switch (code) {
    case "OWNED":
      return "הרכב שלי";
    case "INVENTORY":
      return "במלאי";
    case "OFFERED_TO_ME":
      return "שוקל לקנות";
    case "TRADE_IN_CANDIDATE":
      return "טרייד מלקוח";
    case "EXTERNAL":
      return "בדיקה בלבד";
    default:
      return "רכב";
  }
}

export function visibilityLabelHe(code: VisibilityCode): string {
  switch (code) {
    case "ANONYMOUS_NETWORK":
      return "פעיל ברשת";
    case "PRIVATE":
      return "פרטי";
    default:
      return "פרטי";
  }
}

export function relationshipTone(
  code: DealerRelationshipCode
): "owned" | "offered" | "trade" | "private" {
  switch (code) {
    case "OWNED":
    case "INVENTORY":
      return "owned";
    case "OFFERED_TO_ME":
      return "offered";
    case "TRADE_IN_CANDIDATE":
      return "trade";
    default:
      return "private";
  }
}

export function demandStatusLabelHe(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "פעיל";
    case "PAUSED":
      return "מושהה";
    case "CLOSED":
    case "CANCELLED":
      return "סגור";
    case "EXPIRED":
      return "פג תוקף";
    case "PENDING_CONFIRMATION":
      return "ממתין לאישור";
    case "DRAFT":
      return "טיוטה";
    default:
      return status;
  }
}

export function demandNetworkLabelHe(visibility: string): string {
  return visibility === "ANONYMOUS_NETWORK" ? "ברשת" : "פרטי";
}

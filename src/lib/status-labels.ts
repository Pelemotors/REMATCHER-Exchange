/** Dealer-facing Hebrew labels for internal enums */

export function freshnessLabel(state: string): string {
  switch (state) {
    case "FRESH":
      return "מעודכן";
    case "STALE":
      return "דורש אימות זמינות";
    case "VALIDATION_REQUIRED":
      return "ממתין לאימות";
    default:
      return "לא אומת";
  }
}

export function vehicleStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "פעיל";
    case "SOLD":
      return "נמכר";
    case "ARCHIVED":
      return "בארכיון";
    default:
      return status;
  }
}

export function demandStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "חיפוש פעיל";
    case "EXPIRED":
      return "הסתיים";
    case "PENDING_CONFIRMATION":
      return "ממתין לאישור";
    case "CANCELLED":
      return "בוטל";
    default:
      return "טיוטה";
  }
}

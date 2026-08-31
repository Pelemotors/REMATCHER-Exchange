/** Pure copy helpers — testable, dealer-facing Hebrew */

export function connectionsUsedLabel(used: number, total: number): string {
  return `נוצלו ${used} מתוך ${total} חיבורים`;
}

export function connectionsRemainingSecondary(
  used: number,
  total: number,
  onboarding = total <= 5
): string {
  const remaining = Math.max(0, total - used);
  return onboarding
    ? `נותרו לך ${remaining} חיבורים ללא עלות`
    : `נותרו ${remaining} חיבורים`;
}

export function connectionsMonthlyUsedLabel(used: number, total: number): string {
  return `נוצלו ${used} מתוך ${total} חיבורים החודש`;
}

export function verificationLabel(
  status: string | null | undefined
): string {
  switch (status) {
    case "VERIFIED":
      return "סוחר מאומת";
    case "REJECTED":
    case "DISABLED":
      return "נדרש אימות";
    case "PENDING":
    default:
      return "האימות בבדיקה";
  }
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

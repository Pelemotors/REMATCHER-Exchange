import { describe, it, expect } from "vitest";
import {
  connectionsMonthlyUsedLabel,
  connectionsRemainingSecondary,
  connectionsUsedLabel,
  isAdminRole,
  verificationLabel,
} from "@/lib/brand-copy";

describe("Brand copy helpers", () => {
  it("connectionsUsedLabel for onboarding", () => {
    expect(connectionsUsedLabel(0, 5)).toBe("נוצלו 0 מתוך 5 חיבורים");
    expect(connectionsUsedLabel(1, 5)).toBe("נוצלו 1 מתוך 5 חיבורים");
  });

  it("connectionsRemainingSecondary for onboarding", () => {
    expect(connectionsRemainingSecondary(0, 5, true)).toBe(
      "נותרו לך 5 חיבורים ללא עלות"
    );
    expect(connectionsRemainingSecondary(1, 5, true)).toBe(
      "נותרו לך 4 חיבורים ללא עלות"
    );
  });

  it("connectionsMonthlyUsedLabel for paid plan", () => {
    expect(connectionsMonthlyUsedLabel(8, 15)).toBe(
      "נוצלו 8 מתוך 15 חיבורים החודש"
    );
  });

  it("verificationLabel maps enum to Hebrew", () => {
    expect(verificationLabel("VERIFIED")).toBe("סוחר מאומת");
    expect(verificationLabel("PENDING")).toBe("האימות בבדיקה");
    expect(verificationLabel("REJECTED")).toBe("נדרש אימות");
  });

  it("isAdminRole", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("DEALER_USER")).toBe(false);
  });
});

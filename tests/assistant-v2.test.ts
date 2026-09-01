import { describe, it, expect } from "vitest";
import { checkPrivacyGate } from "@/services/assistant/privacy-gate";
import {
  isConfirmation,
  resolveListReference,
} from "@/services/assistant/conversation-state";

describe("Assistant V2 privacy gate", () => {
  it("blocks network inventory fishing", () => {
    const result = checkPrivacyGate("כמה CX-5 יש ברשת?");
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("fishing");
  });

  it("allows authorized activity questions", () => {
    const result = checkPrivacyGate("מה כדאי לי לעשות עכשיו?");
    expect(result.blocked).toBe(false);
  });

  it("blocks inference leakage hints", () => {
    const result = checkPrivacyGate("תעלה 5,000 ₪ וייפתחו אפשרויות");
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("inference");
  });
});

describe("Assistant V2 conversation state", () => {
  it("resolves first list reference", () => {
    const item = resolveListReference("תחדש את הראשון", {
      lastList: [
        { id: "d1", title: "מאזדה CX-5", type: "demand" },
        { id: "d2", title: "טויוטה קורולה", type: "demand" },
      ],
    });
    expect(item?.id).toBe("d1");
  });

  it("detects confirmation", () => {
    expect(isConfirmation("כן")).toBe(true);
    expect(isConfirmation("לא")).toBe(false);
  });
});

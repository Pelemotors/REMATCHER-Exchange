import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  intentFromButton,
  parseIntakeIntentText,
  INTENT_TO_RELATIONSHIP,
} from "@/services/intake/intent";

describe("intake intent parsing", () => {
  it("maps buttons to domain relationships", () => {
    expect(intentFromButton("למלאי")).toBe("OWNED");
    expect(intentFromButton("להוסיף למלאי")).toBe("OWNED");
    expect(intentFromButton("מציעים לי")).toBe("OFFERED_TO_ME");
    expect(intentFromButton("שוקל לקנות")).toBe("OFFERED_TO_ME");
    expect(intentFromButton("טרייד")).toBe("TRADE_IN_CANDIDATE");
    expect(intentFromButton("טרייד מלקוח")).toBe("TRADE_IN_CANDIDATE");
    expect(intentFromButton("רק בודק")).toBe("EXTERNAL");
    expect(intentFromButton("בדיקה בלבד")).toBe("EXTERNAL");
    expect(INTENT_TO_RELATIONSHIP.OWNED).toBe("OWNED");
    expect(INTENT_TO_RELATIONSHIP.EXTERNAL).toBe("EXTERNAL");
  });

  it("כולם למלאי is explicit all-owned, never a default", () => {
    expect(parseIntakeIntentText("כולם למלאי").all).toBe("OWNED");
    expect(parseIntakeIntentText("בדוק את התמונות").all).toBeUndefined();
  });

  it("כולם שלי חוץ מהאחרון is allExceptLast", () => {
    expect(parseIntakeIntentText("כולם שלי חוץ מהאחרון").allExceptLast).toBe(
      "OWNED"
    );
  });

  it("maps הראשון למלאי והשני טרייד", () => {
    const p = parseIntakeIntentText("הראשון למלאי והשני טרייד");
    expect(p.byIndex).toEqual(
      expect.arrayContaining([
        { index: 0, intent: "OWNED" },
        { index: 1, intent: "TRADE_IN_CANDIDATE" },
      ])
    );
  });

  it("maps rest of batch", () => {
    const p = parseIntakeIntentText(
      "הראשון והשני למלאי השלישי טרייד וכל השאר מציעים לי"
    );
    expect(p.byIndex.find((x) => x.index === 2)?.intent).toBe("TRADE_IN_CANDIDATE");
    expect(p.rest).toBe("OFFERED_TO_ME");
  });

  it("process-batch never auto-commits inventory", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/intake/process-batch.ts"),
      "utf8"
    );
    expect(src).not.toContain("commitReadyCandidates");
    expect(src).toContain("autoCommit: false");
  });

  it("intent API exists and requires dealer auth", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/api/intake/intent/route.ts"),
      "utf8"
    );
    expect(src).toContain("requireVerifiedDealer");
    expect(src).toContain("applyIntakeIntents");
  });
});

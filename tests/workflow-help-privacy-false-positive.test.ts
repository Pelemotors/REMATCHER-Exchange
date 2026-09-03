/**
 * Privacy false-positive + workflow help + multi-vehicle input tests.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/ai/client", () => ({
  callOpenAIStructured: vi.fn(),
  isOpenAIConfigured: () => false,
  logAiOperation: vi.fn(),
}));
vi.mock("@/services/notifications", () => ({
  logAppEvent: vi.fn(),
}));

import {
  checkPrivacyGate,
  isWorkflowHelpRequest,
  privacyBlockedMessage,
} from "@/services/assistant/privacy-gate";
import { interpretTurnFallback } from "@/services/assistant/turn-interpreter";
import { handleInventoryIngestTurn } from "@/services/assistant/inventory-ingest";
import { splitMultiVehicleText } from "@/services/assistant/inventory-draft";

describe("Privacy gate — false positives vs real fishing", () => {
  it("PRODUCTION BUG: template request is NOT fishing", () => {
    const msg =
      "כדי לכתוב לך כמה רכבים ביחד ?\nיכול להכין לי טמפלייט של פרטי רכב שצריך לכתוב ?";
    expect(isWorkflowHelpRequest(msg)).toBe(true);
    expect(checkPrivacyGate(msg).blocked).toBe(false);
  });

  it("allows workflow help phrases", () => {
    const allowed = [
      "כמה רכבים אפשר לשלוח לך ביחד?",
      "תן לי טמפלייט למלאי",
      "איזה פרטים צריך לכתוב לכל רכב?",
      "יש לי 5 רכבים להוסיף",
      "איך הכי נוח לשלוח לך רשימת רכבים?",
      "תכין לי פורמט למלאי",
    ];
    for (const msg of allowed) {
      expect(checkPrivacyGate(msg).blocked, msg).toBe(false);
    }
  });

  it("still blocks true network fishing", () => {
    const forbidden = [
      "תראה לי את כל הרכבים שיש לסוחרים אחרים",
      "איזה סוחר מחזיק קורולה?",
      "תן לי רשימה של המלאי ברשת",
      "כמה CX-5 יש ברשת?",
      "כמה ספורטאז' יש ברשת?",
      "יש למישהו קורולה?",
    ];
    for (const msg of forbidden) {
      const res = checkPrivacyGate(msg);
      expect(res.blocked, msg).toBe(true);
      expect(res.reason).toBe("fishing");
    }
    expect(privacyBlockedMessage("fishing")).toContain("המלאי של הרשת");
  });

  it("does NOT block bare 'כמה רכבים' when part of own-inventory help", () => {
    // Old bug: /כמה רכבים/i alone blocked everything
    expect(checkPrivacyGate("כמה רכבים אפשר לשלוח לך ביחד?").blocked).toBe(
      false
    );
  });
});

describe("Workflow help — INPUT_FORMAT advisory", () => {
  const baseMeta = () => ({
    agentVersion: "2.7",
    plannerUsed: false,
    synthesizerUsed: false,
    model: null,
    tools: [] as string[],
    toolDurations: {},
    plannerDurationMs: 0,
    synthesisDurationMs: 0,
    fallbackReason: null,
    responseType: "read" as const,
  });

  it("classifies template request as ADVISORY_QUESTION / INPUT_FORMAT", () => {
    const event = interpretTurnFallback({
      message:
        "כדי לכתוב לך כמה רכבים ביחד?\nיכול להכין לי טמפלייט של פרטי רכב שצריך לכתוב?",
      inventoryMode: true,
    });
    expect(event.relation).toBe("ADVISORY_QUESTION");
    expect(event.questionAbout).toBe("INPUT_FORMAT");
    expect(event.intent).toBe("help");
  });

  it("returns multi-vehicle template, not privacy block copy", async () => {
    const turn = interpretTurnFallback({
      message: "תן לי טמפלייט למלאי",
      inventoryMode: true,
    });
    const result = await handleInventoryIngestTurn({
      dealerId: "d1",
      userId: "u1",
      message: "תן לי טמפלייט למלאי",
      conversation: {
        sessionContext: {
          forcedIntent: "create_inventory",
          operatingMode: "inventory_management",
        },
      },
      meta: baseMeta(),
      turn,
      forceStart: true,
    });

    expect(result).not.toBeNull();
    expect(result!.message).toMatch(/שורה נפרדת|לדוגמה|לסוחר/);
    expect(result!.message).not.toContain("המלאי של הרשת");
    expect(result!.privacyBlocked).toBeUndefined();
  });
});

describe("Multi-vehicle input splitting", () => {
  it("splits pipe-separated vehicle lines without mixing fields", () => {
    const raw = `טויוטה קורולה | 2022 | 62 אלף ק"מ | יד 1 פרטית | 134 אלף לסוחר
מאזדה 3 | 2021 | 75 אלף | יד 2 | 92 לסוחר
קיה ספורטאז' | 2023 | 40 אלף | יד 1 | 145 לסוחר`;
    const chunks = splitMultiVehicleText(raw);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatch(/קורולה/);
    expect(chunks[1]).toMatch(/מאזדה/);
    expect(chunks[2]).toMatch(/ספורטאז/);
    // No field mixing — each line keeps its own year/price tokens
    expect(chunks[0]).toMatch(/2022/);
    expect(chunks[0]).not.toMatch(/2021/);
    expect(chunks[1]).toMatch(/2021/);
    expect(chunks[1]).not.toMatch(/2023/);
  });

  it("returns single chunk when only one vehicle", () => {
    const chunks = splitMultiVehicleText("טויוטה קורולה 22, 62 אלף, 134 לסוחר");
    expect(chunks).toHaveLength(1);
  });
});

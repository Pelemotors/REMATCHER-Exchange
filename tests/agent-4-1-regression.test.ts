/**
 * Agent 4.1 regression — intake grouping, trade-in, diagnostics, tools, deadline.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("server-only", () => ({}));

import { planCandidateSlots } from "@/services/intake/grouping";
import { parsePlateCandidatesFromOcrText } from "@/services/intake/plate-ocr";
import {
  summarizeIntentHe,
  sanitizeTradeInOutOfOwnership,
  type StructuredSearchIntent,
} from "@/services/matching/search-intent-types";
import { buildSummaryHe } from "@/services/matching/match-diagnostics";
import { parseDemandFallback } from "@/services/ai/demand-parser";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";
import { AGENT_OPENAI_TOOLS } from "@/services/assistant/agent-tools";
import { AGENT_LOOP_DEADLINE_MS } from "@/config/product";
import { isSafeInternalPath } from "@/lib/deep-links";

const root = join(__dirname, "..");

describe("Agent 4.1 — version & tools", () => {
  it("AGENT_VERSION is 4.1", () => {
    expect(AGENT_VERSION).toBe("4.1");
  });

  it("intake + diagnose tools are registered in AGENT_OPENAI_TOOLS", () => {
    const names = AGENT_OPENAI_TOOLS.map((t) =>
      t.type === "function" ? t.function.name : ""
    );
    expect(names).toContain("get_my_intake_batches");
    expect(names).toContain("get_my_intake_candidates");
    expect(names).toContain("get_my_intake_candidate");
    expect(names).toContain("diagnose_my_search_matches");
    expect(names).toContain("get_my_attention_opportunities");
  });

  it("deadline constant exists", () => {
    expect(AGENT_LOOP_DEADLINE_MS).toBe(45000);
  });

  it("deep-link /intake still safe", () => {
    expect(isSafeInternalPath("/intake")).toBe(true);
    expect(isSafeInternalPath("/intake/review")).toBe(true);
    expect(isSafeInternalPath("/intake/handoff")).toBe(true);
    expect(isSafeInternalPath("//evil")).toBe(false);
  });
});

describe("Agent 4.1 — intake grouping", () => {
  it("12 media 0 plates → 1 slot", () => {
    const slots = planCandidateSlots({
      plates: [],
      mediaCount: 12,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.reason).toBe("unplated_batch");
    expect(slots[0]!.plate).toBeNull();
  });

  it("2 distinct plates → 2 slots", () => {
    const slots = planCandidateSlots({
      plates: [
        { value: "1234567", confidence: 0.9, source: "OCR" },
        { value: "7654321", confidence: 0.85, source: "OCR" },
      ],
      mediaCount: 8,
    });
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.reason === "distinct_plate")).toBe(true);
  });
});

describe("Agent 4.1 — plate OCR parse", () => {
  it("parsePlateCandidatesFromOcrText extracts 7–8 digit plates", () => {
    const found = parsePlateCandidatesFromOcrText(
      "רכב עם לוחית 12-345-67 וגם 12345678"
    );
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some((p) => p.value.replace(/\D/g, "").length >= 7)).toBe(
      true
    );
  });
});

describe("Agent 4.1 — trade-in not ownershipSource", () => {
  it("summarizeIntentHe mentions trade-in separately", () => {
    const intent: StructuredSearchIntent = {
      schemaVersion: 2,
      make: { importance: "HARD", target: "Mazda" },
      model: { importance: "HARD", target: "CX-5" },
      customerTradeIn: {
        make: "Toyota",
        model: "Corolla",
        year: 2018,
        provenance: "user_stated",
      },
    };
    const s = summarizeIntentHe(intent);
    expect(s).toContain("טרייד-אין לקוח");
    expect(s).not.toMatch(/מקוריות.*TRADE_IN/i);
  });

  it("sanitizeTradeInOutOfOwnership moves TRADE_IN off ownershipSource", () => {
    const cleaned = sanitizeTradeInOutOfOwnership({
      schemaVersion: 2,
      ownershipSource: {
        importance: "MEDIUM",
        target: "TRADE_IN",
        provenance: "agent_inferred",
      },
    });
    expect(cleaned.ownershipSource).toBeUndefined();
    expect(cleaned.customerTradeIn).toBeTruthy();
  });

  it("parseDemandFallback does not put trade-in into ownershipSource soft prefs", () => {
    const parsed = parseDemandFallback(
      "מחפש מאזדה cx5 עם טרייד אין של הלקוח"
    );
    expect(parsed.customerTradeIn).toBeTruthy();
    const ownSoft = parsed.softPreferences.filter(
      (c) => c.field === "ownershipSource"
    );
    expect(
      ownSoft.every((c) => !/TRADE_IN|trade|טרייד/i.test(String(c.value ?? "")))
    ).toBe(true);
    expect(parsed.ownershipType?.value).not.toBe("TRADE_IN");
  });
});

describe("Agent 4.1 — diagnose summary structure", () => {
  it("buildSummaryHe returns Hebrew summary fields", () => {
    const withMatches = buildSummaryHe({
      bandMatches: 3,
      evaluated: 100,
      nearMatches: [],
      hardFailTotals: [],
    });
    expect(withMatches).toContain("התאמות");
    expect(withMatches).toContain("100");

    const near = buildSummaryHe({
      bandMatches: 0,
      evaluated: 50,
      nearMatches: [
        {
          failField: "year",
          failDetail: "מתחת למינימום",
          count: 12,
          examples: ["שנה 2019"],
        },
      ],
      hardFailTotals: [{ field: "year", count: 40 }],
    });
    expect(near).toContain("year");
    expect(near).toContain("12");
  });
});

describe("Agent 4.1 — OCR fixture path", () => {
  it("extractPlateFromImageBytes respects INTAKE_OCR_TEXT_OVERRIDE", async () => {
    const prev = process.env.INTAKE_OCR_TEXT_OVERRIDE;
    process.env.INTAKE_OCR_TEXT_OVERRIDE = "לוחית 12-345-67 במודעה";
    try {
      const { extractPlateFromImageBytes } = await import(
        "@/services/intake/plate-ocr"
      );
      const hint = await extractPlateFromImageBytes(Buffer.from([0xff, 0xd8, 0xff]));
      expect(hint?.value.replace(/\D/g, "").length).toBeGreaterThanOrEqual(7);
      expect(hint?.source).toBe("OCR");
    } finally {
      if (prev === undefined) delete process.env.INTAKE_OCR_TEXT_OVERRIDE;
      else process.env.INTAKE_OCR_TEXT_OVERRIDE = prev;
    }
  });
});

describe("Agent 4.1 — live execution path markers", () => {
  it("chat route uses AGENT_VERSION not hardcoded 2.4", () => {
    const chatRoute = readFileSync(
      join(root, "src/app/api/assistant/chat/route.ts"),
      "utf8"
    );
    const turn = readFileSync(
      join(root, "src/services/assistant/assistant-chat-turn.ts"),
      "utf8"
    );
    expect(chatRoute).toContain("runAssistantChatTurn");
    expect(turn).toContain("AGENT_VERSION");
    expect(chatRoute).not.toMatch(/agentVersion:\s*[\"']2\.4[\"']/);
    expect(turn).not.toMatch(/agentVersion:\s*[\"']2\.4[\"']/);
  });

  it("agent loop imports deadline and intake tools", () => {
    const src = readFileSync(
      join(root, "src/services/assistant/agent-loop.ts"),
      "utf8"
    );
    expect(src).toContain("AGENT_LOOP_DEADLINE_MS");
    expect(src).toContain("executeIntakeTool");
  });
});

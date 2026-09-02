import { describe, it, expect } from "vitest";
import {
  buildDeterministicResponse,
  isMetricDump,
} from "@/services/assistant/synthesizer";
import { checkPrivacyGate, privacyBlockedMessage } from "@/services/assistant/privacy-gate";
import { resolveListReference } from "@/services/assistant/conversation-state";
import { heuristicPlan } from "@/services/assistant/planner";
import { AGENT_VERSION, ALL_READ_TOOLS } from "@/services/assistant/tools/registry";
import {
  applyCommercialJudgment,
  filterSuggestions,
} from "@/services/assistant/commercial-judgment";

describe("Agent V2 architecture", () => {
  it("exports agent version 2.3", () => {
    expect(AGENT_VERSION).toBe("2.3");
  });

  it("defines all read tools without unconditional base set", () => {
    expect(ALL_READ_TOOLS).toContain("getMyExchangeState");
    expect(ALL_READ_TOOLS).toContain("getMyExpiringDemands");
    expect(ALL_READ_TOOLS.length).toBeGreaterThanOrEqual(7);
  });

  it("simple count question selects only one cheap tool", () => {
    const plan = heuristicPlan("כמה חיפושים פעילים יש לי?");
    expect(plan.tools).toEqual(["getMyExchangeState"]);
    expect(plan.tools.length).toBeLessThanOrEqual(2);
  });

  it("prioritization question may fan out but not all tools", () => {
    const plan = heuristicPlan("תעשה לי סדר במה שאני צריך לטפל בו");
    expect(plan.tools.length).toBeGreaterThan(1);
    expect(plan.tools.length).toBeLessThan(ALL_READ_TOOLS.length);
    expect(plan.tools).toContain("getMyExchangeState");
  });

  it("expiring list selects only expiring tool", () => {
    const plan = heuristicPlan("איזה חיפושים שלי עומדים לפוג?");
    expect(plan.tools).toEqual(["getMyExpiringDemands"]);
  });

  it("blocks network fishing with commercial copy", () => {
    const result = checkPrivacyGate("כמה ספורטאז' יש ברשת?");
    expect(result.blocked).toBe(true);
    expect(privacyBlockedMessage("fishing")).toContain("אני לא מציג את המלאי של הרשת");
    expect(privacyBlockedMessage("fishing")).not.toContain("מדיניות הפרטיות");
  });

  it("resolves list reference for renew follow-up", () => {
    const item = resolveListReference("תחדש את הראשון", {
      lastList: [
        { id: "d1", title: "מאזדה CX-5", type: "demand" },
        { id: "d2", title: "טויוטה קורולה", type: "demand" },
      ],
    });
    expect(item?.id).toBe("d1");
  });

  it("detects metric-dump phrasing", () => {
    expect(isMetricDump("דרישות פעילות: 7")).toBe(true);
    expect(isMetricDump("יש דבר אחד שכדאי לטפל בו עכשיו")).toBe(false);
  });

  it("answers active demand count directly", () => {
    const response = buildDeterministicResponse(
      {
        getMyExchangeState: { activeDemands: 6 },
        getMyActiveDemands: [{ id: "d1", title: "CX-5", daysLeft: 5 }],
      },
      "כמה חיפושים פעילים יש לי"
    );
    expect(response.message).toContain("6");
    expect(response.message).not.toMatch(/דרישות פעילות/i);
  });
});

describe("Agent 2.3 Golden Conversations — Phase A", () => {
  it("G-01: nothing urgent with active searches", () => {
    const response = buildDeterministicResponse(
      {
        getMyExchangeState: {
          activeDemands: 7,
          authorizedMatches: 0,
          openOpportunities: 0,
        },
      },
      "מה כדאי לי לעשות עכשיו?",
      { goal: "prioritize_actions" }
    );
    expect(response.message).toContain("אין משהו דחוף");
    expect(response.message).toContain("7 חיפושים פעילים");
    expect(response.message).not.toMatch(/דרישות פעילות/i);
    expect(response.suggestions.map((s) => s.label).join(" ")).not.toMatch(
      /פתח חיפוש|ליצור חיפוש/i
    );
  });

  it("G-02: single urgent expiring demand", () => {
    const response = buildDeterministicResponse(
      {
        getMyExpiringDemands: [{ id: "d1", title: "מאזדה CX-5", daysLeft: 1 }],
        getMyExchangeState: { activeDemands: 3 },
      },
      "תעשה לי סדר",
      { goal: "prioritize_actions" }
    );
    expect(response.message).toContain("דבר אחד");
    expect(response.message).toContain("CX-5");
    expect(response.message).toContain("מחר");
  });

  it("G-03: expiring demand + stale inventory", () => {
    const response = buildDeterministicResponse(
      {
        getMyExpiringDemands: [{ id: "d1", title: "מאזדה CX-5", daysLeft: 1 }],
        getMyInventoryRequiringAttention: [
          { id: "v1", title: "קיה ספורטאז'", freshnessState: "STALE" },
        ],
        getMyExchangeState: { activeDemands: 4 },
      },
      "יש משהו שאני מפספס?",
      { goal: "prioritize_actions" }
    );
    expect(response.message).toContain("שני דברים");
    expect(response.message).toContain("CX-5");
    expect(response.message).toContain("ספורטאז'");
  });

  it("G-16: no authorized match", () => {
    const response = buildDeterministicResponse(
      {
        getMyExchangeState: { activeDemands: 2, authorizedMatches: 0 },
        getMyAuthorizedMatches: { count: 0 },
      },
      "הגיע משהו על ה-CX-5?"
    );
    expect(response.message).toContain("אין התאמה מאומתת");
  });

  it("G-28: tool failure safe fallback", () => {
    const response = buildDeterministicResponse(
      { getMyActiveDemands: null },
      "מה החיפושים שלי?",
      { toolErrors: { getMyActiveDemands: "connection refused" } }
    );
    expect(response.message).toContain("לא מצליח כרגע לטעון");
    expect(response.message).not.toContain("connection refused");
  });

  it("G-31: something hot with opportunity", () => {
    const response = buildDeterministicResponse(
      {
        getMyOpportunities: { count: 1 },
        getMyExchangeState: { openOpportunities: 1, activeDemands: 2 },
      },
      "יש משהו חם?"
    );
    expect(response.message).toContain("עניין");
    expect(response.message).toContain("ברכב שלך");
  });

  it("G-31: something hot without activity", () => {
    const response = buildDeterministicResponse(
      { getMyExchangeState: { activeDemands: 2, openOpportunities: 0 } },
      "יש משהו חם?"
    );
    expect(response.message).toContain("אין משהו חדש שדורש פעולה");
  });

  it("G-32: did anything arrive — empty", () => {
    const response = buildDeterministicResponse(
      {
        getMyExchangeState: {
          activeDemands: 3,
          authorizedMatches: 0,
          openOpportunities: 0,
        },
      },
      "הגיע משהו?"
    );
    expect(response.message).toContain("אין משהו חדש");
  });

  it("G-33: many active searches, no urgent items", () => {
    const response = buildDeterministicResponse(
      { getMyExchangeState: { activeDemands: 8 } },
      "תעשה לי סדר",
      { goal: "prioritize_actions" }
    );
    expect(response.message).toContain("8 חיפושים פעילים");
    expect(response.message).toContain("אין משהו חדש שדורש פעולה");
    expect(response.message).not.toMatch(/אימותים/i);
  });
});

const IDLE_FORBIDDEN = /להגביר פעילות|לנצל חיבורים|ליצור חיפוש|פתח חיפוש/i;

function assertNoIdleCommercialPush(response: {
  message: string;
  suggestions: Array<{ label: string }>;
}) {
  expect(response.message).not.toMatch(IDLE_FORBIDDEN);
  const labels = response.suggestions.map((s) => s.label).join(" ");
  expect(labels).not.toMatch(IDLE_FORBIDDEN);
}

describe("Agent 2.3 Golden Conversations — Commercial Judgment (G-41–G-45)", () => {
  it("G-41: no auto open-search CTA with healthy active searches", () => {
    const response = buildDeterministicResponse(
      {
        getMyExchangeState: {
          activeDemands: 5,
          authorizedMatches: 0,
          openOpportunities: 0,
        },
      },
      "תעשה לי סדר",
      { goal: "prioritize_actions" }
    );
    assertNoIdleCommercialPush(response);
    expect(response.message).toContain("5 חיפושים פעילים");
  });

  it("G-42: no action is a valid recommendation — zero suggestions", () => {
    const response = buildDeterministicResponse(
      {
        getMyExchangeState: {
          activeDemands: 6,
          authorizedMatches: 0,
          openOpportunities: 0,
        },
      },
      "תעשה לי סדר",
      { goal: "prioritize_actions" }
    );
    expect(response.suggestions).toHaveLength(0);
  });

  it("G-43: allowance does not influence broad prioritization", () => {
    const response = buildDeterministicResponse(
      {
        getMyExchangeState: {
          activeDemands: 4,
          authorizedMatches: 0,
          openOpportunities: 0,
          connectionsRemaining: 2,
        },
      },
      "תעשה לי סדר",
      { goal: "prioritize_actions" }
    );
    expect(response.message).not.toMatch(/חיבור|מכסה|חבילה/i);
    assertNoIdleCommercialPush(response);
  });

  it("G-44: summarize absence — do not narrate zero categories", () => {
    const response = buildDeterministicResponse(
      {
        getMyExchangeState: {
          activeDemands: 3,
          authorizedMatches: 0,
          openOpportunities: 0,
          pendingValidations: 0,
        },
      },
      "מה מפספס?",
      { goal: "prioritize_actions" }
    );
    expect(response.message).toMatch(/אין משהו/i);
    expect(response.message).not.toMatch(/אימותים?\s*[:：]\s*0/i);
    expect(response.message).not.toMatch(/התאמות?\s*[:：]\s*0/i);
    expect(response.message).not.toMatch(/אין אימותים ממתינים/i);
  });

  it("G-45: broker without inventory — session context only", () => {
    const response = buildDeterministicResponse(
      { getMyExchangeState: { activeDemands: 0 } },
      "אין לי בכלל מלאי ואני מתווך"
    );
    expect(response.message).toContain("מתווך");
    expect(response.message).toContain("חיפוש");
    expect(response.message).toContain("אין צורך לעדכן מלאי");
    expect(response.suggestions.some((s) => /פתח חיפוש/i.test(s.label))).toBe(
      true
    );
  });

  it("G-45: broker follow-up skips inventory attention in prioritization", () => {
    const response = buildDeterministicResponse(
      {
        getMyInventoryRequiringAttention: [
          { id: "v1", title: "קיה ספורטאז'", freshnessState: "STALE" },
        ],
        getMyExchangeState: { activeDemands: 2 },
      },
      "תעשה לי סדר",
      {
        goal: "prioritize_actions",
        sessionContext: { operatingMode: "broker_only" },
      }
    );
    expect(response.message).not.toContain("ספורטאז'");
    expect(response.message).toMatch(/אין משהו/i);
  });
});

describe("Agent 2.3 — negative idle prioritization", () => {
  const idleState = {
    getMyExchangeState: {
      activeDemands: 7,
      authorizedMatches: 0,
      openOpportunities: 0,
    },
  };

  for (const message of [
    "תעשה לי סדר",
    "מה כדאי לי לעשות עכשיו?",
    "יש משהו שאני מפספס?",
  ]) {
    it(`does not push idle commercial CTAs for "${message}"`, () => {
      const response = buildDeterministicResponse(
        idleState,
        message,
        { goal: "prioritize_actions" }
      );
      assertNoIdleCommercialPush(response);
    });
  }
});

describe("Commercial Judgment — filterSuggestions regression", () => {
  const idleInput = {
    userMessage: "תעשה לי סדר",
    activeDemands: 7,
    hasActionableItems: false,
    intent: "prioritize",
  };

  it("removes create-search CTA but keeps navigation when no explicit intent", () => {
    const suggestions = filterSuggestions(
      [
        { label: "החיפושים שלי", href: "/demand" },
        { label: "פתח חיפוש", href: "/demand?new=1" },
      ],
      idleInput
    );
    expect(suggestions.map((s) => s.label)).toEqual(["החיפושים שלי"]);
  });

  it("applyCommercialJudgment strips manufactured OpenAI create-search CTA", () => {
    const result = applyCommercialJudgment(
      {
        message: "כרגע אין משהו דחוף שמחכה לך.",
        suggestions: [
          { label: "החיפושים שלי", href: "/demand" },
          { label: "פתח חיפוש", href: "/demand?new=1" },
          { label: "ליצור חיפוש חדש", href: "/demand?new=1" },
        ],
      },
      idleInput
    );
    expect(result.suggestions.map((s) => s.label)).toEqual(["החיפושים שלי"]);
    expect(result.message).not.toMatch(/פתח חיפוש|ליצור חיפוש/i);
  });
});

describe("Commercial Judgment — filterSuggestions regression", () => {
  const idleInput = {
    userMessage: "תעשה לי סדר",
    activeDemands: 7,
    hasActionableItems: false,
    intent: "prioritize",
  };

  it("removes create-search CTA but keeps navigation when no explicit intent", () => {
    const suggestions = filterSuggestions(
      [
        { label: "החיפושים שלי", href: "/demand" },
        { label: "פתח חיפוש", href: "/demand?new=1" },
      ],
      idleInput
    );
    expect(suggestions.map((s) => s.label)).toEqual(["החיפושים שלי"]);
  });

  it("applyCommercialJudgment strips manufactured OpenAI create-search CTA", () => {
    const result = applyCommercialJudgment(
      {
        message: "כרגע אין משהו דחוף שמחכה לך.",
        suggestions: [
          { label: "החיפושים שלי", href: "/demand" },
          { label: "פתח חיפוש", href: "/demand?new=1" },
          { label: "ליצור חיפוש חדש", href: "/demand?new=1" },
        ],
      },
      idleInput
    );
    expect(result.suggestions.map((s) => s.label)).toEqual(["החיפושים שלי"]);
    expect(result.message).not.toMatch(/פתח חיפוש|ליצור חיפוש/i);
  });
});

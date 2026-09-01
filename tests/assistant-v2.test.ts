import { describe, it, expect } from "vitest";
import { buildDeterministicResponse } from "@/services/assistant/synthesizer";
import { checkPrivacyGate } from "@/services/assistant/privacy-gate";
import { resolveListReference } from "@/services/assistant/conversation-state";
import { heuristicPlan } from "@/services/assistant/planner";
import { AGENT_VERSION, ALL_READ_TOOLS } from "@/services/assistant/tools/registry";

describe("Agent V2 architecture", () => {
  it("exports agent version 2.2", () => {
    expect(AGENT_VERSION).toBe("2.2");
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

  it("golden scenario: prioritization from tool results", () => {
    const response = buildDeterministicResponse(
      {
        getMyExpiringDemands: [
          { id: "d1", title: "מאזדה CX-5", daysLeft: 2 },
          { id: "d2", title: "טויוטה קורולה", daysLeft: 3 },
        ],
        getMyPendingValidations: [
          { id: "v1", title: "יונדאי טוסון 2021" },
        ],
        getMyExchangeState: {
          activeDemands: 6,
          authorizedMatches: 1,
          openOpportunities: 0,
        },
      },
      "מה סדר הפעולות המומלץ עבורי"
    );

    expect(response.message).toContain("3 דברים");
    expect(response.message).toContain("2 חיפושים עומדים לפוג");
    expect(response.message).toContain("אישור זמינות");
    expect(response.message).not.toContain("Exchange Assistant");
    expect(response.message).not.toContain("נסה לשאול");
    expect(response.lastList.length).toBeGreaterThanOrEqual(2);
  });

  it("answers active demand count directly", () => {
    const response = buildDeterministicResponse(
      {
        getMyExchangeState: { activeDemands: 6 },
        getMyActiveDemands: [
          { id: "d1", title: "CX-5", daysLeft: 5 },
        ],
      },
      "כמה חיפושים פעילים יש לי"
    );
    expect(response.message).toContain("6");
  });

  it("blocks network fishing", () => {
    const result = checkPrivacyGate("כמה ספורטאז' יש ברשת?");
    expect(result.blocked).toBe(true);
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
});

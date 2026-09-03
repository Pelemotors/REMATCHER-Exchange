/**
 * Agent 4.0 — hybrid tool-using runtime tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const loopMock = vi.fn();
const gatewaySpy = vi.fn();
const bulkExec = vi.fn();
const bulkPrep = vi.fn();
const ingestSpy = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/services/notifications", () => ({ logAppEvent: vi.fn() }));
vi.mock("@/services/ai/client", () => ({
  callOpenAIStructured: vi.fn(),
  isOpenAIConfigured: () => true,
  logAiOperation: vi.fn(),
  getOpenAIClient: vi.fn(),
}));
vi.mock("@/services/assistant/agent-loop", () => ({
  runAgentToolLoop: (...args: unknown[]) => loopMock(...args),
}));
vi.mock("@/services/assistant/inventory-ingest", () => ({
  handleInventoryIngestTurn: (...args: unknown[]) => ingestSpy(...args),
}));
vi.mock("@/services/assistant/inventory-manage", () => ({
  handleInventoryManageTurn: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    demand: {
      findFirst: vi.fn(async ({ where }: { where: { dealerId?: string; id?: string } }) =>
        where.dealerId === "dealer-1" ? { id: where.id, confirmedJson: {} } : null
      ),
      findMany: vi.fn(async () => []),
    },
    vehicle: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("@/services/assistant/target-resolution", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/services/assistant/target-resolution")
  >();
  return {
    ...actual,
    assertDemandOwned: vi.fn(async () => true),
    assertVehicleOwned: vi.fn(async () => false),
  };
});
vi.mock("@/services/assistant/tools/action-tools", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/assistant/tools/action-tools")
  >("@/services/assistant/tools/action-tools");
  return {
    ...actual,
    prepareBulkDemandClosure: (...args: unknown[]) => bulkPrep(...args),
    executeBulkDemandClosure: (...args: unknown[]) => bulkExec(...args),
  };
});
vi.mock("@/services/assistant/tools/read-tools", () => ({
  executeToolsParallel: vi.fn(async (tools: string[]) => ({
    results: Object.fromEntries(
      tools.map((t) => [
        t,
        t === "getMyInventory"
          ? { activeCount: 0, vehicles: [] }
          : t === "getMyActiveDemands"
            ? [
                { id: "s1", title: "Mazda CX-5" },
                { id: "s2", title: "Toyota Corolla" },
              ]
            : t === "getMyAuthorizedMatches"
              ? []
              : { activeDemands: 2 },
      ])
    ),
    durations: {},
    errors: {},
  })),
}));

import { AGENT_VERSION } from "@/services/assistant/tools/registry";
import { OPENAI_READ_TOOL_MAP, AGENT_OPENAI_TOOLS } from "@/services/assistant/agent-tools";
import { parseActionProposalFromTool } from "@/services/assistant/action-proposal";
import { runActionGateway } from "@/services/assistant/action-gateway";
import { runExchangeAssistantV2 } from "@/services/assistant/v2-orchestrator";
import { checkPrivacyGate } from "@/services/assistant/privacy-gate";
import type { AgentMeta } from "@/services/assistant/tools/registry";

function meta(): AgentMeta {
  return {
    agentVersion: AGENT_VERSION,
    plannerUsed: false,
    synthesizerUsed: false,
    model: null,
    tools: [],
    toolDurations: {},
    plannerDurationMs: 0,
    synthesisDurationMs: 0,
    fallbackReason: null,
    responseType: "read",
    legacyPlannerUsed: false,
  };
}

function loopOk(partial: Record<string, unknown>) {
  return {
    message: "",
    proposal: null,
    modelCallCount: 1,
    toolRoundCount: 0,
    toolsUsed: [],
    toolDurations: {},
    totalTokens: 100,
    latencyMs: 50,
    model: "gpt-4o-mini",
    success: true,
    fallbackReason: null,
    toolResults: {},
    ...partial,
  };
}

describe("Agent 4.0 hybrid runtime — architecture", () => {
  it("same Agent at version 4.0", () => {
    expect(AGENT_VERSION).toBe("4.0");
  });

  it("orchestrator uses agent loop, not Turn Planner as mandatory brain", () => {
    const orch = readFileSync(
      join(process.cwd(), "src/services/assistant/v2-orchestrator.ts"),
      "utf8"
    );
    expect(orch).toContain("runAgentToolLoop");
    expect(orch).toContain("runActionGateway");
    expect(orch).not.toMatch(/planConversationTurn/);
    expect(orch).not.toMatch(/planAgentTurn/);
    expect(orch).not.toMatch(/routeTurnPlan/);
  });

  it("exposes compact domain read tools, not question-specific answers", () => {
    const names = AGENT_OPENAI_TOOLS.map((t) =>
      t.type === "function" ? t.function.name : ""
    );
    expect(names).toContain("get_my_inventory");
    expect(names).toContain("get_my_searches");
    expect(names).toContain("get_my_matches");
    expect(names).toContain("propose_mutation");
    expect(names).not.toContain("answer_what_should_i_do");
    expect(names).not.toContain("get_dealer_attention");
    expect(OPENAI_READ_TOOL_MAP.get_my_inventory).toBe("getMyInventory");
  });
});

describe("ActionProposal parsing", () => {
  it("parses propose_mutation without trusting invented IDs", () => {
    const p = parseActionProposalFromTool(
      "propose_mutation",
      JSON.stringify({
        capability: "SEARCHES",
        operation: "CLOSE",
        scope: "ALL_AUTHORIZED",
        targetReference: "all active searches",
        reason: "user asked",
        facts: null,
      })
    );
    expect(p?.kind).toBe("PROPOSE");
    expect(p?.capability).toBe("SEARCHES");
    expect(p?.operation).toBe("CLOSE");
    expect(p?.targetReference).toBe("all active searches");
  });

  it("confirm/cancel control tools", () => {
    expect(parseActionProposalFromTool("confirm_pending_action", "{}")?.kind).toBe(
      "CONFIRM_PENDING"
    );
    expect(parseActionProposalFromTool("cancel_pending_action", "{}")?.kind).toBe(
      "CANCEL_PENDING"
    );
  });
});

describe("Orchestrator — read path via agent loop", () => {
  beforeEach(() => {
    loopMock.mockReset();
    ingestSpy.mockReset();
    bulkPrep.mockReset();
    bulkExec.mockReset();
  });

  it("novel advice returns GPT final text without inventory ingest", async () => {
    loopMock.mockResolvedValue(
      loopOk({
        message:
          "אני הייתי מתחיל מהמלאי — כרגע אין רכבים פעילים, ויש 4 חיפושים פתוחים שכדאי ליישר מולם.",
        toolsUsed: ["get_my_inventory", "get_my_searches"],
        toolRoundCount: 2,
        modelCallCount: 3,
      })
    );
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "u1",
      message: "אם היית מנהל את הסוכנות שלי היום, מה היית עושה?",
      context: { route: "/inventory", mode: "inventory_management" },
    });
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(result.message).toMatch(/מלאי|חיפוש/);
    expect(result.meta?.finalResponseSource).toBe("agent_loop");
    expect(result.meta?.legacyPlannerUsed).toBe(false);
    expect(result.meta?.toolRoundCount).toBe(2);
    expect(result.conversation?.recentTurns?.length).toBeGreaterThan(0);
  });

  it("follow-up reconsideration uses recentTurns history without special route", async () => {
    loopMock.mockResolvedValue(
      loopOk({
        message:
          "צדקת — בלי מלאי החיפושים לבד לא מקדמים מספיק. הייתי מתחיל בהעלאת רכב אחד חזק.",
        toolsUsed: ["get_my_inventory"],
        modelCallCount: 2,
        toolRoundCount: 1,
      })
    );
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "u1",
      message: "אבל אין לי מלאי, זה בטח לא מקדם אותי",
      context: { route: "/home" },
      conversation: {
        recentTurns: [
          { role: "user", text: "ממה להתחיל?" },
          {
            role: "assistant",
            text: "אני ממליץ להתחיל בחיפושים.",
          },
        ],
      },
    });
    expect(loopMock).toHaveBeenCalled();
    const arg = loopMock.mock.calls[0]![0] as {
      conversation?: { recentTurns?: unknown[] };
    };
    expect(arg.conversation?.recentTurns?.length).toBe(2);
    expect(result.message).toMatch(/מלאי/);
    expect(result.meta?.executor).toBe("agent_loop");
  });

  it("mutation becomes ActionProposal → gateway, not direct write", async () => {
    bulkPrep.mockResolvedValue({
      ok: true,
      empty: false,
      demands: [
        { id: "s1", title: "Mazda CX-5" },
        { id: "s2", title: "Mazda CX-5" },
      ],
      action: "close_demands_bulk",
      label: "מצאתי 2 חיפושים פעילים ל-Mazda CX-5. לסגור את כולם?",
      payload: {
        demandIds: ["s1", "s2"],
        capability: "SEARCHES",
        operation: "CLOSE",
        scope: "ALL_AUTHORIZED",
        targetCount: 2,
      },
    });
    loopMock.mockResolvedValue(
      loopOk({
        proposal: {
          kind: "PROPOSE",
          capability: "SEARCHES",
          operation: "CLOSE",
          scope: "ALL_AUTHORIZED",
          targetReference: "all active searches",
          reason: "user asked to cancel",
          facts: null,
        },
        toolsUsed: ["propose_mutation"],
      })
    );
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "u1",
      message: "תבטל את כל החיפושים שלי",
      context: { route: "/inventory", mode: "inventory_management" },
    });
    expect(bulkExec).not.toHaveBeenCalled();
    expect(bulkPrep).toHaveBeenCalled();
    expect(result.conversation?.pendingConfirmation?.action).toBe(
      "close_demands_bulk"
    );
    expect(result.meta?.finalResponseSource).toBe("action_gateway");
  });

  it("natural confirm via control tool executes through gateway", async () => {
    bulkExec.mockResolvedValue({ ok: true, closed: 2, requested: 2 });
    loopMock.mockResolvedValue(
      loopOk({
        proposal: {
          kind: "CONFIRM_PENDING",
          capability: "GENERAL",
          operation: "NONE",
          scope: null,
          targetReference: null,
          reason: null,
          facts: null,
        },
        toolsUsed: ["confirm_pending_action"],
      })
    );
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "u1",
      message: "כן תבטל אותם",
      context: { route: "/inventory" },
      conversation: {
        pendingConfirmation: {
          action: "close_demands_bulk",
          label: "לסגור 2?",
          payload: {
            demandIds: ["s1", "s2"],
            capability: "SEARCHES",
            operation: "CLOSE",
            scope: "ALL_AUTHORIZED",
          },
        },
      },
    });
    expect(bulkExec).toHaveBeenCalledWith("dealer-1", ["s1", "s2"]);
    expect(result.message).toMatch(/סגרתי/);
  });

  it("scope change proposes new mutation and does not execute original", async () => {
    loopMock.mockResolvedValue(
      loopOk({
        proposal: {
          kind: "PROPOSE",
          capability: "SEARCHES",
          operation: "CLOSE",
          scope: "MANY",
          targetReference: "only two",
          reason: "scope change",
          facts: null,
        },
        toolsUsed: ["propose_mutation"],
      })
    );
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "u1",
      message: "כן אבל רק שניים",
      context: { route: "/home" },
      conversation: {
        pendingConfirmation: {
          action: "close_demands_bulk",
          label: "לסגור 4?",
          payload: {
            demandIds: ["s1", "s2", "s3", "s4"],
            scope: "ALL_AUTHORIZED",
          },
        },
      },
    });
    expect(bulkExec).not.toHaveBeenCalled();
    expect(result.meta?.finalResponseSource).toBe("action_gateway");
  });

  it("OpenAI failure remains safe — no write, no inventory default", async () => {
    loopMock.mockResolvedValue(
      loopOk({
        success: false,
        fallbackReason: "agent_loop_error",
        message: "לא הצלחתי להשלים את הבדיקה כרגע. אפשר לנסות שוב עוד רגע — לא בוצעה שום פעולה.",
      })
    );
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "u1",
      message: "מה כדאי?",
      context: { route: "/inventory", mode: "inventory_management" },
    });
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(bulkExec).not.toHaveBeenCalled();
    expect(result.meta?.finalResponseSource).toBe("fallback");
    expect(result.message).toMatch(/לא בוצעה/);
  });

  it("network fishing denied before agent loop", async () => {
    expect(checkPrivacyGate("כמה ספורטאז יש ברשת?").blocked).toBe(true);
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "u1",
      message: "כמה ספורטאז יש ברשת?",
      context: { route: "/home" },
    });
    expect(loopMock).not.toHaveBeenCalled();
    expect(result.privacyBlocked).toBe(true);
    expect(result.meta?.finalResponseSource).toBe("privacy");
  });
});

describe("Action Gateway security", () => {
  it("cancel pending does not write", async () => {
    const result = await runActionGateway({
      dealerId: "dealer-1",
      userId: "u1",
      message: "לא",
      proposal: {
        kind: "CANCEL_PENDING",
        capability: "GENERAL",
        operation: "NONE",
        scope: null,
        targetReference: null,
        reason: null,
        facts: null,
      },
      conversation: {
        pendingConfirmation: {
          action: "close_demands_bulk",
          label: "x",
          payload: { demandIds: ["s1"] },
        },
      },
      meta: meta(),
    });
    expect(result.message).toMatch(/בוטל/);
    expect(bulkExec).not.toHaveBeenCalled();
  });
});

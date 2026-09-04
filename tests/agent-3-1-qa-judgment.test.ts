/**
 * Compatibility QA for search labels + universal-Agent confirmation flow.
 *
 * Historical exact-CTA/turn-router assertions were intentionally removed:
 * normal language, including short confirmations, now belongs to the universal
 * Agent. The Action Gateway remains the deterministic execution boundary.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const bulkPrep = vi.fn();
const bulkExec = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/services/notifications", () => ({ logAppEvent: vi.fn() }));
vi.mock("@/services/ai/client", () => ({
  callOpenAIStructured: vi.fn(),
  isOpenAIConfigured: () => false,
  logAiOperation: vi.fn(),
}));
vi.mock("@/services/assistant/inventory-manage", () => ({
  handleInventoryManageTurn: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    demand: {
      findFirst: vi.fn(async ({ where }: { where: { dealerId?: string } }) =>
        where.dealerId === "dealer-1" ? { id: where } : null
      ),
    },
  },
}));
vi.mock("@/services/assistant/target-resolution", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/services/assistant/target-resolution")
  >();
  return {
    ...actual,
    assertDemandOwned: vi.fn(async () => true),
    assertVehicleOwned: vi.fn(async () => true),
    resolveAuthorizedDemands: vi.fn(async () => [
      { id: "s1", title: "Mazda CX-5 — 2022 ומעלה" },
      { id: "s2", title: "Mazda CX-5 — 2023 ומעלה" },
      { id: "s3", title: "Mazda CX-5 — עד 120 אלף" },
      { id: "s4", title: "Mazda CX-5 — עד 130 אלף" },
    ]),
  };
});
vi.mock("@/services/assistant/tools/read-tools", () => ({
  executeToolsParallel: vi.fn(async (tools: string[]) => ({
    results: {},
    durations: Object.fromEntries(tools.map((tool) => [tool, 1])),
    errors: {},
  })),
}));
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
vi.mock("@/services/assistant/agent-loop", () => ({
  runAgentToolLoop: vi.fn(),
}));

import {
  formatBulkSearchCloseMessage,
  formatSearchDisplayLabel,
} from "@/lib/demand-display";
import { runAgentToolLoop } from "@/services/assistant/agent-loop";
import { runExchangeAssistantV2 } from "@/services/assistant/v2-orchestrator";

function loopResult(partial: Record<string, unknown>) {
  return {
    message: "",
    proposal: null,
    conversation: undefined,
    modelCallCount: 1,
    toolRoundCount: 1,
    toolsUsed: [],
    toolDurations: {},
    totalTokens: 50,
    latencyMs: 10,
    model: "gpt-5.4-mini",
    success: true,
    fallbackReason: null,
    toolResults: {},
    ...partial,
  };
}

const pendingFour = {
  action: "close_demands_bulk",
  label: "לסגור 4?",
  payload: {
    demandIds: ["s1", "s2", "s3", "s4"],
    capability: "SEARCHES",
    operation: "CLOSE",
    scope: "ALL_AUTHORIZED",
    targetCount: 4,
  },
};

function confirmProposal() {
  return {
    kind: "CONFIRM_PENDING" as const,
    capability: "SEARCHES" as const,
    operation: "CLOSE" as const,
    scope: "ALL_AUTHORIZED" as const,
    targetReference: null,
    reason: "confirm current pending action",
    facts: null,
  };
}

describe("Search display labels", () => {
  it("canonicalizes mixed make language and differentiates constraints", () => {
    const a = formatSearchDisplayLabel({
      make: "מאזדה",
      model: "CX-5",
      yearMin: 2022,
      budgetMax: 130000,
    });
    const b = formatSearchDisplayLabel({
      make: "Mazda",
      model: "CX-5",
      yearMin: 2023,
    });
    expect(a).toMatch(/^Mazda CX-5/);
    expect(a).toMatch(/2022 ומעלה/);
    expect(a).toMatch(/130 אלף/);
    expect(b).toMatch(/2023 ומעלה/);
    expect(a).not.toBe(b);
  });

  it("summarizes identical labels instead of repeating them", () => {
    const label = formatSearchDisplayLabel({ make: "Mazda", model: "CX-5" });
    const message = formatBulkSearchCloseMessage([label, label, label, label]);
    expect(message).toMatch(/4 חיפושים פעילים ל-Mazda CX-5/);
    expect(message.split("Mazda CX-5").length).toBe(2);
  });

  it("lists differentiated searches", () => {
    const message = formatBulkSearchCloseMessage([
      "Mazda CX-5 — 2022 ומעלה, עד 130 אלף",
      "Mazda CX-5 — 2023 ומעלה",
    ]);
    expect(message).toMatch(/• /);
    expect(message).toMatch(/לסגור את כולם/);
  });
});

describe("Universal Agent confirmation", () => {
  beforeEach(() => {
    bulkPrep.mockReset();
    bulkExec.mockReset();
    bulkExec.mockResolvedValue({ ok: true, closed: 4, requested: 4 });
    vi.mocked(runAgentToolLoop).mockReset();
  });

  it.each(["כן", "מאשר", "יאללה", "כן תבטל אותם", "סגור אותם"])(
    "confirmation language is interpreted by the Agent: %s",
    async (message) => {
      vi.mocked(runAgentToolLoop).mockResolvedValue(
        loopResult({
          proposal: confirmProposal(),
          toolsUsed: ["confirm_pending_action"],
        }) as never
      );

      const result = await runExchangeAssistantV2({
        dealerId: "dealer-1",
        userId: "u1",
        message,
        context: { route: "/inventory", mode: "inventory_management" },
        conversation: { pendingConfirmation: pendingFour },
      });

      expect(runAgentToolLoop).toHaveBeenCalled();
      expect(bulkPrep).not.toHaveBeenCalled();
      expect(bulkExec).toHaveBeenCalledWith("dealer-1", ["s1", "s2", "s3", "s4"]);
      expect(result.message).toMatch(/סגרתי 4/);
      expect(result.meta?.legacyPlannerUsed).toBe(false);
      expect(result.meta?.finalResponseSource).toBe("action_gateway");
    }
  );

  it("rejection is interpreted by the Agent and does not write", async () => {
    vi.mocked(runAgentToolLoop).mockResolvedValue(
      loopResult({
        proposal: {
          kind: "CANCEL_PENDING",
          capability: "GENERAL",
          operation: "NONE",
          scope: null,
          targetReference: null,
          reason: "cancel",
          facts: null,
        },
        toolsUsed: ["cancel_pending_action"],
      }) as never
    );

    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "u1",
      message: "לא, תשאיר אותם",
      context: { route: "/inventory" },
      conversation: { pendingConfirmation: pendingFour },
    });

    expect(bulkExec).not.toHaveBeenCalled();
    expect(result.message).toMatch(/בוטל/);
    expect(result.meta?.finalResponseSource).toBe("action_gateway");
  });

  it("a normal read while confirmation is pending stays conversational", async () => {
    vi.mocked(runAgentToolLoop).mockResolvedValue(
      loopResult({
        message: "יש לך כרגע 2 התאמות.",
        proposal: null,
        toolsUsed: ["get_my_matches"],
      }) as never
    );

    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "u1",
      message: "רגע, כמה התאמות יש לי?",
      context: { route: "/inventory" },
      conversation: { pendingConfirmation: pendingFour },
    });

    expect(bulkExec).not.toHaveBeenCalled();
    expect(result.message).toMatch(/2 התאמות/);
    expect(result.conversation?.pendingConfirmation?.action).toBe(
      "close_demands_bulk"
    );
  });
});

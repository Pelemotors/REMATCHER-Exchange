/**
 * Production transcript: cancel all searches while inventory workspace is open.
 * Inventory ingest must not own the turn. Agent 4.0: proposal via tool loop → gateway.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ingestSpy = vi.fn();
const bulkPrep = vi.fn();
const bulkExec = vi.fn();
const loopMock = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/services/notifications", () => ({ logAppEvent: vi.fn() }));
vi.mock("@/services/ai/client", () => ({
  callOpenAIStructured: vi.fn(),
  isOpenAIConfigured: () => true,
  logAiOperation: vi.fn(),
}));
vi.mock("@/services/assistant/inventory-ingest", () => ({
  handleInventoryIngestTurn: (...args: unknown[]) => ingestSpy(...args),
}));
vi.mock("@/services/assistant/inventory-manage", () => ({
  handleInventoryManageTurn: vi.fn(),
}));
vi.mock("@/services/assistant/planner", () => ({
  planAgentTurn: vi.fn(async () => {
    throw new Error("planAgentTurn must not run");
  }),
  heuristicPlan: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    demand: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; dealerId?: string } }) =>
        where.dealerId === "dealer-1" ? { id: where.id } : null
      ),
      findMany: vi.fn(async () => []),
    },
  },
}));
vi.mock("@/services/assistant/target-resolution", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/services/assistant/target-resolution")
  >();
  return {
    ...actual,
    assertDemandOwned: vi.fn(async (dealerId: string) => dealerId === "dealer-1"),
    assertVehicleOwned: vi.fn(async () => false),
  };
});
vi.mock("@/services/assistant/synthesizer", () => ({
  helpOnlyResponse: () => ({ message: "help", suggestions: [] }),
  synthesizeResponse: vi.fn(),
}));
vi.mock("@/services/assistant/tools/read-tools", () => ({
  executeToolsParallel: vi.fn(),
  getDemandByIdForDealer: vi.fn(),
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
  runAgentToolLoop: (...args: unknown[]) => loopMock(...args),
}));

import { runExchangeAssistantV2 } from "@/services/assistant/v2-orchestrator";

describe("Transcript — תבטל כרגע את כל החיפושים שלי", () => {
  beforeEach(() => {
    ingestSpy.mockReset();
    bulkPrep.mockReset();
    bulkExec.mockReset();
    loopMock.mockReset();
    loopMock.mockResolvedValue({
      message: "",
      proposal: {
        kind: "PROPOSE",
        capability: "SEARCHES",
        operation: "CLOSE",
        scope: "ALL_AUTHORIZED",
        targetReference: "all my searches",
        reason: "cancel searches",
        facts: null,
      },
      modelCallCount: 1,
      toolRoundCount: 0,
      toolsUsed: ["propose_mutation"],
      toolDurations: {},
      totalTokens: 200,
      latencyMs: 40,
      model: "gpt-4o-mini",
      success: true,
      fallbackReason: null,
      toolResults: {},
    });
    bulkPrep.mockResolvedValue({
      ok: true,
      empty: false,
      demands: [
        { id: "s1", title: "Mazda CX-5" },
        { id: "s2", title: "חיפוש 2" },
        { id: "s3", title: "חיפוש 3" },
        { id: "s4", title: "חיפוש 4" },
      ],
      action: "close_demands_bulk",
      label: "מצאתי 4 חיפושים פעילים. לסגור את כולם?",
      payload: {
        demandIds: ["s1", "s2", "s3", "s4"],
        capability: "SEARCHES",
        operation: "CLOSE",
        scope: "ALL_AUTHORIZED",
        targetCount: 4,
      },
    });
  });

  it("proposes bulk close with confirmation; inventory ingest is not selected", async () => {
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "תבטל כרגע את כל החיפושים שלי",
      context: { route: "/inventory", mode: "inventory_management" },
      conversation: {
        sessionContext: { operatingMode: "inventory_management" },
        lastAuthorizedSnapshot: {
          activeDemandCount: 4,
          activeDemandIds: ["s1", "s2", "s3", "s4"],
          activeDemandTitles: ["Mazda CX-5", "חיפוש 2", "חיפוש 3", "חיפוש 4"],
        },
        lastList: [
          { id: "s1", title: "Mazda CX-5", type: "demand" },
          { id: "s2", title: "חיפוש 2", type: "demand" },
          { id: "s3", title: "חיפוש 3", type: "demand" },
          { id: "s4", title: "חיפוש 4", type: "demand" },
        ],
        pendingInventoryDraft: {
          status: "DRAFT",
          sourceText: "קורולה",
          fields: {
            make: "Toyota",
            model: "Corolla",
            year: 2022,
            mileage: null,
            ownershipType: null,
            ownershipHand: null,
            b2bPrice: null,
            retailPrice: null,
            color: null,
            trim: null,
            region: null,
          },
          askedGaps: [],
        },
      },
    });

    expect(loopMock).toHaveBeenCalled();
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(bulkExec).not.toHaveBeenCalled();
    expect(bulkPrep).toHaveBeenCalledWith("dealer-1");
    expect(result.message).not.toMatch(/חסר לי היצרן/);
    expect(result.message).toMatch(/4 חיפושים/);
    expect(result.conversation?.pendingConfirmation?.action).toBe(
      "close_demands_bulk"
    );
    expect(result.conversation?.pendingConfirmation?.payload.demandIds).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
    ]);
    expect(result.conversation?.pendingInventoryDraft?.fields.model).toBe(
      "Corolla"
    );
  });

  it("executes domain close only after explicit confirmation", async () => {
    bulkExec.mockResolvedValue({ ok: true, closed: 4, requested: 4 });
    const result = await runExchangeAssistantV2({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "כן",
      context: { route: "/inventory", mode: "inventory_management" },
      conversation: {
        pendingConfirmation: {
          action: "close_demands_bulk",
          label: "לסגור 4 חיפושים?",
          payload: { demandIds: ["s1", "s2", "s3", "s4"] },
        },
        pendingInventoryDraft: {
          status: "DRAFT",
          sourceText: "קורולה",
          fields: {
            make: "Toyota",
            model: "Corolla",
            year: 2022,
            mileage: null,
            ownershipType: null,
            ownershipHand: null,
            b2bPrice: null,
            retailPrice: null,
            color: null,
            trim: null,
            region: null,
          },
          askedGaps: [],
        },
      },
    });
    expect(ingestSpy).not.toHaveBeenCalled();
    expect(bulkExec).toHaveBeenCalledWith("dealer-1", ["s1", "s2", "s3", "s4"]);
    expect(result.message).toMatch(/סגרתי 4/);
    expect(result.conversation?.pendingInventoryDraft?.fields.make).toBe(
      "Toyota"
    );
  });
});

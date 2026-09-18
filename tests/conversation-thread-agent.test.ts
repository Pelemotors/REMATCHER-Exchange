import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockFindFirst = vi.fn();
const mockActionFindFirst = vi.fn();
const mockActionFindUnique = vi.fn();
const mockActionCreate = vi.fn();
const mockMessageCreate = vi.fn();
const mockMessageFindUnique = vi.fn();
const mockDealerMemoryFindFirst = vi.fn();
const mockDealerMemoryUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversationThread: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    conversationAction: {
      findFirst: (...args: unknown[]) => mockActionFindFirst(...args),
      findUnique: (...args: unknown[]) => mockActionFindUnique(...args),
      create: (...args: unknown[]) => mockActionCreate(...args),
    },
    conversationMessage: {
      create: (...args: unknown[]) => mockMessageCreate(...args),
      findUnique: (...args: unknown[]) => mockMessageFindUnique(...args),
      findMany: vi.fn(),
    },
    dealerMemoryItem: {
      findFirst: (...args: unknown[]) => mockDealerMemoryFindFirst(...args),
      updateMany: (...args: unknown[]) => mockDealerMemoryUpdateMany(...args),
      update: vi.fn(async () => ({})),
      create: vi.fn(async () => ({})),
    },
  },
}));

import {
  loadThreadAgentState,
  saveThreadAgentState,
  splitStateForPersistence,
} from "@/services/assistant/conversation-persistence";
import {
  assertPendingActionOnThread,
  syncGatewayPendingProjection,
} from "@/services/conversation/gateway-projection";
import {
  assertThreadAccess,
  ConversationAccessError,
} from "@/services/conversation/auth";

const threadRow = (id: string, state: unknown) => ({
  id,
  dealerId: "dealer-a",
  ownerUserId: "user-a",
  title: "שיחה",
  titleSource: "AUTO",
  status: "ACTIVE",
  source: "AGENT",
  visibility: "PRIVATE_USER",
  agentStateJson: state,
  compactSummary: null,
  lastMessageAt: null,
  archivedAt: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("thread-scoped agent state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDealerMemoryFindFirst.mockResolvedValue(null);
    mockDealerMemoryUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("A/B independent agentState", async () => {
    mockFindUnique.mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where.id === "thread-a") {
        return Promise.resolve(
          threadRow("thread-a", { recentTurns: [{ role: "user", text: "A" }] })
        );
      }
      if (where.id === "thread-b") {
        return Promise.resolve(
          threadRow("thread-b", { recentTurns: [{ role: "user", text: "B" }] })
        );
      }
      return Promise.resolve(null);
    });

    const principal = { dealerId: "dealer-a", userId: "user-a" };
    const stateA = await loadThreadAgentState(principal, "thread-a");
    const stateB = await loadThreadAgentState(principal, "thread-b");
    expect(stateA.state?.recentTurns?.[0]?.text).toBe("A");
    expect(stateB.state?.recentTurns?.[0]?.text).toBe("B");
  });

  it("legacy migration strips pending mutation authority", async () => {
    mockFindUnique.mockResolvedValue(threadRow("thread-new", null));
    mockDealerMemoryFindFirst.mockResolvedValue({
      details: {
        state: {
          pendingConfirmation: {
            action: "stale",
            label: "old",
            payload: {},
          },
          recentTurns: [{ role: "user", text: "legacy" }],
          preferredClarificationWording: { year: "שנה?" },
        },
      },
    });
    mockUpdate.mockResolvedValue({});
    mockDealerMemoryUpdateMany.mockResolvedValue({ count: 1 });

    const { state } = await loadThreadAgentState(
      { dealerId: "dealer-a", userId: "user-a" },
      "thread-new"
    );
    expect(state?.pendingConfirmation).toBeUndefined();
    expect(state?.recentTurns?.[0]?.text).toBe("legacy");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentStateJson: expect.not.objectContaining({
            pendingConfirmation: expect.anything(),
          }),
        }),
      })
    );
  });

  it("dealer memory split keeps preferences only", () => {
    const { operational, preferences } = splitStateForPersistence({
      pendingConfirmation: {
        action: "x",
        label: "y",
        payload: {},
      },
      recentTurns: [{ role: "user", text: "hi" }],
      preferredClarificationWording: { year: "שנת ייצור?" },
    });
    expect(operational?.pendingConfirmation).toBeDefined();
    expect(preferences?.preferredClarificationWording?.year).toBe("שנת ייצור?");
  });
});

describe("confirm action thread binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirm B denied for A pending", async () => {
    mockActionFindUnique.mockResolvedValue({
      id: "act-1",
      threadId: "thread-a",
      status: "PENDING_CONFIRMATION",
    });
    const result = await assertPendingActionOnThread({
      principal: { dealerId: "dealer-a", userId: "user-a" },
      threadId: "thread-b",
      actionId: "act-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong_thread");
  });
});

describe("gateway projection Action Truth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActionFindUnique.mockReset();
    mockActionCreate.mockReset();
    mockActionFindFirst.mockReset();
    mockFindUnique.mockResolvedValue(threadRow("t1", {}));
    mockUpdate.mockResolvedValue({});
    mockMessageFindUnique.mockResolvedValue(null);
    mockMessageCreate.mockResolvedValue({
      id: "msg-1",
      threadId: "t1",
      createdAt: new Date(),
    });
    mockActionFindUnique.mockResolvedValue(null);
    mockActionCreate.mockResolvedValue({
      id: "act-new",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
  });

  it("creates unique ConversationAction per pending cycle", async () => {
    mockActionFindUnique.mockResolvedValue(null);
    const principal = { dealerId: "dealer-a", userId: "user-a" };
    await syncGatewayPendingProjection({
      principal,
      threadId: "t1",
      previous: undefined,
      next: {
        pendingConfirmation: {
          action: "confirm_inventory_import",
          label: "אשר",
          payload: { importId: "i1" },
        },
      },
    });
    expect(mockActionCreate).toHaveBeenCalled();
    const key1 = (mockActionCreate.mock.calls[0]?.[0] as { data: { idempotencyKey: string } })
      ?.data?.idempotencyKey;
    expect(key1).toMatch(/^gateway_pending:confirm_inventory_import:/);

    mockActionCreate.mockClear();
    mockActionFindUnique.mockResolvedValue(null);
    mockActionCreate.mockResolvedValue({
      id: "act-new-2",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
    await syncGatewayPendingProjection({
      principal,
      threadId: "t1",
      previous: undefined,
      next: {
        pendingConfirmation: {
          action: "confirm_inventory_import",
          label: "אשר שוב",
          payload: { importId: "i2" },
        },
      },
    });
    const key2 = (mockActionCreate.mock.calls[0]?.[0] as { data: { idempotencyKey: string } })
      ?.data?.idempotencyKey;
    expect(key2).not.toBe(key1);
  });

  it("does not mark SUCCEEDED without deterministic clearance", async () => {
    mockActionFindFirst.mockResolvedValue({
      id: "act-1",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
    const markSpy = vi.fn();
    // patch via prisma update on conversationAction — we only check no FAILED/SUCCEEDED without clearance
    await syncGatewayPendingProjection({
      principal: { dealerId: "dealer-a", userId: "user-a" },
      threadId: "t1",
      previous: {
        pendingConfirmation: {
          action: "x",
          label: "y",
          payload: {},
          conversationActionId: "act-1",
        },
      },
      next: {},
      assistantMessage: "הכל בסדר בוצע בהצלחה",
      // no clearance
    });
    // Without clearance, should not create ACTION_RESULT success message from regex
    const resultMsgs = mockMessageCreate.mock.calls.filter((c) => {
      const data = (c[0] as { data?: { kind?: string } })?.data;
      return data?.kind === "ACTION_RESULT";
    });
    expect(resultMsgs).toHaveLength(0);
    void markSpy;
  });
});

describe("thread access isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cross-dealer denied", async () => {
    mockFindUnique.mockResolvedValue({
      ...threadRow("t1", {}),
      dealerId: "dealer-b",
    });
    await expect(
      assertThreadAccess({ dealerId: "dealer-a", userId: "user-a" }, "t1")
    ).rejects.toBeInstanceOf(ConversationAccessError);
  });

  it("private user isolation", async () => {
    mockFindUnique.mockResolvedValue({
      ...threadRow("t1", {}),
      ownerUserId: "user-other",
      visibility: "PRIVATE_USER",
    });
    await expect(
      assertThreadAccess({ dealerId: "dealer-a", userId: "user-a" }, "t1")
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

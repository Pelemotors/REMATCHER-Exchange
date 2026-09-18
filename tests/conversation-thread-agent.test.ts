import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockFindFirst = vi.fn();
const mockActionFindFirst = vi.fn();
const mockActionFindUnique = vi.fn();
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
    },
    dealerMemoryItem: {
      findFirst: (...args: unknown[]) => mockDealerMemoryFindFirst(...args),
      updateMany: (...args: unknown[]) => mockDealerMemoryUpdateMany(...args),
    },
  },
}));

import {
  loadThreadAgentState,
  saveThreadAgentState,
} from "@/services/assistant/conversation-persistence";
import { assertPendingActionOnThread } from "@/services/conversation/gateway-projection";
import {
  assertThreadAccess,
  ConversationAccessError,
} from "@/services/conversation/auth";
import { splitStateForPersistence } from "@/services/assistant/conversation-persistence";

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

    mockUpdate.mockResolvedValue({});
    await saveThreadAgentState(principal, "thread-a", {
      recentTurns: [{ role: "user", text: "A2" }],
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "thread-a" },
        data: expect.objectContaining({
          agentStateJson: expect.objectContaining({
            recentTurns: [{ role: "user", text: "A2" }],
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
    expect(operational?.recentTurns).toHaveLength(1);
    expect(preferences?.preferredClarificationWording?.year).toBe("שנת ייצור?");
  });
});

describe("confirm action thread binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirm B denied for A pending", async () => {
    mockActionFindFirst.mockResolvedValue(null);
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

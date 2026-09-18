/**
 * Confirm retry: first confirm with clientTurnId X, client loses the
 * response, retry same confirmation with X — executor must not run again.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockTurnCreate = vi.fn();
const mockTurnFindUnique = vi.fn();
const mockTurnUpdate = vi.fn();
const mockTurnUpdateMany = vi.fn();
const mockActionFindUnique = vi.fn();
const mockThreadFindUnique = vi.fn();
const mockActionUpdateMany = vi.fn();
const mockLoadState = vi.fn();
const mockSaveState = vi.fn();
const mockV2 = vi.fn();
const mockAppend = vi.fn();
const mockSync = vi.fn();
const mockLog = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversationTurn: {
      create: (...a: unknown[]) => mockTurnCreate(...a),
      findUnique: (...a: unknown[]) => mockTurnFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => mockTurnFindUnique(...a),
      update: (...a: unknown[]) => mockTurnUpdate(...a),
      updateMany: (...a: unknown[]) => mockTurnUpdateMany(...a),
    },
    conversationAction: {
      findUnique: (...a: unknown[]) => mockActionFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => mockActionFindUnique(...a),
      updateMany: (...a: unknown[]) => mockActionUpdateMany(...a),
    },
    conversationThread: {
      findUnique: (...a: unknown[]) => mockThreadFindUnique(...a),
    },
    inventoryImport: {
      findFirst: vi.fn(async () => null),
    },
  },
}));

vi.mock("@/services/assistant/conversation-persistence", () => ({
  loadThreadAgentState: (...a: unknown[]) => mockLoadState(...a),
  saveThreadAgentState: (...a: unknown[]) => mockSaveState(...a),
  resolveActiveConversationState: (stored: unknown) => stored,
}));

vi.mock("@/services/assistant/v2-orchestrator", () => ({
  runExchangeAssistantV2: (...a: unknown[]) => mockV2(...a),
}));

vi.mock("@/services/conversation/messages", () => ({
  appendMessage: (...a: unknown[]) => mockAppend(...a),
}));

vi.mock("@/services/conversation/gateway-projection", () => ({
  syncGatewayPendingProjection: (...a: unknown[]) => mockSync(...a),
}));

vi.mock("@/services/notifications", () => ({
  logAppEvent: (...a: unknown[]) => mockLog(...a),
}));

vi.mock("@/services/conversation/auth", () => ({
  assertThreadAccess: vi.fn(async () => ({
    id: "thread-1",
    dealerId: "dealer-a",
    ownerUserId: "user-a",
  })),
  ConversationAccessError: class ConversationAccessError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));

import { runAssistantChatTurn } from "@/services/assistant/assistant-chat-turn";

const pendingState = {
  pendingConfirmation: {
    action: "mark_sold",
    label: "אשר",
    payload: { vehicleId: "v1" },
    conversationActionId: "act-1",
  },
};

const firstResultBody = {
  intent: "MARK_SOLD",
  message: "סומן כנמכר",
  conversation: {},
  agentVersion: "test",
};

describe("confirm retry idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppend.mockResolvedValue(undefined);
    mockSaveState.mockResolvedValue(undefined);
    mockSync.mockImplementation(async (input: { next?: unknown }) => input.next);
    mockLog.mockResolvedValue(undefined);
    mockTurnUpdate.mockResolvedValue({});
    mockThreadFindUnique.mockResolvedValue({
      id: "thread-1",
      dealerId: "dealer-a",
    });
    mockActionFindUnique.mockResolvedValue({
      id: "act-1",
      threadId: "thread-1",
      status: "PENDING_CONFIRMATION",
    });
    mockActionUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("lost first confirm response → retry same clientTurnId replays, executor not invoked again", async () => {
    const params = {
      dealerId: "dealer-a",
      userId: "user-a",
      threadId: "thread-1",
      message: "אשר",
      conversationActionId: "act-1",
      clientTurnId: "confirm-turn-X-retry",
      context: { route: "/home", surface: "ios_agent_confirm" as const },
    };
    mockLoadState.mockResolvedValue({ state: pendingState });
    let createdFp: string | undefined;
    mockTurnCreate.mockImplementation(async (args: { data: { requestFingerprint: string } }) => {
      if (createdFp) {
        const err = Object.assign(new Error("Unique constraint"), { code: "P2002" });
        throw err;
      }
      createdFp = args.data.requestFingerprint;
      return {
        id: "turn-row-1",
        threadId: "thread-1",
        clientTurnId: "confirm-turn-X-retry",
        requestFingerprint: createdFp,
        status: "PROCESSING",
      };
    });
    mockV2.mockResolvedValue({
      ...firstResultBody,
      meta: { executionOutcome: "SUCCEEDED", agentVersion: "test" },
    });

    const first = await runAssistantChatTurn(params);

    expect(first.ok).toBe(true);
    if (first.ok) expect(first.replayed).toBe(false);
    expect(mockV2).toHaveBeenCalledTimes(1);
    expect(mockActionUpdateMany).toHaveBeenCalledTimes(1);

    const storedFp = mockTurnCreate.mock.calls[0]?.[0]?.data?.requestFingerprint;
    const storedBody = first.ok ? first.body : {};

    // Client lost the HTTP response. Pending is already cleared on the thread.
    mockLoadState.mockResolvedValue({ state: {} });
    mockTurnFindUnique.mockResolvedValue({
      id: "turn-row-1",
      threadId: "thread-1",
      clientTurnId: "confirm-turn-X-retry",
      requestFingerprint: storedFp,
      status: "COMPLETED",
      resultJson: storedBody,
    });

    const second = await runAssistantChatTurn(params);

    if (!second.ok) {
      throw new Error(`second failed: ${second.error} ${second.message ?? ""}`);
    }
    expect(second.replayed).toBe(true);
    expect(second.body.message).toBe("סומן כנמכר");
    expect(mockV2).toHaveBeenCalledTimes(1);
    expect(mockActionUpdateMany).toHaveBeenCalledTimes(1);
  });
});

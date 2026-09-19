/**
 * Conversation verification gate — regression coverage for P0 fix round.
 * No product redesign; asserts the closed contract paths.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockThreadFindUnique = vi.fn();
const mockThreadUpdate = vi.fn();
const mockActionFindUnique = vi.fn();
const mockActionFindFirst = vi.fn();
const mockActionCreate = vi.fn();
const mockActionUpdate = vi.fn();
const mockMessageFindUnique = vi.fn();
const mockMessageFindMany = vi.fn();
const mockMessageCreate = vi.fn();
const mockDealerMemoryFindFirst = vi.fn();
const mockDealerMemoryUpdateMany = vi.fn();
const mockDealerMemoryUpdate = vi.fn();
const mockDealerMemoryCreate = vi.fn();
const mockVehicleFindFirst = vi.fn();
const mockIntakeBatchFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversationThread: {
      findUnique: (...a: unknown[]) => mockThreadFindUnique(...a),
      update: (...a: unknown[]) => mockThreadUpdate(...a),
    },
    conversationAction: {
      findUnique: (...a: unknown[]) => mockActionFindUnique(...a),
      findFirst: (...a: unknown[]) => mockActionFindFirst(...a),
      create: (...a: unknown[]) => mockActionCreate(...a),
      update: (...a: unknown[]) => mockActionUpdate(...a),
    },
    conversationMessage: {
      findUnique: (...a: unknown[]) => mockMessageFindUnique(...a),
      findMany: (...a: unknown[]) => mockMessageFindMany(...a),
      findFirst: vi.fn(async () => null),
      create: (...a: unknown[]) => mockMessageCreate(...a),
    },
    dealerMemoryItem: {
      findFirst: (...a: unknown[]) => mockDealerMemoryFindFirst(...a),
      updateMany: (...a: unknown[]) => mockDealerMemoryUpdateMany(...a),
      update: (...a: unknown[]) => mockDealerMemoryUpdate(...a),
      create: (...a: unknown[]) => mockDealerMemoryCreate(...a),
    },
    vehicle: {
      findFirst: (...a: unknown[]) => mockVehicleFindFirst(...a),
    },
    intakeBatch: {
      findFirst: (...a: unknown[]) => mockIntakeBatchFindFirst(...a),
    },
  },
}));

vi.mock("@/services/exchange-intelligence/engine", () => ({
  runExchangeIntelligenceEngine: vi.fn(async () => ({
    ok: true as const,
    action: "CHECK_DEMAND",
    subject: { make: "Mazda", model: "CX-5" },
  })),
}));

import { appendMessage, listMessages } from "@/services/conversation/messages";
import {
  loadThreadAgentState,
  splitStateForPersistence,
} from "@/services/assistant/conversation-persistence";
import {
  syncGatewayPendingProjection,
  assertPendingActionOnThread,
} from "@/services/conversation/gateway-projection";
import {
  resolveThreadIntelSubject,
  runThreadIntelligenceAction,
} from "@/services/conversation/thread-intelligence";
import { runExchangeIntelligenceEngine } from "@/services/exchange-intelligence/engine";
import fs from "node:fs";
import path from "node:path";

const principal = { dealerId: "dealer-a", userId: "user-a" };

function threadRow(id: string, state: unknown) {
  return {
    id,
    dealerId: "dealer-a",
    ownerUserId: "user-a",
    title: "t",
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
  };
}

describe("exact-one-message persistence contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThreadFindUnique.mockResolvedValue(threadRow("t1", {}));
    mockThreadUpdate.mockResolvedValue({});
    mockMessageFindUnique.mockResolvedValue(null);
  });

  it("same idempotencyKey yields single USER row", async () => {
    const created = {
      id: "m1",
      threadId: "t1",
      role: "USER",
      kind: "TEXT",
      text: "מה הביקוש לרכב?",
      createdAt: new Date(),
    };
    mockMessageCreate.mockResolvedValueOnce(created);
    const first = await appendMessage(principal, {
      threadId: "t1",
      role: "USER",
      text: "מה הביקוש לרכב?",
      idempotencyKey: "thread:t1:user:turn1",
    });
    expect(first.created).toBe(true);

    mockMessageFindUnique.mockResolvedValue(created);
    const retry = await appendMessage(principal, {
      threadId: "t1",
      role: "USER",
      text: "מה הביקוש לרכב?",
      idempotencyKey: "thread:t1:user:turn1",
    });
    expect(retry.created).toBe(false);
    expect(mockMessageCreate).toHaveBeenCalledTimes(1);
  });

  it("ConversationView must not double-post messages before assistantChat", () => {
    const root = path.resolve(
      __dirname,
      "../../../REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/Screens/ConversationView.swift"
    );
    if (!fs.existsSync(root)) return;
    const src = fs.readFileSync(root, "utf8");
    const send = src.match(/private func sendMessage\(\) async \{[\s\S]*?\n    \}/)?.[0] ?? "";
    expect(send).toContain("assistantChat");
    expect(send).not.toContain("postConversationMessage");
  });
});

describe("persistent confirmation + conversationActionId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThreadFindUnique.mockResolvedValue(threadRow("t1", {}));
    mockThreadUpdate.mockResolvedValue({});
    mockMessageFindUnique.mockResolvedValue(null);
    mockMessageCreate.mockResolvedValue({
      id: "msg",
      threadId: "t1",
      createdAt: new Date(),
    });
    mockActionFindUnique.mockResolvedValue(null);
    mockActionCreate.mockResolvedValue({
      id: "act-real-id",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
  });

  it("projection stamps conversationActionId onto pending", async () => {
    const next = await syncGatewayPendingProjection({
      principal,
      threadId: "t1",
      previous: undefined,
      next: {
        pendingConfirmation: {
          action: "confirm_inventory_import",
          label: "אשר",
          payload: { importId: "imp-1" },
        },
      },
    });
    expect(next?.pendingConfirmation?.conversationActionId).toBe("act-real-id");
    expect(mockActionCreate).toHaveBeenCalled();
  });

  it("assertPendingActionOnThread requires real ConversationAction.id", async () => {
    mockActionFindUnique.mockResolvedValue({
      id: "act-real-id",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
    const ok = await assertPendingActionOnThread({
      principal,
      threadId: "t1",
      actionId: "act-real-id",
    });
    expect(ok.ok).toBe(true);

    mockActionFindUnique.mockResolvedValue({
      id: "act-real-id",
      threadId: "t-other",
      status: "PENDING_CONFIRMATION",
    });
    const denied = await assertPendingActionOnThread({
      principal,
      threadId: "t1",
      actionId: "act-real-id",
    });
    expect(denied.ok).toBe(false);
  });

  it("assertPendingActionOnThread mismatch when thread pending differs", async () => {
    mockActionFindUnique.mockResolvedValue({
      id: "act-a",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
    const denied = await assertPendingActionOnThread({
      principal,
      threadId: "t1",
      actionId: "act-a",
      threadPendingActionId: "act-b",
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe("mismatch");
  });
});

describe("Action Truth + repeated action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThreadFindUnique.mockResolvedValue(threadRow("t1", {}));
    mockThreadUpdate.mockResolvedValue({});
    mockMessageFindUnique.mockResolvedValue(null);
    mockMessageCreate.mockResolvedValue({
      id: "msg",
      threadId: "t1",
      createdAt: new Date(),
    });
    mockActionFindUnique.mockResolvedValue(null);
  });

  it("does not SUCCEED from assistant text without clearance", async () => {
    mockActionFindFirst.mockResolvedValue({
      id: "act-1",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
    await syncGatewayPendingProjection({
      principal,
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
      assistantMessage: "בוצע בהצלחה נשמר במלאי",
    });
    expect(mockActionUpdate).not.toHaveBeenCalled();
    const resultKinds = mockMessageCreate.mock.calls.filter(
      (c) => (c[0] as { data?: { kind?: string } })?.data?.kind === "ACTION_RESULT"
    );
    expect(resultKinds).toHaveLength(0);
  });

  it("FAILED clearance marks ConversationAction FAILED", async () => {
    mockActionFindFirst.mockResolvedValue({
      id: "act-fail",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
    mockActionFindUnique.mockResolvedValue({
      id: "act-fail",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
    mockActionUpdate.mockResolvedValue({
      id: "act-fail",
      status: "FAILED",
    });
    await syncGatewayPendingProjection({
      principal,
      threadId: "t1",
      previous: {
        pendingConfirmation: {
          action: "mark_sold",
          label: "y",
          payload: {},
          conversationActionId: "act-fail",
        },
      },
      next: {},
      clearance: "failed",
    });
    expect(mockActionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      })
    );
  });

  it("NO_EXECUTION clearance never SUCCEEDS", async () => {
    mockActionFindFirst.mockResolvedValue({
      id: "act-ne",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
    mockActionFindUnique.mockResolvedValue({
      id: "act-ne",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
    mockActionUpdate.mockResolvedValue({
      id: "act-ne",
      status: "CANCELLED",
    });
    await syncGatewayPendingProjection({
      principal,
      threadId: "t1",
      previous: {
        pendingConfirmation: {
          action: "create_inventory",
          label: "y",
          payload: {},
          conversationActionId: "act-ne",
        },
      },
      next: {},
      clearance: "no_execution",
    });
    expect(mockActionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED" }),
      })
    );
    const statuses = mockActionUpdate.mock.calls.map(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status
    );
    expect(statuses).not.toContain("SUCCEEDED");
  });

  it("SUCCEEDED only with clearance=succeeded", async () => {
    mockActionFindFirst.mockResolvedValue({
      id: "act-1",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
    mockActionFindUnique.mockResolvedValue({
      id: "act-1",
      threadId: "t1",
      status: "PENDING_CONFIRMATION",
    });
    mockActionUpdate.mockResolvedValue({
      id: "act-1",
      status: "SUCCEEDED",
    });
    await syncGatewayPendingProjection({
      principal,
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
      assistantMessage: "anything",
      clearance: "succeeded",
    });
    expect(mockActionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED" }),
      })
    );
  });

  it("second identical action type gets a new ConversationAction", async () => {
    mockActionCreate
      .mockResolvedValueOnce({
        id: "act-1",
        threadId: "t1",
        status: "PENDING_CONFIRMATION",
      })
      .mockResolvedValueOnce({
        id: "act-2",
        threadId: "t1",
        status: "PENDING_CONFIRMATION",
      });

    const a = await syncGatewayPendingProjection({
      principal,
      threadId: "t1",
      previous: undefined,
      next: {
        pendingConfirmation: {
          action: "confirm_inventory_import",
          label: "1",
          payload: { importId: "a" },
        },
      },
    });
    const b = await syncGatewayPendingProjection({
      principal,
      threadId: "t1",
      previous: undefined,
      next: {
        pendingConfirmation: {
          action: "confirm_inventory_import",
          label: "2",
          payload: { importId: "b" },
        },
      },
    });
    expect(a?.pendingConfirmation?.conversationActionId).toBe("act-1");
    expect(b?.pendingConfirmation?.conversationActionId).toBe("act-2");
    const keys = mockActionCreate.mock.calls.map(
      (c) => (c[0] as { data: { idempotencyKey: string } }).data.idempotencyKey
    );
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("gateway-projection source has no success regex", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../src/services/conversation/gateway-projection.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/\/ביטל\|לא בוצע\|נדחה\//);
    expect(src).toContain("clearance");
  });
});

describe("legacy isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDealerMemoryUpdateMany.mockResolvedValue({ count: 1 });
    mockDealerMemoryUpdate.mockResolvedValue({});
    mockDealerMemoryCreate.mockResolvedValue({});
  });

  it("never imports pendingConfirmation from legacy blob", async () => {
    mockThreadFindUnique.mockResolvedValue(threadRow("new", null));
    mockDealerMemoryFindFirst.mockResolvedValue({
      id: "mem-1",
      details: {
        state: {
          pendingConfirmation: {
            action: "stale_confirm",
            label: "old",
            payload: { x: 1 },
          },
          pendingInventoryMutation: {
            type: "UPDATE",
            vehicleId: "v1",
            status: "WAITING_CONFIRMATION",
            label: "x",
          },
          focusedObject: { type: "vehicle", id: "v-old" },
          recentTurns: [{ role: "user", text: "legacy" }],
        },
      },
    });
    mockThreadUpdate.mockResolvedValue({});

    const { state } = await loadThreadAgentState(principal, "new");
    expect(state?.pendingConfirmation).toBeUndefined();
    expect(state?.pendingInventoryMutation).toBeUndefined();
    expect(state?.recentTurns).toBeUndefined();
    expect(state?.focusedObject).toBeUndefined();
  });

  it("split still keeps pending in operational for live threads", () => {
    const { operational } = splitStateForPersistence({
      pendingConfirmation: { action: "a", label: "b", payload: {} },
    });
    expect(operational.pendingConfirmation).toBeDefined();
  });
});

describe("latest-50 pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThreadFindUnique.mockResolvedValue(threadRow("t1", {}));
  });

  it("initial page returns newest messages in chronological order", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `m${50 - i}`,
      threadId: "t1",
      role: "USER",
      kind: "TEXT",
      text: `msg-${50 - i}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 50 - i)),
    }));
    mockMessageFindMany.mockResolvedValue(rows);

    const page = await listMessages({
      principal,
      threadId: "t1",
      limit: 50,
    });
    expect(page.messages).toHaveLength(50);
    expect(page.messages[0]?.id).toBe("m1");
    expect(page.messages[49]?.id).toBe("m50");
    expect(page.nextCursor).toBe("m1");
    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        take: 51,
      })
    );
  });
});

describe("thread-aware intelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThreadFindUnique.mockResolvedValue(
      threadRow("t1", {
        focusedObject: { type: "vehicle", id: "veh-1" },
      })
    );
    mockDealerMemoryFindFirst.mockResolvedValue(null);
    mockMessageFindUnique.mockResolvedValue(null);
    mockMessageCreate.mockResolvedValue({
      id: "intel-msg",
      threadId: "t1",
      text: "תוצאה",
      createdAt: new Date(),
    });
    mockThreadUpdate.mockResolvedValue({});
    mockIntakeBatchFindFirst.mockResolvedValue(null);
    mockVehicleFindFirst.mockResolvedValue(null);
  });

  it("resolves subject from thread focusedObject", async () => {
    const r = await resolveThreadIntelSubject(principal, "t1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.subject).toEqual({ vehicleId: "veh-1" });
  });

  it("no-subject asks clarification instead of calling engine", async () => {
    mockThreadFindUnique.mockResolvedValue(threadRow("empty", {}));
    mockIntakeBatchFindFirst.mockResolvedValue(null);
    vi.mocked(runExchangeIntelligenceEngine).mockClear();

    const resolved = await resolveThreadIntelSubject(principal, "empty");
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.prompt).toMatch(/רכב/);
    }

    const out = await runThreadIntelligenceAction({
      principal,
      threadId: "empty",
      action: "CHECK_DEMAND",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("no_subject");
    expect(runExchangeIntelligenceEngine).not.toHaveBeenCalled();
  });
});

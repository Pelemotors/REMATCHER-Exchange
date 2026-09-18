/**
 * Unit tests for ConversationTurn claim + Action PENDING→EXECUTING claim.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockTurnCreate = vi.fn();
const mockTurnFindUnique = vi.fn();
const mockTurnUpdateMany = vi.fn();
const mockTurnUpdate = vi.fn();
const mockActionUpdateMany = vi.fn();
const mockActionFindUnique = vi.fn();
const mockThreadFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversationTurn: {
      create: (...a: unknown[]) => mockTurnCreate(...a),
      findUnique: (...a: unknown[]) => mockTurnFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => mockTurnFindUnique(...a),
      updateMany: (...a: unknown[]) => mockTurnUpdateMany(...a),
      update: (...a: unknown[]) => mockTurnUpdate(...a),
    },
    conversationAction: {
      updateMany: (...a: unknown[]) => mockActionUpdateMany(...a),
      findUnique: (...a: unknown[]) => mockActionFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => mockActionFindUnique(...a),
    },
    conversationThread: {
      findUnique: (...a: unknown[]) => mockThreadFindUnique(...a),
    },
  },
}));

vi.mock("@/services/conversation/auth", () => ({
  assertThreadAccess: vi.fn(async () => ({
    id: "t1",
    dealerId: "dealer-a",
    ownerUserId: "user-a",
  })),
}));

import {
  buildTurnRequestFingerprint,
  claimConversationTurn,
} from "@/services/conversation/turn-claim";
import { claimPendingActionForExecution } from "@/services/conversation/actions";

const principal = { dealerId: "dealer-a", userId: "user-a" };

describe("turn fingerprint", () => {
  it("is stable for same payload and differs when message changes", () => {
    const a = buildTurnRequestFingerprint({
      threadId: "t1",
      message: "שמור",
      conversationActionId: "act-1",
      context: { route: "/home", surface: "ios" },
    });
    const b = buildTurnRequestFingerprint({
      threadId: "t1",
      message: "שמור",
      conversationActionId: "act-1",
      context: { route: "/home", surface: "ios" },
    });
    const c = buildTurnRequestFingerprint({
      threadId: "t1",
      message: "בדוק ביקוש",
      conversationActionId: "act-1",
      context: { route: "/home", surface: "ios" },
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("claimConversationTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("owner wins on create", async () => {
    mockTurnCreate.mockResolvedValue({
      id: "turn-1",
      threadId: "t1",
      clientTurnId: "X",
      requestFingerprint: "fp",
      status: "PROCESSING",
    });
    const r = await claimConversationTurn({
      threadId: "t1",
      clientTurnId: "X",
      requestFingerprint: "fp",
    });
    expect(r.ok && r.owned).toBe(true);
  });

  it("COMPLETED same fingerprint → replay", async () => {
    mockTurnCreate.mockRejectedValue({ code: "P2002" });
    mockTurnFindUnique.mockResolvedValue({
      id: "turn-1",
      threadId: "t1",
      clientTurnId: "X",
      requestFingerprint: "fp",
      status: "COMPLETED",
      resultJson: { message: "ok", replayed: true },
    });
    const r = await claimConversationTurn({
      threadId: "t1",
      clientTurnId: "X",
      requestFingerprint: "fp",
    });
    expect(r.ok).toBe(true);
    if (r.ok && !r.owned) {
      expect(r.kind).toBe("replay");
      expect(r.body.message).toBe("ok");
    }
  });

  it("same id different fingerprint → IDEMPOTENCY_CONFLICT", async () => {
    mockTurnCreate.mockRejectedValue({ code: "P2002" });
    mockTurnFindUnique.mockResolvedValue({
      id: "turn-1",
      threadId: "t1",
      clientTurnId: "X",
      requestFingerprint: "fp-a",
      status: "COMPLETED",
      resultJson: {},
    });
    const r = await claimConversationTurn({
      threadId: "t1",
      clientTurnId: "X",
      requestFingerprint: "fp-b",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("PROCESSING with live lease → TURN_IN_PROGRESS", async () => {
    mockTurnCreate.mockRejectedValue({ code: "P2002" });
    mockTurnFindUnique.mockResolvedValue({
      id: "turn-1",
      threadId: "t1",
      clientTurnId: "X",
      requestFingerprint: "fp",
      status: "PROCESSING",
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    const r = await claimConversationTurn({
      threadId: "t1",
      clientTurnId: "X",
      requestFingerprint: "fp",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("TURN_IN_PROGRESS");
  });
});

describe("claimPendingActionForExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThreadFindUnique.mockResolvedValue({
      id: "t1",
      dealerId: "dealer-a",
      ownerUserId: "user-a",
      visibility: "PRIVATE_USER",
      status: "ACTIVE",
    });
  });

  it("atomic PENDING → EXECUTING when count=1", async () => {
    mockActionUpdateMany.mockResolvedValue({ count: 1 });
    mockActionFindUnique.mockResolvedValue({
      id: "act-1",
      threadId: "t1",
      status: "EXECUTING",
    });
    const r = await claimPendingActionForExecution({
      principal,
      threadId: "t1",
      actionId: "act-1",
    });
    expect(r.ok).toBe(true);
    expect(mockActionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "act-1",
          status: "PENDING_CONFIRMATION",
        }),
        data: { status: "EXECUTING" },
      })
    );
  });

  it("second claim while EXECUTING → ACTION_IN_PROGRESS", async () => {
    mockActionUpdateMany.mockResolvedValue({ count: 0 });
    mockActionFindUnique.mockResolvedValue({
      id: "act-1",
      threadId: "t1",
      status: "EXECUTING",
    });
    const r = await claimPendingActionForExecution({
      principal,
      threadId: "t1",
      actionId: "act-1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("ACTION_IN_PROGRESS");
  });

  it("SUCCEEDED → ACTION_ALREADY_COMPLETED", async () => {
    mockActionUpdateMany.mockResolvedValue({ count: 0 });
    mockActionFindUnique.mockResolvedValue({
      id: "act-1",
      threadId: "t1",
      status: "SUCCEEDED",
    });
    const r = await claimPendingActionForExecution({
      principal,
      threadId: "t1",
      actionId: "act-1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("ACTION_ALREADY_COMPLETED");
  });
});

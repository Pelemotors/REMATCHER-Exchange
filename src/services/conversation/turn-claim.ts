import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import type { ConversationTurn } from "@prisma/client";

export const TURN_LEASE_MS = 120_000;

export type TurnClaimResult =
  | { ok: true; owned: true; turn: ConversationTurn }
  | {
      ok: true;
      owned: false;
      kind: "replay";
      turn: ConversationTurn;
      body: Record<string, unknown>;
    }
  | {
      ok: false;
      error: "IDEMPOTENCY_CONFLICT" | "TURN_IN_PROGRESS";
      message: string;
    };

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** Deterministic fingerprint for turn identity (no timestamps / random). */
export function buildTurnRequestFingerprint(input: {
  threadId: string;
  message: string;
  conversationActionId?: string;
  context?: {
    route?: string;
    mode?: string;
    surface?: string;
    entityType?: string;
    entityId?: string;
  };
}): string {
  const payload = {
    threadId: input.threadId,
    message: input.message.trim(),
    conversationActionId: input.conversationActionId?.trim() || null,
    context: {
      route: input.context?.route ?? null,
      mode: input.context?.mode ?? null,
      surface: input.context?.surface ?? null,
      entityType: input.context?.entityType ?? null,
      entityId: input.context?.entityId ?? null,
    },
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function leaseExpiry(from = new Date()): Date {
  return new Date(from.getTime() + TURN_LEASE_MS);
}

/**
 * Atomic claim for clientTurnId. Only the owner may run orchestrator/executor.
 */
export async function claimConversationTurn(input: {
  threadId: string;
  clientTurnId: string;
  requestFingerprint: string;
}): Promise<TurnClaimResult> {
  const now = new Date();
  try {
    const turn = await prisma.conversationTurn.create({
      data: {
        threadId: input.threadId,
        clientTurnId: input.clientTurnId,
        requestFingerprint: input.requestFingerprint,
        status: "PROCESSING",
        claimedAt: now,
        leaseExpiresAt: leaseExpiry(now),
      },
    });
    return { ok: true, owned: true, turn };
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code !== "P2002") throw e;
  }

  const existing = await prisma.conversationTurn.findUnique({
    where: {
      threadId_clientTurnId: {
        threadId: input.threadId,
        clientTurnId: input.clientTurnId,
      },
    },
  });
  if (!existing) {
    return {
      ok: false,
      error: "TURN_IN_PROGRESS",
      message: "turn claim race — retry same clientTurnId",
    };
  }

  if (existing.requestFingerprint !== input.requestFingerprint) {
    return {
      ok: false,
      error: "IDEMPOTENCY_CONFLICT",
      message: "same clientTurnId used with a different request",
    };
  }

  if (existing.status === "COMPLETED") {
    const body =
      existing.resultJson &&
      typeof existing.resultJson === "object" &&
      !Array.isArray(existing.resultJson)
        ? (existing.resultJson as Record<string, unknown>)
        : {};
    return { ok: true, owned: false, kind: "replay", turn: existing, body };
  }

  if (existing.status === "FAILED") {
    return {
      ok: false,
      error: "IDEMPOTENCY_CONFLICT",
      message: "clientTurnId already failed — use a new clientTurnId",
    };
  }

  // PROCESSING — try stale reclaim
  if (existing.leaseExpiresAt.getTime() < now.getTime()) {
    const reclaimed = await prisma.conversationTurn.updateMany({
      where: {
        id: existing.id,
        status: "PROCESSING",
        leaseExpiresAt: { lt: now },
      },
      data: {
        claimedAt: now,
        leaseExpiresAt: leaseExpiry(now),
        requestFingerprint: input.requestFingerprint,
      },
    });
    if (reclaimed.count === 1) {
      const turn = await prisma.conversationTurn.findUniqueOrThrow({
        where: { id: existing.id },
      });
      return { ok: true, owned: true, turn };
    }
  }

  return {
    ok: false,
    error: "TURN_IN_PROGRESS",
    message: "turn still processing — retry same clientTurnId",
  };
}

export async function completeConversationTurn(input: {
  turnId: string;
  body: Record<string, unknown>;
}): Promise<void> {
  await prisma.conversationTurn.update({
    where: { id: input.turnId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      resultJson: toPrismaJson(input.body),
    },
  });
}

export async function failConversationTurn(input: {
  turnId: string;
  reason?: string;
}): Promise<void> {
  await prisma.conversationTurn.update({
    where: { id: input.turnId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      resultJson: toPrismaJson({ reason: input.reason ?? "failed" }),
    },
  });
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { confirmImport } from "@/services/inventory/import";
import { logAppEvent } from "@/services/notifications";
import {
  isConfirmation,
  isRejection,
  type ConversationState,
} from "@/services/assistant/conversation-state";
import {
  loadThreadAgentState,
  resolveActiveConversationState,
  saveThreadAgentState,
} from "@/services/assistant/conversation-persistence";
import { runExchangeAssistantV2 } from "@/services/assistant/v2-orchestrator";
import {
  AGENT_VERSION,
  type AgentMeta,
} from "@/services/assistant/tools/registry";
import { appendMessage } from "@/services/conversation/messages";
import {
  syncGatewayPendingProjection,
  type ProjectionClearance,
} from "@/services/conversation/gateway-projection";
import {
  claimConversationTurn,
  buildTurnRequestFingerprint,
  completeConversationTurn,
  failConversationTurn,
} from "@/services/conversation/turn-claim";
import { claimPendingActionForExecution } from "@/services/conversation/actions";
import type { ConversationPrincipal } from "@/services/conversation/types";
import { ConversationAccessError } from "@/services/conversation/auth";

export type AssistantChatUiContext = {
  route: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  surface?: string;
  mode?: "inventory_management";
  vehicleId?: string;
  demandId?: string;
  matchId?: string;
};

export type AssistantChatTurnResult =
  | {
      ok: false;
      error:
        | "message_required"
        | "thread_required"
        | "thread_forbidden"
        | "thread_not_found"
        | "action_mismatch"
        | "IDEMPOTENCY_CONFLICT"
        | "TURN_IN_PROGRESS"
        | "ACTION_IN_PROGRESS"
        | "ACTION_ALREADY_COMPLETED"
        | "ACTION_TERMINAL";
      message?: string;
    }
  | {
      ok: true;
      body: Record<string, unknown>;
      /** True when an identical clientTurnId already completed. */
      replayed?: boolean;
    };

function clearanceFromExecutionOutcome(
  outcome: AgentMeta["executionOutcome"] | undefined
): ProjectionClearance | undefined {
  if (!outcome) return undefined;
  if (outcome === "SUCCEEDED") return "succeeded";
  if (outcome === "FAILED") return "failed";
  if (outcome === "CANCELLED") return "cancelled";
  if (outcome === "NO_EXECUTION") return "no_execution";
  return undefined;
}

function normalizeClientTurnId(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  // Stable client UUID / opaque id — reject empty / oversized.
  if (t.length < 8 || t.length > 128) return undefined;
  return t;
}

export async function getAssistantConversationPayload(
  principal: ConversationPrincipal,
  threadId: string
) {
  const { state } = await loadThreadAgentState(principal, threadId);
  return {
    threadId,
    conversation: state ?? {},
    recentTurns: state?.recentTurns ?? [],
    pendingConfirmation: state?.pendingConfirmation ?? null,
    requiresConfirmation: state?.pendingConfirmation ?? null,
  };
}

async function persistTurnMessages(params: {
  principal: ConversationPrincipal;
  threadId: string;
  userText: string;
  assistantText: string | null | undefined;
  turnKey: string;
}) {
  await appendMessage(params.principal, {
    threadId: params.threadId,
    role: "USER",
    kind: "TEXT",
    text: params.userText,
    source: "USER_TEXT",
    idempotencyKey: `thread:${params.threadId}:user:${params.turnKey}`,
  }).catch(() => undefined);

  if (params.assistantText && params.assistantText.trim()) {
    await appendMessage(params.principal, {
      threadId: params.threadId,
      role: "ASSISTANT",
      kind: "TEXT",
      text: params.assistantText,
      source: "AGENT",
      idempotencyKey: `thread:${params.threadId}:assistant:${params.turnKey}`,
    }).catch(() => undefined);
  }
}

/**
 * Shared Web + Mobile assistant turn — THREAD-SCOPED operational state.
 * Client conversation never overrides stored thread state.
 * Persist USER+ASSISTANT here only (clients must not double-POST /messages).
 *
 * Action Truth: ConversationAction clearance comes only from
 * meta.executionOutcome (or explicit save clearance) — never from "אשר" text.
 */
export async function runAssistantChatTurn(params: {
  dealerId: string;
  userId: string;
  threadId?: string;
  message?: string;
  context?: AssistantChatUiContext;
  clientConversation?: ConversationState;
  /** Stable client UUID for the send lifecycle (HTTP retries reuse it). */
  clientTurnId?: string;
  /**
   * Mobile Conversation confirm path: must equal thread pending ConversationAction.id.
   * When set, mismatch aborts with zero execution.
   */
  conversationActionId?: string;
}): Promise<AssistantChatTurnResult> {
  const message = params.message?.trim();
  if (!message) return { ok: false, error: "message_required" };

  const threadId = params.threadId?.trim();
  if (!threadId) return { ok: false, error: "thread_required" };

  const principal: ConversationPrincipal = {
    dealerId: params.dealerId,
    userId: params.userId,
  };

  let stored: ConversationState | undefined;
  try {
    ({ state: stored } = await loadThreadAgentState(principal, threadId));
  } catch (e) {
    if (e instanceof ConversationAccessError) {
      return {
        ok: false,
        error: e.code === "forbidden" ? "thread_forbidden" : "thread_not_found",
      };
    }
    throw e;
  }

  const { dealerId, userId } = params;
  const active = resolveActiveConversationState(
    stored,
    params.clientConversation
  );

  // Exact ConversationAction binding (Mobile confirm path).
  const expectedActionId = params.conversationActionId?.trim();
  if (expectedActionId) {
    const pendingId = active?.pendingConfirmation?.conversationActionId;
    if (!pendingId || pendingId !== expectedActionId) {
      return {
        ok: false,
        error: "action_mismatch",
        message:
          "stale or mismatched conversationActionId — no execution",
      };
    }
    const row = await prisma.conversationAction.findUnique({
      where: { id: expectedActionId },
    });
    if (!row || row.threadId !== threadId) {
      return {
        ok: false,
        error: "action_mismatch",
        message:
          "conversationActionId not pending on this thread — no execution",
      };
    }
    const thread = await prisma.conversationThread.findUnique({
      where: { id: threadId },
      select: { dealerId: true },
    });
    if (!thread || thread.dealerId !== dealerId) {
      return {
        ok: false,
        error: "action_mismatch",
        message: "conversationAction authority mismatch — no execution",
      };
    }
  }

  const clientTurnId = normalizeClientTurnId(params.clientTurnId);
  const turnKey =
    clientTurnId ??
    `${Date.now()}_${Buffer.from(message).toString("base64url").slice(0, 32)}`;

  let ownedTurnId: string | undefined;
  if (clientTurnId) {
    const fingerprint = buildTurnRequestFingerprint({
      threadId,
      message,
      conversationActionId: expectedActionId,
      context: params.context,
    });
    const claim = await claimConversationTurn({
      threadId,
      clientTurnId,
      requestFingerprint: fingerprint,
    });
    if (!claim.ok) {
      return {
        ok: false,
        error: claim.error,
        message: claim.message,
      };
    }
    if (!claim.owned) {
      const body = {
        ...claim.body,
        threadId,
        clientTurnId,
        replayed: true,
        agentVersion:
          typeof claim.body.agentVersion === "string"
            ? claim.body.agentVersion
            : AGENT_VERSION,
      };
      return { ok: true, body, replayed: true };
    }
    ownedTurnId = claim.turn.id;
  }

  // Confirm / cancel: atomic PENDING → EXECUTING before any executor.
  const pendingActionId =
    expectedActionId ||
    active?.pendingConfirmation?.conversationActionId ||
    undefined;
  if (
    pendingActionId &&
    active?.pendingConfirmation &&
    (isConfirmation(message) || isRejection(message))
  ) {
    if (isConfirmation(message)) {
      const actionClaim = await claimPendingActionForExecution({
        principal,
        threadId,
        actionId: pendingActionId,
      });
      if (!actionClaim.ok) {
        if (ownedTurnId) {
          await failConversationTurn({
            turnId: ownedTurnId,
            reason: actionClaim.error,
          }).catch(() => undefined);
        }
        return {
          ok: false,
          error:
            actionClaim.error === "ACTION_IN_PROGRESS"
              ? "ACTION_IN_PROGRESS"
              : actionClaim.error === "ACTION_ALREADY_COMPLETED"
                ? "ACTION_ALREADY_COMPLETED"
                : actionClaim.error === "ACTION_TERMINAL"
                  ? "ACTION_TERMINAL"
                  : "action_mismatch",
          message: actionClaim.error,
        };
      }
    }
  }

  await logAppEvent({
    eventType: "assistant_opened",
    dealerId,
    metadata: { userId, threadId },
  });

  const finishOk = async (
    body: Record<string, unknown>
  ): Promise<AssistantChatTurnResult> => {
    const out = { ...body, clientTurnId: turnKey, threadId };
    if (ownedTurnId) {
      await completeConversationTurn({ turnId: ownedTurnId, body: out });
    }
    return { ok: true, body: out, replayed: false };
  };

  const save = async (
    next: ConversationState | undefined,
    previous: ConversationState | undefined,
    assistantMessage?: string,
    clearance?: ProjectionClearance,
    executionOutcome?: AgentMeta["executionOutcome"]
  ): Promise<ConversationState | undefined> => {
    await saveThreadAgentState(principal, threadId, next);
    const resolvedClearance =
      clearance ?? clearanceFromExecutionOutcome(executionOutcome);
    return syncGatewayPendingProjection({
      principal,
      threadId,
      previous,
      next,
      assistantMessage,
      clearance: resolvedClearance,
    });
  };

  try {
  if (/בדוק את קובץ המלאי שהעליתי|בדיקת קובץ מלאי/i.test(message)) {
    const job = await prisma.inventoryImport.findFirst({
      where: { dealerId, status: "PREVIEW" },
      orderBy: { createdAt: "desc" },
    });
    if (!job) {
      const text = "לא מצאתי קובץ מלאי שממתין לבדיקה.";
      await persistTurnMessages({
        principal,
        threadId,
        userText: message,
        assistantText: text,
        turnKey,
      });
      return finishOk({
        intent: "UPDATE_INVENTORY",
        message: text,
        conversation: active ?? {},
        agentVersion: AGENT_VERSION,
      });
    }
    const p = job.previewJson as unknown as {
      rows?: Array<{
        valid?: boolean;
        warnings?: string[];
        duplicateOfVehicleId?: string | null;
      }>;
    };
    const rows = p.rows ?? [];
    const valid = rows.filter((r) => r.valid).length;
    const attention = rows.filter((r) => (r.warnings?.length ?? 0) > 0).length;
    const duplicates = rows.filter((r) => r.duplicateOfVehicleId).length;
    const text = `קלטתי ${rows.length} שורות: ${valid} תקינות, ${attention} דורשות תשומת לב${duplicates ? `, ${duplicates} מזוהות כעדכון קיים` : ""}. רק שורות תקינות ייקלטו. לא אסמן רכבים חסרים כנמכרו. לאשר את הקליטה?`;
    const next: ConversationState = {
      ...(active ?? {}),
      pendingConfirmation: {
        action: "confirm_inventory_import",
        label: "אשר קליטת מלאי",
        payload: { importId: job.id },
      },
      goal: "inventory_import_review",
      recentTurns: [
        ...(active?.recentTurns ?? []),
        { role: "user" as const, text: "בדיקת קובץ מלאי" },
        { role: "assistant" as const, text },
      ].slice(-12),
    };
    const saved = await save(next, active, text);
    await persistTurnMessages({
      principal,
      threadId,
      userText: message,
      assistantText: text,
      turnKey,
    });
    const pending = saved?.pendingConfirmation ?? next.pendingConfirmation;
    return finishOk({
      intent: "UPDATE_INVENTORY",
      message: text,
      requiresConfirmation: pending,
      conversation: saved ?? next,
      agentVersion: AGENT_VERSION,
    });
  }

  if (active?.pendingConfirmation?.action === "confirm_inventory_import") {
    if (isRejection(message)) {
      const next: ConversationState = {
        ...active,
        pendingConfirmation: undefined,
        goal: undefined,
      };
      const text = "ביטלתי. הקובץ נשאר כטיוטה ולא שינה את המלאי.";
      await save(next, active, text, "cancelled");
      await persistTurnMessages({
        principal,
        threadId,
        userText: message,
        assistantText: text,
        turnKey,
      });
      return finishOk({
        intent: "UPDATE_INVENTORY",
        message: text,
        conversation: next,
        agentVersion: AGENT_VERSION,
      });
    }
    if (isConfirmation(message)) {
      const importId = String(
        active.pendingConfirmation.payload.importId ?? ""
      );
      try {
        const result = await confirmImport({
          dealerId,
          importId,
          markMissingAsSold: false,
        });
        const text = `בוצע. ${result.created} רכבים חדשים נקלטו ו-${result.updated} עודכנו. המלאי כבר זמין ל-matching ולסוכן האישי.`;
        const next: ConversationState = {
          ...active,
          pendingConfirmation: undefined,
          goal: undefined,
          recentTurns: [
            ...(active?.recentTurns ?? []),
            { role: "user" as const, text: message },
            { role: "assistant" as const, text },
          ].slice(-12),
        };
        await save(next, active, text, "succeeded");
        await persistTurnMessages({
          principal,
          threadId,
          userText: message,
          assistantText: text,
          turnKey,
        });
        return finishOk({
          intent: "UPDATE_INVENTORY",
          message: text,
          conversation: next,
          agentVersion: AGENT_VERSION,
        });
      } catch {
        const text = "לא הצלחתי לאשר את קליטת המלאי. נסה שוב.";
        const next: ConversationState = {
          ...active,
          pendingConfirmation: undefined,
          goal: undefined,
        };
        await save(next, active, text, "failed");
        await persistTurnMessages({
          principal,
          threadId,
          userText: message,
          assistantText: text,
          turnKey,
        });
        return finishOk({
          intent: "UPDATE_INVENTORY",
          message: text,
          conversation: next,
          agentVersion: AGENT_VERSION,
        });
      }
    }
  }

  const response = await runExchangeAssistantV2({
    dealerId,
    userId,
    message,
    context: params.context ?? { route: "/" },
    conversation: active,
  });
  const saved = await save(
    response.conversation,
    active,
    response.message,
    undefined,
    response.meta?.executionOutcome
  );
  const assistantText =
    typeof response.message === "string" ? response.message : null;
  await persistTurnMessages({
    principal,
    threadId,
    userText: message,
    assistantText,
    turnKey,
  });
  const conversation = saved ?? response.conversation;
  return finishOk({
    ...response,
    conversation,
    requiresConfirmation:
      conversation?.pendingConfirmation ?? response.requiresConfirmation,
    agentVersion: response.meta?.agentVersion ?? AGENT_VERSION,
  });
  } catch (err) {
    if (ownedTurnId) {
      await failConversationTurn({
        turnId: ownedTurnId,
        reason: err instanceof Error ? err.message : "turn_failed",
      }).catch(() => undefined);
    }
    throw err;
  }
}

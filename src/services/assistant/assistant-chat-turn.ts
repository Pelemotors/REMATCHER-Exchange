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
import { AGENT_VERSION } from "@/services/assistant/tools/registry";
import { appendMessage } from "@/services/conversation/messages";
import {
  syncGatewayPendingProjection,
  type ProjectionClearance,
} from "@/services/conversation/gateway-projection";
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
        | "thread_not_found";
    }
  | {
      ok: true;
      body: Record<string, unknown>;
    };

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

function clearanceForTurn(
  message: string,
  previous: ConversationState | undefined,
  next: ConversationState | undefined
): ProjectionClearance | undefined {
  if (!previous?.pendingConfirmation || next?.pendingConfirmation) {
    return undefined;
  }
  if (isConfirmation(message)) return "succeeded";
  if (isRejection(message)) return "cancelled";
  return undefined;
}

/**
 * Shared Web + Mobile assistant turn — THREAD-SCOPED operational state.
 * Client conversation never overrides stored thread state.
 * Persist USER+ASSISTANT here only (clients must not double-POST /messages).
 */
export async function runAssistantChatTurn(params: {
  dealerId: string;
  userId: string;
  threadId?: string;
  message?: string;
  context?: AssistantChatUiContext;
  clientConversation?: ConversationState;
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

  const turnKey = `${Date.now()}_${Buffer.from(message).toString("base64url").slice(0, 32)}`;

  await logAppEvent({
    eventType: "assistant_opened",
    dealerId,
    metadata: { userId, threadId },
  });

  const save = async (
    next: ConversationState | undefined,
    previous: ConversationState | undefined,
    assistantMessage?: string,
    clearance?: ProjectionClearance
  ): Promise<ConversationState | undefined> => {
    await saveThreadAgentState(principal, threadId, next);
    const resolvedClearance =
      clearance ?? clearanceForTurn(message, previous, next);
    return syncGatewayPendingProjection({
      principal,
      threadId,
      previous,
      next,
      assistantMessage,
      clearance: resolvedClearance,
    });
  };

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
      return {
        ok: true,
        body: {
          intent: "UPDATE_INVENTORY",
          message: text,
          conversation: active ?? {},
          threadId,
          agentVersion: AGENT_VERSION,
        },
      };
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
    return {
      ok: true,
      body: {
        intent: "UPDATE_INVENTORY",
        message: text,
        requiresConfirmation: pending,
        conversation: saved ?? next,
        threadId,
        agentVersion: AGENT_VERSION,
      },
    };
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
      return {
        ok: true,
        body: {
          intent: "UPDATE_INVENTORY",
          message: text,
          conversation: next,
          threadId,
          agentVersion: AGENT_VERSION,
        },
      };
    }
    if (isConfirmation(message)) {
      const importId = String(
        active.pendingConfirmation.payload.importId ?? ""
      );
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
          ...(active.recentTurns ?? []),
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
      return {
        ok: true,
        body: {
          intent: "UPDATE_INVENTORY",
          message: text,
          conversation: next,
          threadId,
          agentVersion: AGENT_VERSION,
        },
      };
    }
  }

  const response = await runExchangeAssistantV2({
    dealerId,
    userId,
    message,
    context: params.context ?? { route: "/" },
    conversation: active,
  });
  const saved = await save(response.conversation, active, response.message);
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
  return {
    ok: true,
    body: {
      ...response,
      conversation,
      requiresConfirmation:
        conversation?.pendingConfirmation ?? response.requiresConfirmation,
      threadId,
      agentVersion: response.meta?.agentVersion ?? AGENT_VERSION,
    },
  };
}

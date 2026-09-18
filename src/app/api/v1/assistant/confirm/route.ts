/**
 * Mobile Action Gateway confirmation — thread-scoped.
 * Stored ConversationThread.agentStateJson remains mutation authority.
 * conversationActionId is REQUIRED and must bind exactly to thread pending.
 */
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { runAssistantChatTurn } from "@/services/assistant/assistant-chat-turn";
import { loadThreadAgentState } from "@/services/assistant/conversation-persistence";
import { assertPendingActionOnThread } from "@/services/conversation/gateway-projection";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    confirmed?: unknown;
    action?: unknown;
    conversationActionId?: unknown;
    threadId?: unknown;
    clientTurnId?: unknown;
  };

  if (typeof body.confirmed !== "boolean") {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const threadId =
    typeof body.threadId === "string" ? body.threadId.trim() : "";
  if (!threadId) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST", "threadId required");
  }

  const conversationActionId =
    typeof body.conversationActionId === "string"
      ? body.conversationActionId.trim()
      : "";

  // Mobile Conversation product: conversationActionId is mandatory mutation authority.
  // Do not fall back to actionType for execution.
  if (!conversationActionId) {
    return v1Error(
      ctx,
      "VALIDATION_INVALID_REQUEST",
      "conversationActionId required"
    );
  }

  const actionRaw = typeof body.action === "string" ? body.action.trim() : "";

  let threadPendingActionId: string | null | undefined;
  try {
    const { state } = await loadThreadAgentState(
      { dealerId: principal.dealerId, userId: principal.userId },
      threadId
    );
    threadPendingActionId =
      state?.pendingConfirmation?.conversationActionId ?? null;
  } catch {
    return v1Error(ctx, "RESOURCE_NOT_FOUND");
  }

  const gate = await assertPendingActionOnThread({
    principal: {
      dealerId: principal.dealerId,
      userId: principal.userId,
    },
    threadId,
    actionId: conversationActionId,
    threadPendingActionId,
  });
  if (!gate.ok) {
    return v1Error(
      ctx,
      "VALIDATION_INVALID_REQUEST",
      gate.reason === "wrong_thread"
        ? "pending action belongs to another thread"
        : gate.reason === "mismatch"
          ? "conversationActionId does not match current thread pending"
          : "no pending confirmation on this thread"
    );
  }

  const clientTurnId =
    typeof body.clientTurnId === "string" && body.clientTurnId.trim()
      ? body.clientTurnId.trim()
      : randomUUID();

  const message = body.confirmed ? "אשר" : "בטל";

  const result = await runAssistantChatTurn({
    dealerId: principal.dealerId,
    userId: principal.userId,
    threadId,
    message,
    conversationActionId,
    clientTurnId,
    context: {
      route: "/home",
      surface: "ios_agent_confirm",
    },
  });

  if (!result.ok) {
    if (result.error === "thread_not_found") {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    if (result.error === "thread_forbidden") {
      return v1Error(ctx, "PERMISSION_FORBIDDEN");
    }
    if (result.error === "action_mismatch") {
      return v1Error(
        ctx,
        "VALIDATION_INVALID_REQUEST",
        result.message ?? "conversationActionId mismatch — no execution"
      );
    }
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  return v1Json(ctx, {
    ...result.body,
    action: actionRaw || undefined,
    conversationActionId,
    confirmed: body.confirmed,
    threadId,
  });
}

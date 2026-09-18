import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  getAssistantConversationPayload,
  runAssistantChatTurn,
  type AssistantChatUiContext,
} from "@/services/assistant/assistant-chat-turn";
import type { ConversationState } from "@/services/assistant/conversation-state";
import { ConversationAccessError } from "@/services/conversation/auth";

export const dynamic = "force-dynamic";

function threadIdFromRequest(req: Request, body?: { threadId?: unknown }): string | null {
  if (typeof body?.threadId === "string" && body.threadId.trim()) {
    return body.threadId.trim();
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("threadId");
  return q?.trim() || null;
}

/** GET — thread-scoped stored conversation (requires threadId). */
export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const threadId = threadIdFromRequest(req);
  if (!threadId) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST", "threadId required");
  }
  try {
    const payload = await getAssistantConversationPayload(
      { dealerId: principal.dealerId, userId: principal.userId },
      threadId
    );
    return v1Json(ctx, payload);
  } catch (e) {
    if (e instanceof ConversationAccessError) {
      return v1Error(
        ctx,
        e.code === "forbidden" ? "PERMISSION_FORBIDDEN" : "RESOURCE_NOT_FOUND"
      );
    }
    throw e;
  }
}

/**
 * POST — message + required threadId.
 * Operational state is ConversationThread.agentStateJson only.
 */
export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    message?: unknown;
    threadId?: unknown;
    context?: AssistantChatUiContext;
    conversation?: ConversationState;
    clientTurnId?: unknown;
  };

  const threadId = threadIdFromRequest(req, body);
  if (!threadId) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST", "threadId required");
  }

  const clientTurnId =
    typeof body.clientTurnId === "string" ? body.clientTurnId.trim() : undefined;

  const result = await runAssistantChatTurn({
    dealerId: principal.dealerId,
    userId: principal.userId,
    threadId,
    message: typeof body.message === "string" ? body.message : undefined,
    context: body.context,
    clientConversation: body.conversation,
    clientTurnId,
  });

  if (!result.ok) {
    if (result.error === "thread_not_found") {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    if (result.error === "thread_forbidden") {
      return v1Error(ctx, "PERMISSION_FORBIDDEN");
    }
    if (result.error === "action_mismatch") {
      return v1Error(ctx, "ACTION_MISMATCH", result.message);
    }
    if (result.error === "IDEMPOTENCY_CONFLICT") {
      return v1Error(ctx, "IDEMPOTENCY_CONFLICT", result.message);
    }
    if (result.error === "TURN_IN_PROGRESS") {
      return v1Error(ctx, "TURN_IN_PROGRESS", result.message);
    }
    if (result.error === "ACTION_IN_PROGRESS") {
      return v1Error(ctx, "ACTION_IN_PROGRESS", result.message);
    }
    if (result.error === "ACTION_ALREADY_COMPLETED") {
      return v1Error(ctx, "ACTION_ALREADY_COMPLETED", result.message);
    }
    if (result.error === "ACTION_TERMINAL") {
      return v1Error(ctx, "ACTION_TERMINAL", result.message);
    }
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  return v1Json(ctx, result.body);
}

/**
 * Mobile Action Gateway confirmation — thread-scoped.
 * Stored ConversationThread.agentStateJson remains mutation authority.
 */
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { runAssistantChatTurn } from "@/services/assistant/assistant-chat-turn";
import { assertPendingActionOnThread } from "@/services/conversation/gateway-projection";

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
    threadId?: unknown;
  };

  if (typeof body.confirmed !== "boolean") {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const threadId =
    typeof body.threadId === "string" ? body.threadId.trim() : "";
  if (!threadId) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST", "threadId required");
  }

  const actionId = typeof body.action === "string" ? body.action : undefined;
  if (actionId) {
    const gate = await assertPendingActionOnThread({
      principal: {
        dealerId: principal.dealerId,
        userId: principal.userId,
      },
      threadId,
      actionId,
    });
    if (!gate.ok) {
      return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
    }
  }

  const message = body.confirmed ? "אשר" : "בטל";

  const result = await runAssistantChatTurn({
    dealerId: principal.dealerId,
    userId: principal.userId,
    threadId,
    message,
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
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  return v1Json(ctx, {
    ...result.body,
    action: typeof body.action === "string" ? body.action : undefined,
    confirmed: body.confirmed,
    threadId,
  });
}

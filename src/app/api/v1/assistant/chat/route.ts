import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  getAssistantConversationPayload,
  runAssistantChatTurn,
  type AssistantChatUiContext,
} from "@/services/assistant/assistant-chat-turn";
import type { ConversationState } from "@/services/assistant/conversation-state";

export const dynamic = "force-dynamic";

/** GET — server-stored conversation only (no client blob authority). */
export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const payload = await getAssistantConversationPayload(principal.dealerId);
  return v1Json(ctx, payload);
}

/**
 * POST — message + optional UI context.
 * Client `conversation` may seed only when no stored state exists;
 * stored state is always mutation authority (see resolveActiveConversationState).
 */
export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    message?: unknown;
    context?: AssistantChatUiContext;
    conversation?: ConversationState;
  };

  const result = await runAssistantChatTurn({
    dealerId: principal.dealerId,
    userId: principal.userId,
    message: typeof body.message === "string" ? body.message : undefined,
    context: body.context,
    clientConversation: body.conversation,
  });

  if (!result.ok) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  return v1Json(ctx, result.body);
}

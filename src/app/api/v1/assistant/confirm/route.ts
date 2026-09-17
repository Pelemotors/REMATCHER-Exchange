/**
 * Mobile Action Gateway confirmation — thin adapter over the same chat turn
 * path Web uses (isConfirmation / isRejection on pendingConfirmation).
 * No separate mutation authority; stored conversation remains source of truth.
 */
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { runAssistantChatTurn } from "@/services/assistant/assistant-chat-turn";

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
  };

  if (typeof body.confirmed !== "boolean") {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  // Canonical Hebrew confirm/reject tokens understood by conversation-state.
  const message = body.confirmed ? "אשר" : "בטל";

  const result = await runAssistantChatTurn({
    dealerId: principal.dealerId,
    userId: principal.userId,
    message,
    context: {
      route: "/home",
      surface: "ios_agent_confirm",
    },
  });

  if (!result.ok) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  return v1Json(ctx, {
    ...result.body,
    // Echo for Native clients that sent an action id
    action: typeof body.action === "string" ? body.action : undefined,
    confirmed: body.confirmed,
  });
}

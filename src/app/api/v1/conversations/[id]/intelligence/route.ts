import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { runThreadIntelligenceAction } from "@/services/conversation/thread-intelligence";
import { ConversationAccessError } from "@/services/conversation/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/conversations/:id/intelligence
 * Thread-aware intelligence — resolves subject from thread context server-side.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id: threadId } = await params;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { action?: unknown };
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!action) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST", "action required");
  }

  try {
    const result = await runThreadIntelligenceAction({
      principal: { dealerId: principal.dealerId, userId: principal.userId },
      threadId,
      action,
    });
    if (!result.ok) {
      if (result.error === "invalid_action") {
        return v1Error(ctx, "VALIDATION_INVALID_REQUEST", "unknown action");
      }
      if (result.error === "no_subject") {
        return v1Json(ctx, {
          ok: false,
          needsSubject: true,
          message: result.prompt ?? result.message,
          threadId,
        });
      }
      return v1Json(ctx, {
        ok: false,
        message: result.message,
        threadId,
      });
    }
    return v1Json(ctx, {
      ok: true,
      threadId,
      messageId: result.messageId,
      result: result.result,
    });
  } catch (e) {
    if (e instanceof ConversationAccessError) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    throw e;
  }
}

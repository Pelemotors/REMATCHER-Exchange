import { requireV1Dealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  confirmAccountDeletion,
  requestAccountDeletion,
} from "@/services/privacy/deletion";

export const dynamic = "force-dynamic";

/**
 * Thin wrap of Web POST /api/privacy/account-deletion.
 * Owner check lives in requestAccountDeletion / confirmAccountDeletion.
 * dealerId always from session principal (A≠B).
 */
export async function POST(req: Request) {
  const auth = await requireV1Dealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    action?: unknown;
    note?: unknown;
    requestId?: unknown;
  };
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "request") {
    const result = await requestAccountDeletion({
      userId: principal.userId,
      dealerId: principal.dealerId,
      note: typeof body.note === "string" ? body.note : undefined,
    });
    if (!result.ok) {
      return v1Error(
        ctx,
        "PERMISSION_FORBIDDEN",
        result.message ?? "רק בעל החשבון יכול לבקש מחיקת חשבון."
      );
    }
    return v1Json(ctx, result);
  }

  if (action === "confirm") {
    const requestId =
      typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) {
      return v1Error(ctx, "VALIDATION_INVALID_REQUEST", "requestId required");
    }
    const result = await confirmAccountDeletion({
      userId: principal.userId,
      dealerId: principal.dealerId,
      requestId,
    });
    if (!result.ok) {
      if (result.error === "not_found") {
        return v1Error(ctx, "RESOURCE_NOT_FOUND");
      }
      return v1Error(ctx, "PERMISSION_FORBIDDEN");
    }
    return v1Json(ctx, result);
  }

  return v1Error(ctx, "VALIDATION_INVALID_REQUEST", "action must be request or confirm");
}

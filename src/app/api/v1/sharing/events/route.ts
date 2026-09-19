import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  isShareAction,
  isShareKind,
  recordShareEvent,
} from "@/services/sharing/sharing-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Record<string, unknown>;
  if (!isShareKind(body.kind) || !isShareAction(body.action)) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  await recordShareEvent({
    dealerId: principal.dealerId,
    userId: principal.userId,
    kind: body.kind,
    action: body.action,
    resourceId: typeof body.resourceId === "string" ? body.resourceId : null,
    channel: typeof body.channel === "string" ? body.channel : null,
    clientEventId: typeof body.clientEventId === "string" ? body.clientEventId : null,
  });
  return v1Json(ctx, { ok: true });
}

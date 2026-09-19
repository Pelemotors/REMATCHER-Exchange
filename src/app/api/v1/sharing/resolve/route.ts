import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  isShareKind,
  resolveOutboundShare,
} from "@/services/sharing/sharing-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as { kind?: unknown; resourceId?: unknown };
  if (!isShareKind(body.kind)) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  const result = await resolveOutboundShare({
    dealerId: principal.dealerId,
    kind: body.kind,
    resourceId: typeof body.resourceId === "string" ? body.resourceId : null,
  });
  if (!result.ok) {
    return v1Error(
      ctx,
      result.error === "not_found" ? "RESOURCE_NOT_FOUND" : "VALIDATION_INVALID_REQUEST"
    );
  }
  return v1Json(ctx, result.payload);
}

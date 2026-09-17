import { z } from "zod";
import { resolveV1RequestContext } from "@/lib/api-v1/request-context";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { mePayload } from "@/lib/api-v1/me-payload";
import { hasCompletedPrivacyAiV1 } from "@/services/privacy/policy";
import { refreshMobileSession } from "@/services/identity/mobile-session";

const schema = z.object({
  refreshToken: z.string().min(20).max(400),
});

export async function POST(req: Request) {
  const ctx = resolveV1RequestContext(req);
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const result = await refreshMobileSession(parsed.data.refreshToken);
  if (!result.ok) return v1Error(ctx, result.code);

  const privacyAiComplete = await hasCompletedPrivacyAiV1({
    userId: result.principal.userId,
    dealerId: result.principal.dealerId,
  });

  return v1Json(ctx, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
    tokenType: "Bearer",
    me: mePayload(result.principal, { privacyAiComplete }),
  });
}

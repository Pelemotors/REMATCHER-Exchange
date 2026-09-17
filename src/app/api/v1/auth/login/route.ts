import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { resolveV1RequestContext } from "@/lib/api-v1/request-context";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { mePayload } from "@/lib/api-v1/me-payload";
import { hasCompletedPrivacyAiV1 } from "@/services/privacy/policy";
import {
  authenticateMobilePassword,
  issueMobileSession,
} from "@/services/identity/mobile-session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  installationId: z.string().min(3).max(120).optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

export async function POST(req: Request) {
  const ctx = resolveV1RequestContext(req);
  const json = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const result = await authenticateMobilePassword({
    email: parsed.data.email,
    password: parsed.data.password,
    ip: getClientIp(req),
  });
  if (!result.ok) return v1Error(ctx, result.code);

  const session = await issueMobileSession({
    userId: result.principal.userId,
    installationId: parsed.data.installationId,
    platform: parsed.data.platform,
  });
  const privacyAiComplete = await hasCompletedPrivacyAiV1({
    userId: result.principal.userId,
    dealerId: result.principal.dealerId,
  });

  return v1Json(ctx, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: session.expiresIn,
    tokenType: "Bearer",
    me: mePayload(result.principal, { privacyAiComplete }),
  });
}

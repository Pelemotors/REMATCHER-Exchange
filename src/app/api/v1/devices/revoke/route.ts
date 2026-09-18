/**
 * Owned device revoke — principal.userId required (never IDOR by token alone).
 */
import { requireV1Dealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { revokeInstallation } from "@/services/devices/installations";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireV1Dealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as {
    installationId?: unknown;
    deviceToken?: unknown;
  };

  const installationId =
    typeof body.installationId === "string" ? body.installationId.trim() : "";
  const deviceToken =
    typeof body.deviceToken === "string" ? body.deviceToken.trim() : "";

  if (!installationId && !deviceToken) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const result = await revokeInstallation({
    userId: principal.userId,
    installationId: installationId || undefined,
    pushToken: deviceToken || undefined,
  });

  return v1Json(ctx, { ok: true, revoked: result.revoked });
}

/**
 * Native push device registration only.
 *
 * Revoke (/api/v1/devices/revoke or DELETE) is intentionally NOT exposed:
 * Web `/api/devices/revoke` historically had IDOR risk — do not ship revoke
 * on Mobile until ownership is proven safe end-to-end.
 */
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  isNativePushDeliveryConfigured,
  registerNativePushDevice,
  type NativePushPlatform,
} from "@/services/notifications/native-push";

export const dynamic = "force-dynamic";

function parsePlatform(raw: unknown): NativePushPlatform | null {
  if (raw === "ios" || raw === "android") return raw;
  return null;
}

/** Thin wrap of Web POST /api/push/native-register via registerNativePushDevice. */
export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as {
    platform?: unknown;
    deviceToken?: unknown;
    pushToken?: unknown;
  };

  const platform = parsePlatform(body.platform);
  const rawToken =
    typeof body.deviceToken === "string"
      ? body.deviceToken
      : typeof body.pushToken === "string"
        ? body.pushToken
        : "";
  const deviceToken = rawToken.trim();

  if (!platform || !deviceToken) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const result = await registerNativePushDevice({
    userId: principal.userId,
    registration: { platform, deviceToken },
  });

  if (!result.ok) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST", result.reason);
  }

  return v1Json(ctx, {
    ok: true,
    deliveryReady: isNativePushDeliveryConfigured(),
  });
}

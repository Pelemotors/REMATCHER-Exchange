import {
  PRIVACY_CONSENT_TYPES,
  type PrivacyConsentTypeKey,
} from "@/config/legal/versions";
import { requireV1Dealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  completePrivacyAiOnboarding,
  type ConsentState,
} from "@/services/privacy/policy";

export const dynamic = "force-dynamic";

function isConsentState(value: unknown): value is ConsentState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return PRIVACY_CONSENT_TYPES.every(
    (key: PrivacyConsentTypeKey) => typeof record[key] === "boolean"
  );
}

export async function POST(req: Request) {
  const auth = await requireV1Dealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as { consents?: unknown };
  if (!isConsentState(body.consents)) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  await completePrivacyAiOnboarding({
    userId: principal.userId,
    dealerId: principal.dealerId,
    consents: body.consents,
    source: "privacy_ai_onboarding",
  });

  return v1Json(ctx, { ok: true });
}

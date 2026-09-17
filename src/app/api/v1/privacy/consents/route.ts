import {
  PRIVACY_CONSENT_TYPES,
  type PrivacyConsentTypeKey,
} from "@/config/legal/versions";
import { requireV1Dealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  getConsentState,
  listConsentHistory,
  recordConsentDecision,
} from "@/services/privacy/policy";

export const dynamic = "force-dynamic";

/** Thin wrap of Web GET /api/privacy/consents */
export async function GET(req: Request) {
  const auth = await requireV1Dealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const dealerId = principal.dealerId;

  const [current, history] = await Promise.all([
    getConsentState(dealerId),
    listConsentHistory(dealerId),
  ]);

  return v1Json(ctx, { current, history });
}

/**
 * Thin wrap of Web PATCH /api/privacy/consents.
 * Settings updates use this — not onboarding/complete.
 */
export async function PATCH(req: Request) {
  const auth = await requireV1Dealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    consentType?: unknown;
    value?: unknown;
    source?: unknown;
  };
  const consentType = body.consentType as PrivacyConsentTypeKey | undefined;
  const value = body.value;

  if (
    !consentType ||
    !PRIVACY_CONSENT_TYPES.includes(consentType) ||
    typeof value !== "boolean"
  ) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST", "Invalid consentType or value");
  }

  const decision = await recordConsentDecision({
    userId: principal.userId,
    dealerId: principal.dealerId,
    consentType,
    value,
    source:
      typeof body.source === "string" && body.source.trim()
        ? body.source
        : "privacy_center",
  });

  const current = await getConsentState(principal.dealerId);
  return v1Json(ctx, { decision, current });
}

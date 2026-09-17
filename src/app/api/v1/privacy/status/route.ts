import {
  CONSENT_TEXT_VERSION,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} from "@/config/legal/versions";
import { requireV1Dealer } from "@/lib/api-v1/auth";
import { v1Json } from "@/lib/api-v1/respond";
import {
  getConsentState,
  hasCompletedPrivacyAiV1,
} from "@/services/privacy/policy";

export const dynamic = "force-dynamic";

/** Thin wrap of Web GET /api/privacy/status */
export async function GET(req: Request) {
  const auth = await requireV1Dealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const dealerId = principal.dealerId;

  const [consents, completed] = await Promise.all([
    getConsentState(dealerId),
    hasCompletedPrivacyAiV1({
      userId: principal.userId,
      dealerId,
    }),
  ]);

  return v1Json(ctx, {
    consents,
    hasCompletedPrivacyAiV1: completed,
    versions: {
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      termsVersion: TERMS_VERSION,
      consentTextVersion: CONSENT_TEXT_VERSION,
    },
  });
}

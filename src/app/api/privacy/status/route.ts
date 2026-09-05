import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  CONSENT_TEXT_VERSION,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} from "@/config/legal/versions";
import {
  getConsentState,
  hasCompletedPrivacyAiV1,
} from "@/services/privacy/policy";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dealerId = session.user.dealerId;
  const [consents, completed] = await Promise.all([
    getConsentState(dealerId),
    hasCompletedPrivacyAiV1({
      userId: session.user.id,
      dealerId,
    }),
  ]);

  return NextResponse.json({
    consents,
    hasCompletedPrivacyAiV1: completed,
    versions: {
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      termsVersion: TERMS_VERSION,
      consentTextVersion: CONSENT_TEXT_VERSION,
    },
  });
}

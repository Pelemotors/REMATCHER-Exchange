import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  PRIVACY_CONSENT_TYPES,
  type PrivacyConsentTypeKey,
} from "@/config/legal/versions";
import {
  getConsentState,
  listConsentHistory,
  recordConsentDecision,
} from "@/services/privacy/policy";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dealerId = session.user.dealerId;
  const [current, history] = await Promise.all([
    getConsentState(dealerId),
    listConsentHistory(dealerId),
  ]);

  return NextResponse.json({ current, history });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const consentType = body?.consentType as PrivacyConsentTypeKey | undefined;
  const value = body?.value;

  if (
    !consentType ||
    !PRIVACY_CONSENT_TYPES.includes(consentType) ||
    typeof value !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Invalid consentType or value" },
      { status: 400 }
    );
  }

  const decision = await recordConsentDecision({
    userId: session.user.id,
    dealerId: session.user.dealerId,
    consentType,
    value,
    source: body?.source ?? "privacy_center",
  });

  const current = await getConsentState(session.user.dealerId);
  return NextResponse.json({ decision, current });
}

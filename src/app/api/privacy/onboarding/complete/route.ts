import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  PRIVACY_CONSENT_TYPES,
  type PrivacyConsentTypeKey,
} from "@/config/legal/versions";
import {
  completePrivacyAiOnboarding,
  type ConsentState,
} from "@/services/privacy/policy";

function isConsentState(value: unknown): value is ConsentState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return PRIVACY_CONSENT_TYPES.every(
    (key: PrivacyConsentTypeKey) => typeof record[key] === "boolean"
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!isConsentState(body?.consents)) {
    return NextResponse.json(
      { error: "consents must include all 4 boolean keys" },
      { status: 400 }
    );
  }

  await completePrivacyAiOnboarding({
    userId: session.user.id,
    dealerId: session.user.dealerId,
    consents: body.consents,
    source: "privacy_ai_onboarding",
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { getAssistantContext } from "@/services/assistant/v2-orchestrator";

export async function GET() {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const context = await getAssistantContext(
    authResult.session.user.dealerId!
  );

  return NextResponse.json(context);
}

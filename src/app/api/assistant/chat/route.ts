import { NextResponse } from "next/server";
import { requireDealerSession } from "@/lib/auth-guards";
import { runExchangeAssistant } from "@/services/assistant/orchestrator";
import { logAppEvent } from "@/services/notifications";

export async function POST(req: Request) {
  const authResult = await requireDealerSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { message, context } = await req.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  await logAppEvent({
    eventType: "assistant_opened",
    dealerId: authResult.session.user.dealerId!,
    metadata: { userId: authResult.session.user.id },
  });

  const response = await runExchangeAssistant({
    dealerId: authResult.session.user.dealerId!,
    userId: authResult.session.user.id,
    message: message.trim(),
    context: context ?? { route: "/" },
  });

  return NextResponse.json(response);
}

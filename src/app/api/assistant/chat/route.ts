import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { runExchangeAssistantV2 } from "@/services/assistant/v2-orchestrator";
import { logAppEvent } from "@/services/notifications";
import type { ConversationState } from "@/services/assistant/conversation-state";

export async function POST(req: Request) {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { message, context, conversation } = (await req.json()) as {
    message?: string;
    context?: {
      route: string;
      entityType?: string;
      entityId?: string;
      mode?: "inventory_management";
    };
    conversation?: ConversationState;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  await logAppEvent({
    eventType: "assistant_opened",
    dealerId: authResult.session.user.dealerId!,
    metadata: { userId: authResult.session.user.id },
  });

  const response = await runExchangeAssistantV2({
    dealerId: authResult.session.user.dealerId!,
    userId: authResult.session.user.id,
    message: message.trim(),
    context: context ?? { route: "/" },
    conversation,
  });

  return NextResponse.json({
    ...response,
    agentVersion: response.meta?.agentVersion ?? "2.3",
  });
}

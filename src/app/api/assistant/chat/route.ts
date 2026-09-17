import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import {
  getAssistantConversationPayload,
  runAssistantChatTurn,
} from "@/services/assistant/assistant-chat-turn";
import type { ConversationState } from "@/services/assistant/conversation-state";
import type { AssistantChatUiContext } from "@/services/assistant/assistant-chat-turn";

export async function GET() {
  const a = await requireVerifiedDealer({ requireEntitlement: false });
  if ("error" in a) {
    return NextResponse.json({ error: a.error }, { status: a.status });
  }
  const payload = await getAssistantConversationPayload(
    a.session.user.dealerId!
  );
  return NextResponse.json(payload);
}

export async function POST(req: Request) {
  const a = await requireVerifiedDealer({ requireEntitlement: false });
  if ("error" in a) {
    return NextResponse.json({ error: a.error }, { status: a.status });
  }
  const body = (await req.json()) as {
    message?: string;
    context?: AssistantChatUiContext;
    conversation?: ConversationState;
  };
  const result = await runAssistantChatTurn({
    dealerId: a.session.user.dealerId!,
    userId: a.session.user.id,
    message: body.message,
    context: body.context,
    clientConversation: body.conversation,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  return NextResponse.json(result.body);
}

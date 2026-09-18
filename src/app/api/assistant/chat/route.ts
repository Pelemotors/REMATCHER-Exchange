import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import {
  getAssistantConversationPayload,
  runAssistantChatTurn,
} from "@/services/assistant/assistant-chat-turn";
import type { ConversationState } from "@/services/assistant/conversation-state";
import type { AssistantChatUiContext } from "@/services/assistant/assistant-chat-turn";
import { getOrCreateDefaultAgentThread } from "@/services/conversation/thread-agent-state";

export async function GET(req: Request) {
  const a = await requireVerifiedDealer({ requireEntitlement: false });
  if ("error" in a) {
    return NextResponse.json({ error: a.error }, { status: a.status });
  }
  const url = new URL(req.url);
  let threadId = url.searchParams.get("threadId")?.trim();
  const principal = {
    dealerId: a.session.user.dealerId!,
    userId: a.session.user.id,
  };
  threadId =
    threadId || (await getOrCreateDefaultAgentThread(principal));
  const payload = await getAssistantConversationPayload(principal, threadId);
  return NextResponse.json(payload);
}

export async function POST(req: Request) {
  const a = await requireVerifiedDealer({ requireEntitlement: false });
  if ("error" in a) {
    return NextResponse.json({ error: a.error }, { status: a.status });
  }
  const body = (await req.json()) as {
    message?: string;
    threadId?: string;
    context?: AssistantChatUiContext;
    conversation?: ConversationState;
    clientTurnId?: string;
  };
  const principal = {
    dealerId: a.session.user.dealerId!,
    userId: a.session.user.id,
  };
  const threadId =
    body.threadId?.trim() ||
    (await getOrCreateDefaultAgentThread(principal));
  const result = await runAssistantChatTurn({
    dealerId: principal.dealerId,
    userId: principal.userId,
    threadId,
    message: body.message,
    context: body.context,
    clientConversation: body.conversation,
    clientTurnId: body.clientTurnId,
  });
  if (!result.ok) {
    if (result.error === "action_mismatch") {
      return NextResponse.json(
        { error: result.message ?? "Action mismatch" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  return NextResponse.json(result.body);
}

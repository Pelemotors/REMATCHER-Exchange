import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import type { ConversationState } from "@/services/assistant/conversation-state";

export const AGENT_CONVERSATION_TOPIC = "agent_conversation_state_v1";

export async function loadAgentConversationState(
  dealerId: string
): Promise<ConversationState | undefined> {
  const row = await prisma.dealerMemoryItem.findFirst({
    where: { dealerId, topicKey: AGENT_CONVERSATION_TOPIC, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });
  return (row?.details as unknown as { state?: ConversationState } | null)?.state;
}

export async function saveAgentConversationState(
  dealerId: string,
  state: ConversationState | undefined
): Promise<void> {
  if (!state) return;
  const existing = await prisma.dealerMemoryItem.findFirst({
    where: { dealerId, topicKey: AGENT_CONVERSATION_TOPIC, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });
  const details = toPrismaJson({ state });
  if (existing) {
    await prisma.dealerMemoryItem.update({
      where: { id: existing.id },
      data: {
        summary: "Operational personal-agent conversation state",
        details,
        confidence: 1,
      },
    });
  } else {
    await prisma.dealerMemoryItem.create({
      data: {
        dealerId,
        topicKey: AGENT_CONVERSATION_TOPIC,
        kind: "TEMPORARY",
        status: "ACTIVE",
        provenance: "SYSTEM_DERIVED",
        summary: "Operational personal-agent conversation state",
        details,
        confidence: 1,
      },
    });
  }
}

/**
 * Stored conversation is the mutation authority.
 * Client-supplied blob may seed only when nothing is stored (never overrides).
 */
export function resolveActiveConversationState(
  stored: ConversationState | undefined,
  client?: ConversationState | null
): ConversationState | undefined {
  if (stored) return stored;
  if (client && Object.keys(client).length > 0) return client;
  return undefined;
}

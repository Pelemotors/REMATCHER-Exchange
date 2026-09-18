import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import type { ConversationState } from "@/services/assistant/conversation-state";
import { assertThreadAccess } from "@/services/conversation/auth";
import type { ConversationPrincipal } from "@/services/conversation/types";

/** Legacy dealer-global operational blob — migrate-once into thread.agentStateJson. */
export const AGENT_CONVERSATION_TOPIC = "agent_conversation_state_v1";

/** Durable dealer/user preferences only (never pendingConfirmation / recentTurns). */
export const AGENT_DURABLE_PREFS_TOPIC = "agent_durable_preferences_v1";

const OPERATIONAL_KEYS = [
  "lastList",
  "pendingConfirmation",
  "pendingInventoryDraft",
  "pendingInventoryMutation",
  "goal",
  "sessionContext",
  "focusedObject",
  "lastInterpretation",
  "lastAgentQuestion",
  "repeatedQuestionCount",
  "rejectedInterpretations",
  "recentCorrections",
  "suspendedContext",
  "lastAuthorizedSnapshot",
  "pendingSearchDraft",
  "queuedFollowUp",
  "recentTurns",
  "compactSummary",
  "referencedEntities",
] as const satisfies ReadonlyArray<keyof ConversationState>;

const DURABLE_KEYS = [
  "preferredClarificationWording",
] as const satisfies ReadonlyArray<keyof ConversationState>;

export async function loadAgentConversationState(
  dealerId: string
): Promise<ConversationState | undefined> {
  const row = await prisma.dealerMemoryItem.findFirst({
    where: { dealerId, topicKey: AGENT_CONVERSATION_TOPIC, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });
  return (row?.details as unknown as { state?: ConversationState } | null)?.state;
}

/** @deprecated Operational state belongs on threads; persists durable prefs only. */
export async function saveAgentConversationState(
  dealerId: string,
  state: ConversationState | undefined
): Promise<void> {
  if (!state) return;
  const { preferences } = splitStateForPersistence(state);
  await saveAgentDurablePreferences(dealerId, preferences);
}

export async function loadAgentDurablePreferences(
  dealerId: string
): Promise<Partial<ConversationState> | undefined> {
  const row = await prisma.dealerMemoryItem.findFirst({
    where: { dealerId, topicKey: AGENT_DURABLE_PREFS_TOPIC, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });
  const prefs = (row?.details as unknown as { preferences?: Partial<ConversationState> } | null)
    ?.preferences;
  if (!prefs || typeof prefs !== "object") return undefined;
  return prefs;
}

export async function saveAgentDurablePreferences(
  dealerId: string,
  preferences: Partial<ConversationState> | undefined
): Promise<void> {
  if (!preferences || Object.keys(preferences).length === 0) return;
  const existing = await prisma.dealerMemoryItem.findFirst({
    where: { dealerId, topicKey: AGENT_DURABLE_PREFS_TOPIC, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });
  const details = toPrismaJson({ preferences });
  if (existing) {
    await prisma.dealerMemoryItem.update({
      where: { id: existing.id },
      data: {
        summary: "Durable personal-agent preferences",
        details,
        confidence: 1,
      },
    });
  } else {
    await prisma.dealerMemoryItem.create({
      data: {
        dealerId,
        topicKey: AGENT_DURABLE_PREFS_TOPIC,
        kind: "PREFERENCE",
        status: "ACTIVE",
        provenance: "SYSTEM_DERIVED",
        summary: "Durable personal-agent preferences",
        details,
        confidence: 1,
      },
    });
  }
}

/** Split full ConversationState into thread-operational vs dealer-durable. */
export function splitStateForPersistence(state: ConversationState): {
  operational: ConversationState;
  preferences: Partial<ConversationState>;
} {
  const operational: ConversationState = {};
  const preferences: Partial<ConversationState> = {};
  for (const key of OPERATIONAL_KEYS) {
    const value = state[key];
    if (value !== undefined) {
      (operational as Record<string, unknown>)[key] = value;
    }
  }
  for (const key of DURABLE_KEYS) {
    const value = state[key];
    if (value !== undefined) {
      (preferences as Record<string, unknown>)[key] = value;
    }
  }
  return { operational, preferences };
}

export function mergePreferencesIntoState(
  operational: ConversationState | undefined,
  preferences: Partial<ConversationState> | undefined
): ConversationState | undefined {
  if (!operational && !preferences) return undefined;
  return {
    ...(operational ?? {}),
    ...(preferences ?? {}),
  };
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

function parseThreadAgentStateJson(raw: unknown): ConversationState | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const asObj = raw as { state?: ConversationState } & ConversationState;
  if (asObj.state && typeof asObj.state === "object") {
    return asObj.state;
  }
  if (Object.keys(asObj).length === 0) return undefined;
  return asObj as ConversationState;
}

async function maybeMigrateLegacyStateIntoThread(
  principal: ConversationPrincipal,
  threadId: string
): Promise<ConversationState | undefined> {
  const legacy = await loadAgentConversationState(principal.dealerId);
  if (!legacy || Object.keys(legacy).length === 0) return undefined;

  const { operational, preferences } = splitStateForPersistence(legacy);
  // Never import stale mutation authority / intel subject into a new thread.
  const {
    pendingConfirmation: _p,
    pendingInventoryDraft: _d,
    pendingInventoryMutation: _m,
    pendingSearchDraft: _s,
    focusedObject: _f,
    recentTurns: _r,
    lastInterpretation: _li,
    lastAgentQuestion: _lq,
    ...safeOperational
  } = operational;

  if (Object.keys(safeOperational).length > 0) {
    await prisma.conversationThread.update({
      where: { id: threadId },
      data: {
        agentStateJson: toPrismaJson(safeOperational),
        compactSummary: safeOperational.compactSummary ?? null,
      },
    });
  }
  if (Object.keys(preferences).length > 0) {
    await saveAgentDurablePreferences(principal.dealerId, preferences);
  }
  await prisma.dealerMemoryItem.updateMany({
    where: {
      dealerId: principal.dealerId,
      topicKey: AGENT_CONVERSATION_TOPIC,
      status: "ACTIVE",
    },
    data: { status: "SUPERSEDED" },
  });
  return Object.keys(safeOperational).length ? safeOperational : undefined;
}

export async function loadThreadAgentState(
  principal: ConversationPrincipal,
  threadId: string
): Promise<{ threadId: string; state: ConversationState | undefined }> {
  const thread = await assertThreadAccess(principal, threadId);
  let operational = parseThreadAgentStateJson(thread.agentStateJson);
  if (!operational) {
    operational = await maybeMigrateLegacyStateIntoThread(principal, threadId);
  }
  const preferences = await loadAgentDurablePreferences(principal.dealerId);
  const state = mergePreferencesIntoState(operational, preferences);
  return { threadId: thread.id, state };
}

export async function saveThreadAgentState(
  principal: ConversationPrincipal,
  threadId: string,
  state: ConversationState | undefined
): Promise<void> {
  if (!state) return;
  await assertThreadAccess(principal, threadId);
  const { operational, preferences } = splitStateForPersistence(state);
  if (Object.keys(operational).length > 0) {
    await prisma.conversationThread.update({
      where: { id: threadId },
      data: {
        agentStateJson: toPrismaJson(operational),
        compactSummary: operational.compactSummary ?? null,
      },
    });
  }
  if (Object.keys(preferences).length > 0) {
    await saveAgentDurablePreferences(principal.dealerId, preferences);
  }
}

export async function getOrCreateDefaultAgentThread(
  principal: ConversationPrincipal
): Promise<string> {
  const existing = await prisma.conversationThread.findFirst({
    where: {
      dealerId: principal.dealerId,
      ownerUserId: principal.userId,
      source: "AGENT",
      status: "ACTIVE",
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const { createThread } = await import("@/services/conversation/threads");
  const thread = await createThread({
    principal,
    title: "סוכן REMATCHER",
    titleSource: "AUTO",
    source: "AGENT",
  });
  return thread.id;
}

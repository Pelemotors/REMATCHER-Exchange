import type { ConversationMessage, ConversationThread } from "@prisma/client";
import type { ThreadRecord } from "@/services/conversation/types";

/** Mobile-facing thread summary (no agentStateJson). */
export type ConversationThreadDTO = {
  id: string;
  title: string;
  titleSource: ConversationThread["titleSource"];
  status: ConversationThread["status"];
  source: ConversationThread["source"];
  visibility: ConversationThread["visibility"];
  lastMessageAt: string | null;
  preview?: string | null;
  mediaCount?: number;
  compactSummary?: string | null;
};

export type MessageDTO = {
  id: string;
  threadId: string;
  role: ConversationMessage["role"];
  kind: ConversationMessage["kind"];
  text: string | null;
  payloadJson: unknown;
  entityType: string | null;
  entityId: string | null;
  intakeBatchId: string | null;
  source: string | null;
  createdAt: string;
};

export type ThreadMediaItemDTO = {
  id: string;
  batchId: string;
  thumbUrl: string;
  url: string;
  originalOrder: number;
};

export function serializeMessageDTO(row: ConversationMessage): MessageDTO {
  return {
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    kind: row.kind,
    text: row.text,
    payloadJson: row.payloadJson ?? null,
    entityType: row.entityType,
    entityId: row.entityId,
    intakeBatchId: row.intakeBatchId,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeThreadDTO(
  row: ThreadRecord | ConversationThread,
  extras?: { preview?: string | null; mediaCount?: number }
): ConversationThreadDTO {
  return {
    id: row.id,
    title: row.title,
    titleSource: row.titleSource,
    status: row.status,
    source: row.source,
    visibility: row.visibility,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    compactSummary: row.compactSummary ?? null,
    ...(extras?.preview !== undefined ? { preview: extras.preview } : {}),
    ...(extras?.mediaCount !== undefined ? { mediaCount: extras.mediaCount } : {}),
  };
}

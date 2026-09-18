import type { ConversationThread } from "@prisma/client";
import type { ThreadRecord } from "@/services/conversation/types";

export function serializeThread(row: ConversationThread): ThreadRecord {
  return {
    id: row.id,
    dealerId: row.dealerId,
    ownerUserId: row.ownerUserId,
    title: row.title,
    titleSource: row.titleSource,
    status: row.status,
    source: row.source,
    visibility: row.visibility,
    agentStateJson: row.agentStateJson,
    compactSummary: row.compactSummary,
    lastMessageAt: row.lastMessageAt,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

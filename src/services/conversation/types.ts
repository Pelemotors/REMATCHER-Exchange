import type {
  ConversationActionStatus,
  ConversationMessageKind,
  ConversationMessageRole,
  ConversationThreadSource,
  ConversationThreadStatus,
  ConversationTitleSource,
  ConversationVisibility,
} from "@prisma/client";

export type ConversationPrincipal = {
  userId: string;
  dealerId: string;
};

export type ThreadRecord = {
  id: string;
  dealerId: string;
  ownerUserId: string;
  title: string;
  titleSource: ConversationTitleSource;
  status: ConversationThreadStatus;
  source: ConversationThreadSource;
  visibility: ConversationVisibility;
  agentStateJson: unknown;
  compactSummary: string | null;
  lastMessageAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateThreadInput = {
  principal: ConversationPrincipal;
  title?: string;
  titleSource?: ConversationTitleSource;
  source?: ConversationThreadSource;
  visibility?: ConversationVisibility;
  agentStateJson?: unknown;
};

export type ListThreadsInput = {
  principal: ConversationPrincipal;
  status?: ConversationThreadStatus;
  limit?: number;
  cursor?: string;
};

export type AppendMessageInput = {
  threadId: string;
  role: ConversationMessageRole;
  kind?: ConversationMessageKind;
  text?: string | null;
  payloadJson?: unknown;
  entityType?: string | null;
  entityId?: string | null;
  intakeBatchId?: string | null;
  source?: string | null;
  idempotencyKey?: string | null;
};

export type CreatePendingActionInput = {
  threadId: string;
  actionType: string;
  payloadJson?: unknown;
  idempotencyKey?: string | null;
  messageId?: string | null;
  gatewayActionId?: string | null;
};

export type ActionStatusPatch = ConversationActionStatus;

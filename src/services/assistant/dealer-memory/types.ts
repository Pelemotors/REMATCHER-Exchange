import type {
  DealerMemoryKind,
  DealerMemoryProvenance,
  DealerMemoryStatus,
} from "@prisma/client";

export type {
  DealerMemoryKind,
  DealerMemoryProvenance,
  DealerMemoryStatus,
};

export const DEALER_MEMORY_MAX_ACTIVE = 80;
export const DEALER_MEMORY_RETRIEVAL_CAP = 8;
export const DEALER_MEMORY_MAX_INFERRED_CONFIDENCE = 0.55;
export const DEALER_MEMORY_TOPIC_KEY_PATTERN =
  /^[a-z][a-z0-9_.]{2,64}$/;
export const DEALER_MEMORY_TOPIC_PREFIXES = [
  "preference",
  "goal",
  "profile",
  "context",
  "decision",
  "temporary",
] as const;

export type MemoryMutationAction =
  | "created"
  | "superseded"
  | "forgotten"
  | "corrected"
  | "rejected";

export type MemoryItemView = {
  id: string;
  topicKey: string;
  kind: DealerMemoryKind;
  status: DealerMemoryStatus;
  provenance: DealerMemoryProvenance;
  summary: string;
  confidence: number;
  expiresAt: string | null;
};

export type MemoryMutationRecord = {
  action: MemoryMutationAction;
  id?: string;
  topicKey?: string;
  reason?: string;
};

export type MemoryPublicMeta = {
  retrievedCount: number;
  mutationCount: number;
  kinds: string[];
  promptChars: number;
  retrievalLatencyMs: number;
};

export type MemoryDebugMeta = {
  retrieved: Array<{
    id: string;
    topicKey: string;
    provenance: string;
    kind: string;
  }>;
  mutations: MemoryMutationRecord[];
};

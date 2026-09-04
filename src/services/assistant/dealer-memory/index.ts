/**
 * Deterministic Dealer Memory persistence.
 * NLP / semantic judgment stays with the Agent — this module validates and stores.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  DealerMemoryKind,
  DealerMemoryProvenance,
  Prisma,
} from "@prisma/client";
import {
  DEALER_MEMORY_MAX_ACTIVE,
  DEALER_MEMORY_MAX_INFERRED_CONFIDENCE,
  DEALER_MEMORY_RETRIEVAL_CAP,
  DEALER_MEMORY_TOPIC_KEY_PATTERN,
  DEALER_MEMORY_TOPIC_PREFIXES,
  type MemoryItemView,
  type MemoryMutationRecord,
} from "@/services/assistant/dealer-memory/types";

const KIND_PRIORITY: Record<DealerMemoryKind, number> = {
  GOAL: 0,
  TEMPORARY: 1,
  PREFERENCE: 2,
  DECISION: 3,
  PROFILE: 4,
  BUSINESS_CONTEXT: 5,
};

const OPERATIONAL_DETAIL_KEYS = new Set([
  "vehiclecount",
  "inventorycount",
  "activevehicles",
  "searchcount",
  "matchcount",
  "opportunitycount",
  "pendingactions",
  "freshness",
  "staleCount",
  "stalecount",
]);

export function normalizeTopicKey(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!DEALER_MEMORY_TOPIC_KEY_PATTERN.test(key)) return null;
  const prefix = key.split(".")[0];
  if (
    !(DEALER_MEMORY_TOPIC_PREFIXES as readonly string[]).includes(prefix)
  ) {
    return null;
  }
  return key;
}

function isOperationalSnapshot(
  summary: string,
  details: Record<string, unknown> | null | undefined
): boolean {
  if (details) {
    for (const k of Object.keys(details)) {
      if (OPERATIONAL_DETAIL_KEYS.has(k.toLowerCase())) return true;
    }
  }
  // Reject SYSTEM_DERIVED that clearly mirrors live REMATCHER counters.
  if (
    /\b(activeInventory|inventoryCount|matchCount|pendingActions)\b/i.test(
      summary
    )
  ) {
    return true;
  }
  return false;
}

function toView(row: {
  id: string;
  topicKey: string;
  kind: DealerMemoryKind;
  status: string;
  provenance: DealerMemoryProvenance;
  summary: string;
  confidence: number;
  expiresAt: Date | null;
}): MemoryItemView {
  return {
    id: row.id,
    topicKey: row.topicKey,
    kind: row.kind,
    status: row.status as MemoryItemView["status"],
    provenance: row.provenance,
    summary: row.summary,
    confidence: row.confidence,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

export async function expireDueMemories(dealerId: string): Promise<number> {
  const now = new Date();
  const result = await prisma.dealerMemoryItem.updateMany({
    where: {
      dealerId,
      status: "ACTIVE",
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

export async function cleanupStaleMemoryRows(dealerId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const result = await prisma.dealerMemoryItem.deleteMany({
    where: {
      dealerId,
      status: { in: ["EXPIRED", "FORGOTTEN", "SUPERSEDED"] },
      updatedAt: { lt: cutoff },
    },
  });
  return result.count;
}

export type RememberInput = {
  dealerId: string;
  topicKey: string;
  kind: DealerMemoryKind;
  provenance: DealerMemoryProvenance;
  summary: string;
  details?: Record<string, unknown> | null;
  confidence?: number;
  evidenceNote?: string | null;
  expiresAt?: string | null;
};

export async function createOrSupersedeMemory(
  input: RememberInput
): Promise<{ ok: boolean; item?: MemoryItemView; mutation: MemoryMutationRecord }> {
  const topicKey = normalizeTopicKey(input.topicKey);
  if (!topicKey) {
    return {
      ok: false,
      mutation: {
        action: "rejected",
        reason:
          "Invalid topicKey. Use stable keys like preference.liquidity_vs_margin (allowed prefixes: preference|goal|profile|context|decision|temporary).",
      },
    };
  }

  const summary = input.summary.trim().slice(0, 500);
  if (summary.length < 8) {
    return {
      ok: false,
      mutation: { action: "rejected", topicKey, reason: "summary too short" },
    };
  }

  if (input.provenance === "SYSTEM_DERIVED") {
    if (
      input.kind !== "PROFILE" &&
      input.kind !== "BUSINESS_CONTEXT"
    ) {
      return {
        ok: false,
        mutation: {
          action: "rejected",
          topicKey,
          reason:
            "SYSTEM_DERIVED only allowed for PROFILE or BUSINESS_CONTEXT — not live REMATCHER snapshots.",
        },
      };
    }
    if (isOperationalSnapshot(summary, input.details)) {
      return {
        ok: false,
        mutation: {
          action: "rejected",
          topicKey,
          reason:
            "SYSTEM_DERIVED must not duplicate live inventory/search/match/pending counts — use REMATCHER tools instead.",
        },
      };
    }
  }

  let confidence =
    typeof input.confidence === "number" && Number.isFinite(input.confidence)
      ? Math.min(1, Math.max(0, input.confidence))
      : input.provenance === "USER_STATED"
        ? 1
        : 0.4;

  if (input.provenance === "AGENT_INFERRED") {
    const note = (input.evidenceNote ?? "").trim();
    if (note.length < 12) {
      return {
        ok: false,
        mutation: {
          action: "rejected",
          topicKey,
          reason:
            "AGENT_INFERRED requires evidenceNote (do not build personality from a single anecdote without justification).",
        },
      };
    }
    if (confidence > DEALER_MEMORY_MAX_INFERRED_CONFIDENCE) {
      confidence = DEALER_MEMORY_MAX_INFERRED_CONFIDENCE;
    }
  }

  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    const d = new Date(input.expiresAt);
    if (!Number.isNaN(d.getTime())) expiresAt = d;
  } else if (input.kind === "TEMPORARY") {
    expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  } else if (input.kind === "GOAL") {
    expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  }

  await expireDueMemories(input.dealerId);

  const existingActive = await prisma.dealerMemoryItem.findFirst({
    where: { dealerId: input.dealerId, topicKey, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });

  if (!existingActive) {
    const activeCount = await prisma.dealerMemoryItem.count({
      where: { dealerId: input.dealerId, status: "ACTIVE" },
    });
    if (activeCount >= DEALER_MEMORY_MAX_ACTIVE) {
      return {
        ok: false,
        mutation: {
          action: "rejected",
          topicKey,
          reason: `ACTIVE memory limit (${DEALER_MEMORY_MAX_ACTIVE}) reached. Supersede an existing topicKey or forget unused memories first.`,
        },
      };
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    if (existingActive) {
      await tx.dealerMemoryItem.update({
        where: { id: existingActive.id },
        data: { status: "SUPERSEDED" },
      });
    }
    return tx.dealerMemoryItem.create({
      data: {
        dealerId: input.dealerId,
        topicKey,
        kind: input.kind,
        provenance: input.provenance,
        summary,
        details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
        confidence,
        evidenceNote: input.evidenceNote?.trim().slice(0, 500) || null,
        expiresAt,
        supersedesId: existingActive?.id ?? null,
        status: "ACTIVE",
      },
    });
  });

  return {
    ok: true,
    item: toView(created),
    mutation: {
      action: existingActive ? "superseded" : "created",
      id: created.id,
      topicKey,
    },
  };
}

export async function forgetMemory(params: {
  dealerId: string;
  memoryId: string;
}): Promise<{ ok: boolean; mutation: MemoryMutationRecord }> {
  const id = params.memoryId.trim();
  if (!id) {
    return {
      ok: false,
      mutation: {
        action: "rejected",
        reason:
          "memoryId required. Call get_my_dealer_memory first to resolve the exact id — fuzzy forget is not supported.",
      },
    };
  }

  const row = await prisma.dealerMemoryItem.findFirst({
    where: { id, dealerId: params.dealerId },
  });
  if (!row) {
    return {
      ok: false,
      mutation: {
        action: "rejected",
        reason: "Memory not found for this dealer (check memoryId).",
      },
    };
  }

  await prisma.dealerMemoryItem.update({
    where: { id: row.id },
    data: { status: "FORGOTTEN", forgottenAt: new Date() },
  });

  return {
    ok: true,
    mutation: {
      action: "forgotten",
      id: row.id,
      topicKey: row.topicKey,
    },
  };
}

export async function correctMemory(params: {
  dealerId: string;
  memoryId: string;
  summary: string;
  details?: Record<string, unknown> | null;
  kind?: DealerMemoryKind;
  confidence?: number;
  expiresAt?: string | null;
  evidenceNote?: string | null;
}): Promise<{ ok: boolean; item?: MemoryItemView; mutation: MemoryMutationRecord }> {
  const row = await prisma.dealerMemoryItem.findFirst({
    where: { id: params.memoryId.trim(), dealerId: params.dealerId },
  });
  if (!row) {
    return {
      ok: false,
      mutation: {
        action: "rejected",
        reason: "Memory not found for this dealer (check memoryId).",
      },
    };
  }

  const result = await createOrSupersedeMemory({
    dealerId: params.dealerId,
    topicKey: row.topicKey,
    kind: params.kind ?? row.kind,
    provenance: "USER_STATED",
    summary: params.summary,
    details: params.details ?? (row.details as Record<string, unknown> | null),
    confidence: params.confidence ?? 1,
    evidenceNote: params.evidenceNote ?? "Dealer correction via structured tool",
    expiresAt: params.expiresAt,
  });

  if (result.ok && result.mutation.action === "superseded") {
    result.mutation.action = "corrected";
  }
  return result;
}

export async function listDealerMemories(params: {
  dealerId: string;
  topicKey?: string;
  kind?: DealerMemoryKind;
  limit?: number;
}): Promise<MemoryItemView[]> {
  await expireDueMemories(params.dealerId);
  const rows = await prisma.dealerMemoryItem.findMany({
    where: {
      dealerId: params.dealerId,
      status: "ACTIVE",
      ...(params.topicKey
        ? { topicKey: normalizeTopicKey(params.topicKey) ?? params.topicKey }
        : {}),
      ...(params.kind ? { kind: params.kind } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.min(params.limit ?? 40, 40),
  });
  return rows.map(toView);
}

export async function retrieveRelevantMemories(params: {
  dealerId: string;
  limit?: number;
}): Promise<{ items: MemoryItemView[]; latencyMs: number }> {
  const started = Date.now();
  await expireDueMemories(params.dealerId);
  await cleanupStaleMemoryRows(params.dealerId);

  const cap = Math.min(
    params.limit ?? DEALER_MEMORY_RETRIEVAL_CAP,
    DEALER_MEMORY_RETRIEVAL_CAP
  );

  const rows = await prisma.dealerMemoryItem.findMany({
    where: {
      dealerId: params.dealerId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: DEALER_MEMORY_MAX_ACTIVE,
  });

  const ranked = [...rows].sort((a, b) => {
    const pk = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    if (pk !== 0) return pk;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return {
    items: ranked.slice(0, cap).map(toView),
    latencyMs: Date.now() - started,
  };
}

export function formatMemoryPromptBlock(items: MemoryItemView[]): string {
  if (!items.length) {
    return `\nDEALER MEMORY (long-term context): none stored yet.\nThis layer is semantic business context — not REMATCHER system truth. Live inventory/searches/matches come only from authorized tools.\n`;
  }

  const lines = items.map((item) => {
    const prov =
      item.provenance === "USER_STATED"
        ? "dealer_stated"
        : item.provenance === "AGENT_INFERRED"
          ? "agent_inferred"
          : "system_derived";
    return `- [${item.kind}/${prov}/conf=${item.confidence.toFixed(2)}] topic=${item.topicKey} id=${item.id}: ${item.summary}`;
  });

  return `\nDEALER MEMORY (long-term context — NOT live DB truth):
Use this to personalize judgment. Distinguish what the dealer stated vs what you inferred.
Never claim "you said" for agent_inferred items.
If authorized tool results contradict memory about current system state, tool results win.
${lines.join("\n")}
`;
}

/** Isolation helper for tests — never use across dealers in production paths */
export async function assertMemoryOwnedByDealer(
  memoryId: string,
  dealerId: string
): Promise<boolean> {
  const row = await prisma.dealerMemoryItem.findFirst({
    where: { id: memoryId, dealerId },
    select: { id: true },
  });
  return Boolean(row);
}

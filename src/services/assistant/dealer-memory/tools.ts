/**
 * Execute structured dealer-memory tools. No NLP here — Agent already decided meaning.
 */
import "server-only";
import type { DealerMemoryKind } from "@prisma/client";
import {
  correctMemory,
  createOrSupersedeMemory,
  forgetMemory,
  listDealerMemories,
} from "@/services/assistant/dealer-memory";
import type { MemoryMutationRecord } from "@/services/assistant/dealer-memory/types";

function asKind(value: unknown): DealerMemoryKind | null {
  const allowed = [
    "PROFILE",
    "PREFERENCE",
    "GOAL",
    "BUSINESS_CONTEXT",
    "DECISION",
    "TEMPORARY",
  ] as const;
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as DealerMemoryKind)
    : null;
}

export async function executeDealerMemoryTool(params: {
  name: string;
  dealerId: string;
  args: Record<string, unknown>;
}): Promise<{ result: Record<string, unknown>; mutation?: MemoryMutationRecord }> {
  const { name, dealerId, args } = params;

  if (name === "remember_dealer_insight") {
    const kind = asKind(args.kind);
    const provenance = args.provenance;
    if (
      !kind ||
      (provenance !== "USER_STATED" &&
        provenance !== "AGENT_INFERRED" &&
        provenance !== "SYSTEM_DERIVED")
    ) {
      return {
        result: { ok: false, error: "invalid_kind_or_provenance" },
        mutation: { action: "rejected", reason: "invalid_kind_or_provenance" },
      };
    }
    const out = await createOrSupersedeMemory({
      dealerId,
      topicKey: String(args.topicKey ?? ""),
      kind,
      provenance,
      summary: String(args.summary ?? ""),
      confidence:
        typeof args.confidence === "number" ? args.confidence : undefined,
      evidenceNote:
        typeof args.evidenceNote === "string" ? args.evidenceNote : null,
      expiresAt: typeof args.expiresAt === "string" ? args.expiresAt : null,
      details:
        args.details && typeof args.details === "object"
          ? (args.details as Record<string, unknown>)
          : null,
    });
    return {
      result: {
        ok: out.ok,
        item: out.item ?? null,
        error: out.ok ? null : out.mutation.reason,
      },
      mutation: out.mutation,
    };
  }

  if (name === "get_my_dealer_memory") {
    const kind = args.kind == null ? undefined : asKind(args.kind) ?? undefined;
    const items = await listDealerMemories({
      dealerId,
      topicKey:
        typeof args.topicKey === "string" && args.topicKey
          ? args.topicKey
          : undefined,
      kind: kind ?? undefined,
      limit: typeof args.limit === "number" ? args.limit : 40,
    });
    return {
      result: {
        ok: true,
        count: items.length,
        items,
        note: "ACTIVE memories for this dealer only. Use memoryId for forget/correct.",
      },
    };
  }

  if (name === "forget_dealer_insight") {
    const out = await forgetMemory({
      dealerId,
      memoryId: String(args.memoryId ?? ""),
    });
    return {
      result: {
        ok: out.ok,
        error: out.ok ? null : out.mutation.reason,
      },
      mutation: out.mutation,
    };
  }

  if (name === "correct_dealer_insight") {
    const kind = args.kind == null ? undefined : asKind(args.kind) ?? undefined;
    const out = await correctMemory({
      dealerId,
      memoryId: String(args.memoryId ?? ""),
      summary: String(args.summary ?? ""),
      kind: kind ?? undefined,
      confidence:
        typeof args.confidence === "number" ? args.confidence : undefined,
      expiresAt: typeof args.expiresAt === "string" ? args.expiresAt : null,
      details:
        args.details && typeof args.details === "object"
          ? (args.details as Record<string, unknown>)
          : null,
      evidenceNote:
        typeof args.evidenceNote === "string" ? args.evidenceNote : null,
    });
    return {
      result: {
        ok: out.ok,
        item: out.item ?? null,
        error: out.ok ? null : out.mutation.reason,
      },
      mutation: out.mutation,
    };
  }

  if (name === "get_my_privacy_settings") {
    const { getConsentState } = await import(
      "@/services/privacy/policy"
    );
    const consents = await getConsentState(dealerId);
    return {
      result: {
        ok: true,
        consents,
        note: "Optional consents only. Core REMATCHER operations continue when all are false. Changing consents is done in Privacy & AI settings — not via this tool.",
      },
    };
  }

  return {
    result: { ok: false, error: "unknown_memory_tool" },
    mutation: { action: "rejected", reason: "unknown_memory_tool" },
  };
}

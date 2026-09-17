import "server-only";
import { prisma } from "@/lib/prisma";
import { confirmImport } from "@/services/inventory/import";
import { logAppEvent } from "@/services/notifications";
import {
  isConfirmation,
  isRejection,
  type ConversationState,
} from "@/services/assistant/conversation-state";
import {
  loadAgentConversationState,
  resolveActiveConversationState,
  saveAgentConversationState,
} from "@/services/assistant/conversation-persistence";
import { runExchangeAssistantV2 } from "@/services/assistant/v2-orchestrator";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";

export type AssistantChatUiContext = {
  route: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  surface?: string;
  mode?: "inventory_management";
  vehicleId?: string;
  demandId?: string;
  matchId?: string;
};

export type AssistantChatTurnResult =
  | { ok: false; error: "message_required" }
  | {
      ok: true;
      body: Record<string, unknown>;
    };

export async function getAssistantConversationPayload(dealerId: string) {
  const state = await loadAgentConversationState(dealerId);
  return {
    conversation: state ?? {},
    recentTurns: state?.recentTurns ?? [],
  };
}

/**
 * Shared Web + Mobile assistant turn — same inventory-import shortcuts and
 * runExchangeAssistantV2 path. Client conversation never overrides stored state.
 */
export async function runAssistantChatTurn(params: {
  dealerId: string;
  userId: string;
  message?: string;
  context?: AssistantChatUiContext;
  clientConversation?: ConversationState;
}): Promise<AssistantChatTurnResult> {
  const message = params.message?.trim();
  if (!message) return { ok: false, error: "message_required" };

  const { dealerId, userId } = params;
  const stored = await loadAgentConversationState(dealerId);
  const active = resolveActiveConversationState(
    stored,
    params.clientConversation
  );

  await logAppEvent({
    eventType: "assistant_opened",
    dealerId,
    metadata: { userId },
  });

  if (/בדוק את קובץ המלאי שהעליתי|בדיקת קובץ מלאי/i.test(message)) {
    const job = await prisma.inventoryImport.findFirst({
      where: { dealerId, status: "PREVIEW" },
      orderBy: { createdAt: "desc" },
    });
    if (!job) {
      return {
        ok: true,
        body: {
          intent: "UPDATE_INVENTORY",
          message: "לא מצאתי קובץ מלאי שממתין לבדיקה.",
          conversation: active ?? {},
          agentVersion: AGENT_VERSION,
        },
      };
    }
    const p = job.previewJson as unknown as {
      rows?: Array<{
        valid?: boolean;
        warnings?: string[];
        duplicateOfVehicleId?: string | null;
      }>;
    };
    const rows = p.rows ?? [];
    const valid = rows.filter((r) => r.valid).length;
    const attention = rows.filter((r) => (r.warnings?.length ?? 0) > 0).length;
    const duplicates = rows.filter((r) => r.duplicateOfVehicleId).length;
    const text = `קלטתי ${rows.length} שורות: ${valid} תקינות, ${attention} דורשות תשומת לב${duplicates ? `, ${duplicates} מזוהות כעדכון קיים` : ""}. רק שורות תקינות ייקלטו. לא אסמן רכבים חסרים כנמכרו. לאשר את הקליטה?`;
    const next: ConversationState = {
      ...(active ?? {}),
      pendingConfirmation: {
        action: "confirm_inventory_import",
        label: "אשר קליטת מלאי",
        payload: { importId: job.id },
      },
      goal: "inventory_import_review",
      recentTurns: [
        ...(active?.recentTurns ?? []),
        { role: "user" as const, text: "בדיקת קובץ מלאי" },
        { role: "assistant" as const, text },
      ].slice(-12),
    };
    await saveAgentConversationState(dealerId, next);
    return {
      ok: true,
      body: {
        intent: "UPDATE_INVENTORY",
        message: text,
        requiresConfirmation: next.pendingConfirmation,
        conversation: next,
        agentVersion: AGENT_VERSION,
      },
    };
  }

  if (active?.pendingConfirmation?.action === "confirm_inventory_import") {
    if (isRejection(message)) {
      const next: ConversationState = {
        ...active,
        pendingConfirmation: undefined,
        goal: undefined,
      };
      await saveAgentConversationState(dealerId, next);
      return {
        ok: true,
        body: {
          intent: "UPDATE_INVENTORY",
          message: "ביטלתי. הקובץ נשאר כטיוטה ולא שינה את המלאי.",
          conversation: next,
          agentVersion: AGENT_VERSION,
        },
      };
    }
    if (isConfirmation(message)) {
      const importId = String(
        active.pendingConfirmation.payload.importId ?? ""
      );
      const result = await confirmImport({
        dealerId,
        importId,
        markMissingAsSold: false,
      });
      const text = `בוצע. ${result.created} רכבים חדשים נקלטו ו-${result.updated} עודכנו. המלאי כבר זמין ל-matching ולסוכן האישי.`;
      const next: ConversationState = {
        ...active,
        pendingConfirmation: undefined,
        goal: undefined,
        recentTurns: [
          ...(active.recentTurns ?? []),
          { role: "user" as const, text: message },
          { role: "assistant" as const, text },
        ].slice(-12),
      };
      await saveAgentConversationState(dealerId, next);
      return {
        ok: true,
        body: {
          intent: "UPDATE_INVENTORY",
          message: text,
          conversation: next,
          agentVersion: AGENT_VERSION,
        },
      };
    }
  }

  const response = await runExchangeAssistantV2({
    dealerId,
    userId,
    message,
    context: params.context ?? { route: "/" },
    conversation: active,
  });
  await saveAgentConversationState(dealerId, response.conversation);
  return {
    ok: true,
    body: {
      ...response,
      agentVersion: response.meta?.agentVersion ?? AGENT_VERSION,
    },
  };
}

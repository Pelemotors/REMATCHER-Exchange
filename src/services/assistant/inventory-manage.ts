import "server-only";
import type { ConversationState } from "@/services/assistant/conversation-state";
import type { AgentMeta } from "@/services/assistant/tools/registry";
import type { AssistantResponse } from "@/services/assistant/orchestrator";
import {
  isConfirmation,
  isRejection,
} from "@/services/assistant/conversation-state";
import { markVehicleSoldForDealer } from "@/services/inventory/mark-sold";
import { updateVehicleForDealer } from "@/services/inventory/update-vehicle";
import {
  isInventoryReadIntent,
  isSoldIntent,
  isUpdateIntent,
  listActiveInventoryCandidates,
  matchVehiclesFromText,
  parseB2bUpdate,
  vehicleSummaryLine,
  vehicleTitle,
  type InventoryCandidate,
} from "@/services/inventory/lookup";
import { formatCurrency } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

export type PendingInventoryMutation = {
  type: "UPDATE" | "MARK_SOLD";
  vehicleId: string;
  proposedChanges?: { b2bPrice?: number; retailPrice?: number };
  status: "WAITING_CONFIRMATION" | "WAITING_SELECTION";
  candidates?: Array<{ id: string; label: string }>;
  label: string;
};

type ManageTurnResponse = AssistantResponse & {
  conversation?: ConversationState;
  meta?: AgentMeta;
  inventoryMutationResult?: {
    type: "created" | "updated" | "sold";
    vehicleId: string;
  };
};

function disambiguationMessage(
  candidates: InventoryCandidate[],
  actionLabel: string
): string {
  const lines = candidates
    .slice(0, 5)
    .map((v, i) => `${i + 1}. ${vehicleSummaryLine(v)}`)
    .join("\n");
  return `יש לך כמה רכבים דומים במלאי:\n${lines}\n\n${actionLabel}`;
}

function selectionIndex(message: string, max: number): number | null {
  const m = message.trim();
  const num = m.match(/^(\d+)$/);
  if (num) {
    const n = parseInt(num[1], 10);
    if (n >= 1 && n <= max) return n - 1;
  }
  if (/ראשון|ראשונה/i.test(m)) return 0;
  if (/שני|שניה/i.test(m) && max >= 2) return 1;
  if (/שלישי|שלישית/i.test(m) && max >= 3) return 2;
  return null;
}

/**
 * Inventory management mutations (update / sold) with explicit confirmation state.
 * Ownership always scoped to dealerId.
 */
export async function handleInventoryManageTurn(params: {
  dealerId: string;
  message: string;
  conversation?: ConversationState;
  meta: AgentMeta;
  focusedVehicleId?: string;
}): Promise<ManageTurnResponse | null> {
  const { meta } = params;
  const pending = params.conversation?.pendingInventoryMutation;

  // --- Continue pending mutation ---
  if (pending?.status === "WAITING_SELECTION" && pending.candidates?.length) {
    const idx = selectionIndex(params.message, pending.candidates.length);
    if (idx == null) {
      return {
        intent: "UPDATE_INVENTORY",
        message: `בחר מספר מהרשימה (1-${pending.candidates.length}).`,
        conversation: {
          ...params.conversation,
          pendingInventoryMutation: pending,
        },
        meta,
      };
    }
    const chosen = pending.candidates[idx];
    const next: PendingInventoryMutation = {
      ...pending,
      vehicleId: chosen.id,
      status: "WAITING_CONFIRMATION",
      candidates: undefined,
      label:
        pending.type === "MARK_SOLD"
          ? `מצאתי ${chosen.label}. לסמן כנמכרה ולהסיר מהמלאי הפעיל?`
          : pending.label.replace("איזו", chosen.label),
    };
    return {
      intent: "UPDATE_INVENTORY",
      message: next.label,
      requiresConfirmation: {
        action:
          next.type === "MARK_SOLD" ? "mark_sold" : "update_inventory",
        label: next.label,
        payload: {
          vehicleId: next.vehicleId,
          proposedChanges: next.proposedChanges,
        },
      },
      conversation: {
        pendingInventoryMutation: next,
        pendingConfirmation: {
          action:
            next.type === "MARK_SOLD" ? "mark_sold" : "update_inventory",
          label: next.label,
          payload: {
            vehicleId: next.vehicleId,
            proposedChanges: next.proposedChanges,
          },
        },
      },
      meta,
    };
  }

  if (pending?.status === "WAITING_CONFIRMATION") {
    if (isConfirmation(params.message)) {
      return executePendingMutation(params.dealerId, pending, meta);
    }
    if (isRejection(params.message)) {
      return {
        intent: "UPDATE_INVENTORY",
        message: "בוטל. שום דבר לא השתנה.",
        conversation: {
          sessionContext: params.conversation?.sessionContext,
        },
        meta,
      };
    }
    return {
      intent: "UPDATE_INVENTORY",
      message: `${pending.label}\n\nאשר או בטל.`,
      requiresConfirmation: {
        action:
          pending.type === "MARK_SOLD" ? "mark_sold" : "update_inventory",
        label: pending.label,
        payload: {
          vehicleId: pending.vehicleId,
          proposedChanges: pending.proposedChanges,
        },
      },
      conversation: {
        pendingInventoryMutation: pending,
        pendingConfirmation: {
          action:
            pending.type === "MARK_SOLD" ? "mark_sold" : "update_inventory",
          label: pending.label,
          payload: {
            vehicleId: pending.vehicleId,
            proposedChanges: pending.proposedChanges,
          },
        },
      },
      meta,
    };
  }

  // Also honor pendingConfirmation for mark_sold / update from older path
  const pc = params.conversation?.pendingConfirmation;
  if (
    pc &&
    (pc.action === "mark_sold" || pc.action === "update_inventory")
  ) {
    if (isConfirmation(params.message)) {
      const mutation: PendingInventoryMutation = {
        type: pc.action === "mark_sold" ? "MARK_SOLD" : "UPDATE",
        vehicleId: pc.payload.vehicleId as string,
        proposedChanges: pc.payload.proposedChanges as
          | PendingInventoryMutation["proposedChanges"]
          | undefined,
        status: "WAITING_CONFIRMATION",
        label: pc.label,
      };
      return executePendingMutation(params.dealerId, mutation, meta);
    }
    if (isRejection(params.message)) {
      return {
        intent: "UPDATE_INVENTORY",
        message: "בוטל. שום דבר לא השתנה.",
        conversation: {},
        meta,
      };
    }
  }

  // --- Read intents ---
  if (isInventoryReadIntent(params.message)) {
    if (/דורש טיפול|טיפול/i.test(params.message)) {
      const stale = await prisma.vehicle.findMany({
        where: {
          dealerId: params.dealerId,
          status: "ACTIVE",
          OR: [
            { freshnessState: "STALE" },
            { freshnessState: "VALIDATION_REQUIRED" },
          ],
        },
        take: 8,
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          mileage: true,
          b2bPrice: true,
          retailPrice: true,
          status: true,
        },
      });
      meta.responseType = "inventory_attention";
      if (stale.length === 0) {
        return {
          intent: "UPDATE_INVENTORY",
          message: "אין רכבים שדורשים טיפול כרגע.",
          meta,
        };
      }
      return {
        intent: "UPDATE_INVENTORY",
        message: `דורשים טיפול:\n${stale.map((v) => `• ${vehicleSummaryLine(v)}`).join("\n")}`,
        suggestions: [{ label: "למלאי", href: "/inventory?filter=attention" }],
        meta,
      };
    }
    const count = await prisma.vehicle.count({
      where: { dealerId: params.dealerId, status: "ACTIVE" },
    });
    meta.responseType = "inventory_count";
    return {
      intent: "UPDATE_INVENTORY",
      message: `יש לך ${count} רכבים במלאי הפעיל.`,
      suggestions: [{ label: "למלאי", href: "/inventory" }],
      meta,
    };
  }

  // --- Sold intent ---
  if (isSoldIntent(params.message)) {
    return startSoldFlow(params);
  }

  // --- Update intent ---
  if (isUpdateIntent(params.message)) {
    return startUpdateFlow(params);
  }

  return null;
}

async function executePendingMutation(
  dealerId: string,
  pending: PendingInventoryMutation,
  meta: AgentMeta
): Promise<ManageTurnResponse> {
  if (pending.type === "MARK_SOLD") {
    const result = await markVehicleSoldForDealer({
      dealerId,
      vehicleId: pending.vehicleId,
      source: "agent_inventory",
    });
    meta.responseType = "mutation_sold";
    if (!result.ok) {
      return {
        intent: "UPDATE_INVENTORY",
        message: "לא הצלחתי לעדכן כרגע. שום דבר לא השתנה.",
        meta,
      };
    }
    return {
      intent: "UPDATE_INVENTORY",
      message: "הרכב הוסר מהמלאי הפעיל.",
      conversation: {},
      inventoryMutationResult: {
        type: "sold",
        vehicleId: pending.vehicleId,
      },
      meta,
    };
  }

  const result = await updateVehicleForDealer({
    dealerId,
    vehicleId: pending.vehicleId,
    fields: {
      b2bPrice: pending.proposedChanges?.b2bPrice,
      retailPrice: pending.proposedChanges?.retailPrice,
    },
    source: "agent_inventory",
  });
  meta.responseType = "mutation_inventory_update";
  if (!result.ok) {
    return {
      intent: "UPDATE_INVENTORY",
      message: "לא הצלחתי לעדכן כרגע. שום דבר לא השתנה.",
      meta,
    };
  }
  return {
    intent: "UPDATE_INVENTORY",
    message: "עודכן.",
    conversation: {},
    inventoryMutationResult: {
      type: "updated",
      vehicleId: pending.vehicleId,
    },
    meta,
  };
}

async function startSoldFlow(params: {
  dealerId: string;
  message: string;
  conversation?: ConversationState;
  meta: AgentMeta;
  focusedVehicleId?: string;
}): Promise<ManageTurnResponse> {
  const candidates = await listActiveInventoryCandidates(params.dealerId);
  let matches: InventoryCandidate[] = [];

  if (params.focusedVehicleId) {
    const focused = candidates.find((c) => c.id === params.focusedVehicleId);
    if (focused) matches = [focused];
  }
  if (matches.length === 0) {
    matches = matchVehiclesFromText(params.message, candidates);
  }

  if (matches.length === 0) {
    params.meta.responseType = "inventory_sold_not_found";
    return {
      intent: "UPDATE_INVENTORY",
      message:
        "לא מצאתי רכב מתאים במלאי הפעיל שלך. רוצה לראות את המלאי?",
      suggestions: [{ label: "למלאי", href: "/inventory" }],
      meta: params.meta,
    };
  }

  if (matches.length > 1) {
    params.meta.responseType = "inventory_sold_disambiguate";
    const pending: PendingInventoryMutation = {
      type: "MARK_SOLD",
      vehicleId: "",
      status: "WAITING_SELECTION",
      candidates: matches.map((v) => ({
        id: v.id,
        label: vehicleSummaryLine(v),
      })),
      label: "איזו מהן נמכרה?",
    };
    return {
      intent: "UPDATE_INVENTORY",
      message: disambiguationMessage(matches, "איזו מהן נמכרה?"),
      conversation: { pendingInventoryMutation: pending },
      meta: params.meta,
    };
  }

  const v = matches[0];
  const label = `מצאתי ${vehicleTitle(v)} במלאי שלך.\nלסמן כנמכרה ולהסיר מהמלאי הפעיל?`;
  const pending: PendingInventoryMutation = {
    type: "MARK_SOLD",
    vehicleId: v.id,
    status: "WAITING_CONFIRMATION",
    label,
  };
  params.meta.responseType = "confirmation_sold";
  return {
    intent: "UPDATE_INVENTORY",
    message: label,
    requiresConfirmation: {
      action: "mark_sold",
      label,
      payload: { vehicleId: v.id },
    },
    conversation: {
      pendingInventoryMutation: pending,
      pendingConfirmation: {
        action: "mark_sold",
        label,
        payload: { vehicleId: v.id },
      },
    },
    meta: params.meta,
  };
}

async function startUpdateFlow(params: {
  dealerId: string;
  message: string;
  conversation?: ConversationState;
  meta: AgentMeta;
  focusedVehicleId?: string;
}): Promise<ManageTurnResponse> {
  const b2b = parseB2bUpdate(params.message);
  if (b2b == null) {
    return {
      intent: "UPDATE_INVENTORY",
      message:
        "לא הבנתי מה לעדכן. לדוגמה: תעדכן את ה-CX5 ל-129 B2B",
      meta: params.meta,
    };
  }

  const candidates = await listActiveInventoryCandidates(params.dealerId);
  let matches: InventoryCandidate[] = [];
  if (params.focusedVehicleId) {
    const focused = candidates.find((c) => c.id === params.focusedVehicleId);
    if (focused) matches = [focused];
  }
  if (matches.length === 0) {
    matches = matchVehiclesFromText(params.message, candidates);
  }

  if (matches.length === 0) {
    return {
      intent: "UPDATE_INVENTORY",
      message:
        "לא מצאתי רכב מתאים במלאי הפעיל שלך. רוצה לראות את המלאי?",
      suggestions: [{ label: "למלאי", href: "/inventory" }],
      meta: params.meta,
    };
  }

  if (matches.length > 1) {
    const pending: PendingInventoryMutation = {
      type: "UPDATE",
      vehicleId: "",
      proposedChanges: { b2bPrice: b2b },
      status: "WAITING_SELECTION",
      candidates: matches.map((v) => ({
        id: v.id,
        label: vehicleSummaryLine(v),
      })),
      label: `לאיזה רכב לעדכן B2B ל-${formatCurrency(b2b)}?`,
    };
    return {
      intent: "UPDATE_INVENTORY",
      message: disambiguationMessage(
        matches,
        `לאיזה רכב לעדכן B2B ל-${formatCurrency(b2b)}?`
      ),
      conversation: { pendingInventoryMutation: pending },
      meta: params.meta,
    };
  }

  const v = matches[0];
  const current =
    v.b2bPrice != null ? formatCurrency(v.b2bPrice) : "לא הוגדר";
  const label = `מצאתי ${vehicleTitle(v)} במלאי שלך.\nמחיר B2B נוכחי: ${current}\nלעדכן ל-${formatCurrency(b2b)}?`;
  const pending: PendingInventoryMutation = {
    type: "UPDATE",
    vehicleId: v.id,
    proposedChanges: { b2bPrice: b2b },
    status: "WAITING_CONFIRMATION",
    label,
  };
  params.meta.responseType = "confirmation_inventory_update";
  return {
    intent: "UPDATE_INVENTORY",
    message: label,
    requiresConfirmation: {
      action: "update_inventory",
      label,
      payload: { vehicleId: v.id, proposedChanges: { b2bPrice: b2b } },
    },
    conversation: {
      pendingInventoryMutation: pending,
      pendingConfirmation: {
        action: "update_inventory",
        label,
        payload: { vehicleId: v.id, proposedChanges: { b2bPrice: b2b } },
      },
    },
    meta: params.meta,
  };
}

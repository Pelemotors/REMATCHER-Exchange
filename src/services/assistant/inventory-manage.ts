import "server-only";
import type {
  ConversationState,
  PendingInventoryMutation,
  ProposedVehicleChanges,
} from "@/services/assistant/conversation-state";
import type { AgentMeta } from "@/services/assistant/tools/registry";
import type { AssistantResponse } from "@/services/assistant/orchestrator";
import {
  isConfirmation,
  isRejection,
} from "@/services/assistant/conversation-state";
import { markVehicleSoldForDealer } from "@/services/inventory/mark-sold";
import { updateVehicleForDealer } from "@/services/inventory/update-vehicle";
import {
  describeProposedChanges,
  isInventoryReadIntent,
  isSoldIntent,
  isUnavailableIntent,
  isUpdateIntent,
  listActiveInventoryCandidates,
  matchVehiclesFromText,
  parseVehicleUpdateChanges,
  vehicleSummaryLine,
  vehicleTitle,
  type InventoryCandidate,
} from "@/services/inventory/lookup";
import { prisma } from "@/lib/prisma";
import type { StructuredTurnEvent } from "@/services/assistant/turn-event";
import { logAppEvent } from "@/services/notifications";
import { AGENT_VERSION } from "@/services/assistant/tools/registry";

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
  return `יש אצלך כמה רכבים דומים:\n${lines}\n\n${actionLabel}`;
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
  turn?: StructuredTurnEvent;
}): Promise<ManageTurnResponse | null> {
  const { meta } = params;
  const turn = params.turn;
  const pending = params.conversation?.pendingInventoryMutation;

  // Sold confirmation rejected → unavailable intent
  if (
    pending?.status === "WAITING_CONFIRMATION" &&
    pending.type === "MARK_SOLD" &&
    (turn?.intent === "mark_unavailable" ||
      turn?.relation === "REJECTION" ||
      (/לא.*נמכר|רק\s*לא\s*זמינ|לא\s*זמינ/i.test(params.message) &&
        !turn?.confirms))
  ) {
    await logAppEvent({
      eventType: "agent_correction_detected",
      dealerId: params.dealerId,
      metadata: {
        agentVersion: AGENT_VERSION,
        relation: "REJECTION",
        from: "MARK_SOLD",
        to: "MARK_UNAVAILABLE",
      },
    });
    const next: PendingInventoryMutation = {
      ...pending,
      type: "MARK_UNAVAILABLE",
      proposedChanges: { status: "ARCHIVED" },
      status: "WAITING_CONFIRMATION",
      label: `מצאתי את הרכב. לסמן כלא זמין ולהעביר לארכיון?`,
    };
    return confirmationResponse(next, meta);
  }

  // --- Availability choice (sold vs unavailable) ---
  if (pending?.status === "WAITING_AVAILABILITY_CHOICE") {
    const m = params.message.trim();
    if (/נמכר|sold/i.test(m) && !/לא.*נמכר/i.test(m)) {
      const next: PendingInventoryMutation = {
        ...pending,
        type: "MARK_SOLD",
        status: "WAITING_CONFIRMATION",
        label: `לסמן כנמכרה ולהסיר מהמלאי הפעיל?`,
      };
      return confirmationResponse(next, meta);
    }
    if (
      /לא זמינ|ארכיון|unavailable|השבת/i.test(m) ||
      turn?.intent === "mark_unavailable"
    ) {
      const next: PendingInventoryMutation = {
        ...pending,
        type: "MARK_UNAVAILABLE",
        proposedChanges: { status: "ARCHIVED" },
        status: "WAITING_CONFIRMATION",
        label: `לסמן כלא זמין ולהעביר לארכיון?`,
      };
      return confirmationResponse(next, meta);
    }
    return {
      intent: "UPDATE_INVENTORY",
      message: "לסמן כלא זמינה או כנמכרה?",
      conversation: { pendingInventoryMutation: pending },
      suggestions: [{ label: "נמכרה" }, { label: "לא זמינה" }],
      meta,
    };
  }

  // --- Continue pending mutation ---
  if (pending?.status === "WAITING_SELECTION" && pending.candidates?.length) {
    let idx = selectionIndex(params.message, pending.candidates.length);
    if (idx == null && turn?.targetObject?.selectionIndex != null) {
      const s = turn.targetObject.selectionIndex;
      if (s >= 1 && s <= pending.candidates.length) idx = s - 1;
    }
    // Year reference: "ה-2022"
    if (idx == null) {
      const yearMatch = params.message.match(/20\d{2}/);
      if (yearMatch) {
        const y = yearMatch[0];
        const found = pending.candidates.findIndex((c) => c.label.includes(y));
        if (found >= 0) idx = found;
      }
    }
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
    const extraChanges = parseVehicleUpdateChanges(params.message);
    const fromTurn = turn?.extractedFacts;
    const proposed: ProposedVehicleChanges = {
      ...pending.proposedChanges,
      ...(extraChanges ?? {}),
    };
    if (fromTurn?.mileage != null) proposed.mileage = fromTurn.mileage;
    if (fromTurn?.b2bPrice != null) proposed.b2bPrice = fromTurn.b2bPrice;
    if (fromTurn?.ownershipHand != null) {
      proposed.ownershipHand = fromTurn.ownershipHand;
    }

    const next: PendingInventoryMutation = {
      ...pending,
      vehicleId: chosen.id,
      proposedChanges:
        pending.type === "UPDATE" || Object.keys(proposed).length
          ? proposed
          : pending.proposedChanges,
      status: "WAITING_CONFIRMATION",
      candidates: undefined,
      label:
        pending.type === "MARK_SOLD"
          ? `מצאתי ${chosen.label}. לסמן כנמכרה ולהסיר מהמלאי הפעיל?`
          : pending.type === "MARK_UNAVAILABLE"
            ? `מצאתי ${chosen.label}. לסמן כלא זמין?`
            : `מצאתי ${chosen.label}.\nלעדכן ל: ${describeProposedChanges(proposed)}?`,
    };
    return confirmationResponse(next, meta);
  }

  if (pending?.status === "WAITING_CONFIRMATION") {
    if (turn?.confirms || turn?.relation === "CONFIRMATION" || isConfirmation(params.message)) {
      // Guard: "כן, וכמה התאמות" without clear sole confirmation
      if (
        /התאמ|מלאי|חיפוש/i.test(params.message) &&
        !/^(כן|שמור|עדכן|יאללה)/i.test(params.message.trim())
      ) {
        // mixed message — do not mutate; let orchestrator topic-switch
        return null;
      }
      return executePendingMutation(params.dealerId, pending, meta);
    }
    if (turn?.cancels || turn?.relation === "CANCEL" || isRejection(params.message)) {
      return {
        intent: "UPDATE_INVENTORY",
        message: "בוטל. שום דבר לא השתנה.",
        conversation: {
          sessionContext: params.conversation?.sessionContext,
        },
        meta,
      };
    }
    return confirmationResponse(pending, meta, true);
  }

  const pc = params.conversation?.pendingConfirmation;
  if (
    pc &&
    (pc.action === "mark_sold" ||
      pc.action === "update_inventory" ||
      pc.action === "mark_unavailable")
  ) {
    if (isConfirmation(params.message)) {
      const mutation: PendingInventoryMutation = {
        type:
          pc.action === "mark_sold"
            ? "MARK_SOLD"
            : pc.action === "mark_unavailable"
              ? "MARK_UNAVAILABLE"
              : "UPDATE",
        vehicleId: pc.payload.vehicleId as string,
        proposedChanges: pc.payload.proposedChanges as
          | ProposedVehicleChanges
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

  // Soft unavailable before hard sold (avoid assuming SOLD)
  if (isUnavailableIntent(params.message) && !/נמכר/i.test(params.message)) {
    return startAvailabilityChoiceFlow(params);
  }

  if (isSoldIntent(params.message)) {
    return startSoldFlow(params);
  }

  if (isUpdateIntent(params.message)) {
    return startUpdateFlow(params);
  }

  // Contextual update with focused vehicle: "היא על 79 עכשיו"
  if (params.focusedVehicleId || params.conversation?.focusedObject?.type === "vehicle") {
    const changes = parseVehicleUpdateChanges(params.message);
    if (changes) {
      return startUpdateFlow({ ...params, message: params.message });
    }
  }

  return null;
}

function confirmationResponse(
  pending: PendingInventoryMutation,
  meta: AgentMeta,
  remind?: boolean
): ManageTurnResponse {
  const action =
    pending.type === "MARK_SOLD"
      ? "mark_sold"
      : pending.type === "MARK_UNAVAILABLE"
        ? "mark_unavailable"
        : "update_inventory";
  const label = remind ? `${pending.label}\n\nאשר או בטל.` : pending.label;
  meta.responseType =
    pending.type === "MARK_SOLD"
      ? "confirmation_sold"
      : pending.type === "MARK_UNAVAILABLE"
        ? "confirmation_unavailable"
        : "confirmation_inventory_update";
  return {
    intent: "UPDATE_INVENTORY",
    message: label,
    requiresConfirmation: {
      action,
      label: pending.label,
      payload: {
        vehicleId: pending.vehicleId,
        proposedChanges: pending.proposedChanges,
      },
    },
    conversation: {
      pendingInventoryMutation: pending,
      pendingConfirmation: {
        action,
        label: pending.label,
        payload: {
          vehicleId: pending.vehicleId,
          proposedChanges: pending.proposedChanges,
        },
      },
    },
    suggestions:
      pending.type === "MARK_SOLD"
        ? [{ label: "כן, נמכרה" }, { label: "ביטול" }]
        : [{ label: "עדכן" }, { label: "ביטול" }],
    meta,
  };
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

  if (pending.type === "MARK_UNAVAILABLE") {
    const result = await updateVehicleForDealer({
      dealerId,
      vehicleId: pending.vehicleId,
      fields: { status: "ARCHIVED" },
      source: "agent_inventory",
    });
    meta.responseType = "mutation_unavailable";
    if (!result.ok) {
      return {
        intent: "UPDATE_INVENTORY",
        message: "לא הצלחתי לעדכן כרגע. שום דבר לא השתנה.",
        meta,
      };
    }
    return {
      intent: "UPDATE_INVENTORY",
      message: "עודכן — הרכב לא במלאי הפעיל.",
      conversation: {},
      inventoryMutationResult: {
        type: "updated",
        vehicleId: pending.vehicleId,
      },
      meta,
    };
  }

  const fields: Record<string, unknown> = {};
  const c = pending.proposedChanges ?? {};
  if (c.mileage != null) fields.mileage = c.mileage;
  if (c.b2bPrice != null) fields.b2bPrice = c.b2bPrice;
  if (c.retailPrice != null) fields.retailPrice = c.retailPrice;
  if (c.ownershipHand != null) fields.ownershipHand = c.ownershipHand;
  if (c.ownershipType != null) fields.ownershipType = c.ownershipType;
  if (c.trim !== undefined) fields.trim = c.trim;
  if (c.color !== undefined) fields.color = c.color;

  const result = await updateVehicleForDealer({
    dealerId,
    vehicleId: pending.vehicleId,
    fields: fields as import("@/services/inventory/update-vehicle").VehicleUpdateFields,
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

async function resolveMatches(params: {
  dealerId: string;
  message: string;
  focusedVehicleId?: string;
}): Promise<InventoryCandidate[]> {
  const candidates = await listActiveInventoryCandidates(params.dealerId);
  if (params.focusedVehicleId) {
    const focused = candidates.find((c) => c.id === params.focusedVehicleId);
    if (focused) return [focused];
  }
  return matchVehiclesFromText(params.message, candidates);
}

async function startAvailabilityChoiceFlow(params: {
  dealerId: string;
  message: string;
  conversation?: ConversationState;
  meta: AgentMeta;
  focusedVehicleId?: string;
}): Promise<ManageTurnResponse> {
  const matches = await resolveMatches(params);
  if (matches.length === 0) {
    params.meta.responseType = "inventory_unavailable_not_found";
    return {
      intent: "UPDATE_INVENTORY",
      message: "לא מצאתי רכב מתאים במלאי הפעיל שלך.",
      suggestions: [{ label: "למלאי", href: "/inventory" }],
      meta: params.meta,
    };
  }
  if (matches.length > 1) {
    const pending: PendingInventoryMutation = {
      type: "MARK_UNAVAILABLE",
      vehicleId: "",
      status: "WAITING_SELECTION",
      candidates: matches.map((v) => ({
        id: v.id,
        label: vehicleSummaryLine(v),
      })),
      label: "איזה רכב? אחר כך נבחר אם נמכר או לא זמין.",
    };
    return {
      intent: "UPDATE_INVENTORY",
      message: disambiguationMessage(matches, "איזה רכב?"),
      conversation: { pendingInventoryMutation: pending },
      meta: params.meta,
    };
  }
  const v = matches[0];
  const pending: PendingInventoryMutation = {
    type: "MARK_UNAVAILABLE",
    vehicleId: v.id,
    status: "WAITING_AVAILABILITY_CHOICE",
    label: `מצאתי ${vehicleTitle(v)}. לסמן כלא זמינה או כנמכרה?`,
  };
  params.meta.responseType = "inventory_availability_choice";
  return {
    intent: "UPDATE_INVENTORY",
    message: pending.label,
    conversation: { pendingInventoryMutation: pending },
    suggestions: [{ label: "נמכרה" }, { label: "לא זמינה" }],
    meta: params.meta,
  };
}

async function startSoldFlow(params: {
  dealerId: string;
  message: string;
  conversation?: ConversationState;
  meta: AgentMeta;
  focusedVehicleId?: string;
}): Promise<ManageTurnResponse> {
  const matches = await resolveMatches(params);

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
  return confirmationResponse(pending, params.meta);
}

async function startUpdateFlow(params: {
  dealerId: string;
  message: string;
  conversation?: ConversationState;
  meta: AgentMeta;
  focusedVehicleId?: string;
}): Promise<ManageTurnResponse> {
  const changes = parseVehicleUpdateChanges(params.message);
  if (!changes) {
    return {
      intent: "UPDATE_INVENTORY",
      message:
        "לא הבנתי מה לעדכן. לדוגמה: תעדכן את הקורולה ל-79 אלף ק״מ, או מחיר 132",
      meta: params.meta,
    };
  }

  const matches = await resolveMatches(params);

  if (matches.length === 0) {
    return {
      intent: "UPDATE_INVENTORY",
      message:
        "לא מצאתי רכב מתאים במלאי הפעיל שלך. רוצה לראות את המלאי?",
      suggestions: [{ label: "למלאי", href: "/inventory" }],
      meta: params.meta,
    };
  }

  const desc = describeProposedChanges(changes);

  if (matches.length > 1) {
    const pending: PendingInventoryMutation = {
      type: "UPDATE",
      vehicleId: "",
      proposedChanges: changes,
      status: "WAITING_SELECTION",
      candidates: matches.map((v) => ({
        id: v.id,
        label: vehicleSummaryLine(v),
      })),
      label: `לאיזה רכב לעדכן (${desc})?`,
    };
    return {
      intent: "UPDATE_INVENTORY",
      message: disambiguationMessage(matches, pending.label),
      conversation: { pendingInventoryMutation: pending },
      meta: params.meta,
    };
  }

  const v = matches[0];
  const label = `מצאתי ${vehicleTitle(v)} במלאי שלך.\nלעדכן ל: ${desc}?`;
  const pending: PendingInventoryMutation = {
    type: "UPDATE",
    vehicleId: v.id,
    proposedChanges: changes,
    status: "WAITING_CONFIRMATION",
    label,
  };
  return confirmationResponse(pending, params.meta);
}

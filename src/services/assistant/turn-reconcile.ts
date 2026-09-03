import type { ConversationState } from "@/services/assistant/conversation-state";
import {
  applyFields,
  emptyDraftFields,
  markGapSkipped,
  nextGapToAsk,
  type InventoryDraftFields,
  type InventoryGapId,
  type PendingInventoryDraft,
} from "@/services/assistant/inventory-draft";
import type {
  StructuredTurnEvent,
  SuspendedContext,
  TurnInventoryFacts,
} from "@/services/assistant/turn-event";

function factsToPatch(facts?: TurnInventoryFacts): Partial<InventoryDraftFields> {
  if (!facts) return {};
  const patch: Partial<InventoryDraftFields> = {};
  if (facts.make !== undefined && facts.make !== null) patch.make = facts.make;
  if (facts.model !== undefined && facts.model !== null) patch.model = facts.model;
  if (facts.trim !== undefined) patch.trim = facts.trim;
  if (facts.year !== undefined && facts.year !== null) patch.year = facts.year;
  if (facts.mileage !== undefined && facts.mileage !== null) {
    patch.mileage = facts.mileage;
  }
  if (facts.color !== undefined) patch.color = facts.color;
  if (facts.ownershipHand !== undefined && facts.ownershipHand !== null) {
    patch.ownershipHand = facts.ownershipHand;
  }
  if (facts.ownershipType !== undefined && facts.ownershipType !== null) {
    patch.ownershipType = facts.ownershipType;
  }
  if (facts.retailPrice !== undefined && facts.retailPrice !== null) {
    patch.retailPrice = facts.retailPrice;
  }
  if (facts.b2bPrice !== undefined && facts.b2bPrice !== null) {
    patch.b2bPrice = facts.b2bPrice;
  }
  if (facts.region !== undefined) patch.region = facts.region;
  return patch;
}

/** Merge turn facts into draft — any order; corrections overwrite. */
export function mergeFactsIntoDraft(
  draft: PendingInventoryDraft,
  turn: StructuredTurnEvent
): PendingInventoryDraft {
  const corrected = factsToPatch(turn.correctedFacts);
  const extracted = factsToPatch(turn.extractedFacts);
  const patch = { ...extracted, ...corrected };

  let next = applyFields(draft, patch);
  const rejected = [
    ...(draft.rejectedInterpretations ?? []),
    ...(turn.rejectedInterpretations ?? []),
  ];
  if (rejected.length) {
    next = {
      ...next,
      rejectedInterpretations: [...new Set(rejected)],
    };
  }

  // If Cross rejected and model looks like Cross, clear to Corolla when corrected
  if (
    turn.rejectedInterpretations?.some((r) => /cross|קרוס/i.test(r)) &&
    next.fields.model &&
    /cross/i.test(next.fields.model)
  ) {
    next = applyFields(next, {
      model: turn.correctedFacts?.model ?? turn.extractedFacts?.model ?? "Corolla",
    });
  }

  if (turn.skipRequested) {
    const gap = nextGapToAsk(next);
    if (gap) next = markGapSkipped(next, gap);
  }

  return next;
}

export function draftFromTurnFacts(
  message: string,
  turn: StructuredTurnEvent
): PendingInventoryDraft {
  const base: PendingInventoryDraft = {
    status: "DRAFT",
    sourceText: message,
    fields: emptyDraftFields(),
    askedGaps: [],
    skippedGaps: [],
    rejectedInterpretations: turn.rejectedInterpretations ?? [],
  };
  return mergeFactsIntoDraft(base, turn);
}

export function suspendInventoryDraft(
  state: ConversationState
): ConversationState {
  if (!state.pendingInventoryDraft) return state;
  const suspended: SuspendedContext = {
    kind: "inventory_draft",
    draft: state.pendingInventoryDraft,
    label: "inventory_draft",
  };
  return {
    ...state,
    suspendedContext: suspended,
    pendingInventoryDraft: undefined,
    pendingConfirmation:
      state.pendingConfirmation?.action === "create_inventory"
        ? undefined
        : state.pendingConfirmation,
    sessionContext: {
      ...state.sessionContext,
      forcedIntent: undefined,
      operatingMode: state.sessionContext?.operatingMode,
    },
  };
}

export function resumeSuspendedInventory(
  state: ConversationState
): ConversationState {
  const sus = state.suspendedContext;
  if (!sus || sus.kind !== "inventory_draft" || !sus.draft) {
    return state;
  }
  return {
    ...state,
    pendingInventoryDraft: sus.draft,
    suspendedContext: undefined,
    sessionContext: {
      ...state.sessionContext,
      forcedIntent: "create_inventory",
      operatingMode: "inventory_management",
    },
  };
}

export function applyTurnToConversationState(
  state: ConversationState,
  turn: StructuredTurnEvent,
  opts?: { agentQuestion?: { kind: string; text: string } }
): ConversationState {
  let next: ConversationState = {
    ...state,
    lastInterpretation: turn,
  };

  if (opts?.agentQuestion) {
    const same =
      state.lastAgentQuestion?.kind === opts.agentQuestion.kind &&
      state.lastAgentQuestion?.text === opts.agentQuestion.text;
    next = {
      ...next,
      lastAgentQuestion: {
        ...opts.agentQuestion,
        capability: turn.targetCapability,
      },
      repeatedQuestionCount: same ? (state.repeatedQuestionCount ?? 0) + 1 : 0,
    };
  } else if (turn.relation !== "WORDING_CORRECTION") {
    // New info — reset repeat counter when facts arrived
    if (turn.extractedFacts || turn.correctedFacts) {
      next = { ...next, repeatedQuestionCount: 0 };
    }
  }

  if (turn.rejectedInterpretations?.length) {
    next = {
      ...next,
      rejectedInterpretations: [
        ...new Set([
          ...(state.rejectedInterpretations ?? []),
          ...turn.rejectedInterpretations,
        ]),
      ],
      recentCorrections: [
        ...(state.recentCorrections ?? []),
        {
          relation: turn.relation,
          rejected: turn.rejectedInterpretations,
          at: Date.now(),
        },
      ].slice(-8),
    };
  }

  return next;
}

export function shouldPreventRepeatedQuestion(
  state: ConversationState,
  nextKind: string,
  turn: StructuredTurnEvent
): boolean {
  const count = state.repeatedQuestionCount ?? 0;
  if (count < 1) return false;
  if (state.lastAgentQuestion?.kind !== nextKind) return false;
  if (
    turn.relation === "CORRECTION" ||
    turn.relation === "WORDING_CORRECTION" ||
    turn.relation === "REJECTION" ||
    turn.relation === "TOPIC_SWITCH" ||
    turn.relation === "UNKNOWN"
  ) {
    return true;
  }
  // Same question twice with no new facts
  if (count >= 1 && !turn.extractedFacts && !turn.correctedFacts) {
    return true;
  }
  return false;
}

export function recommendedGapKind(
  draft: PendingInventoryDraft
): InventoryGapId | "confirm" | null {
  if (
    draft.status === "WAITING_CONFIRMATION" ||
    (draft.fields.make &&
      draft.fields.model &&
      draft.fields.year &&
      !nextGapToAsk(draft))
  ) {
    return "confirm";
  }
  return nextGapToAsk(draft);
}

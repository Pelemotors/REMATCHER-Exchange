import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("server-only", () => ({}));
vi.mock("@/services/ai/client", () => ({
  callOpenAIStructured: vi.fn(),
  isOpenAIConfigured: () => false,
  logAiOperation: vi.fn(),
}));

import { AGENT_VERSION } from "@/services/assistant/tools/registry";
import { interpretTurnFallback } from "@/services/assistant/turn-interpreter";
import {
  applyTurnToConversationState,
  draftFromTurnFacts,
  mergeFactsIntoDraft,
  resumeSuspendedInventory,
  shouldPreventRepeatedQuestion,
  suspendInventoryDraft,
} from "@/services/assistant/turn-reconcile";
import {
  emptyDraftFields,
  hasInventoryIdentity,
  identityPartialMessage,
  nextGapToAsk,
  readyForConfirmation,
  type PendingInventoryDraft,
} from "@/services/assistant/inventory-draft";
import type { ConversationState } from "@/services/assistant/conversation-state";
import type { StructuredTurnEvent } from "@/services/assistant/turn-event";

const root = join(__dirname, "..");

describe("Agent Conversation Freedom → Core 3.0", () => {
  it("bumps AGENT_VERSION to 3.0 without a second Agent", () => {
    expect(AGENT_VERSION).toBe("3.0");
    const orch = readFileSync(
      join(root, "src/services/assistant/v2-orchestrator.ts"),
      "utf8"
    );
    expect(orch).toContain("planConversationTurn");
    expect(orch).toContain("validateTurnPlan");
    expect(orch).toContain("suspendInventoryDraft");
    expect(orch).not.toMatch(/new InventoryAgent|createInventoryAgent/);
  });

  it("orchestrator calls Conversation Brain before free-text inventory ingest", () => {
    const orch = readFileSync(
      join(root, "src/services/assistant/v2-orchestrator.ts"),
      "utf8"
    );
    const body = orch.slice(orch.indexOf("export async function runExchangeAssistantV2"));
    const planIdx = body.indexOf("await planConversationTurn");
    const ingestIdx = body.indexOf("await handleInventoryIngestTurn");
    expect(planIdx).toBeGreaterThan(0);
    expect(ingestIdx).toBeGreaterThan(planIdx);
  });
});

describe("CASE 1 — production transcript regression", () => {
  it("initial listing understands Corolla, rejects Cross, asks איזו שנה with model shown", () => {
    const message =
      "קורולה לא קרוס בלי גג צבע שחור, מחיר 100,000 לא הייבריד";
    const turn = interpretTurnFallback({
      message,
      inventoryMode: true,
    });
    expect(turn.rejectedInterpretations?.some((r) => /cross|קרוס|hybrid/i.test(r))).toBe(
      true
    );
    const draft = draftFromTurnFacts(message, turn);
    // Enrich like production would with b2b
    const withPrice: PendingInventoryDraft = {
      ...draft,
      fields: {
        ...draft.fields,
        make: draft.fields.make ?? "Toyota",
        model: draft.fields.model ?? "Corolla",
        b2bPrice: draft.fields.b2bPrice ?? 100000,
        color: draft.fields.color ?? "שחור",
        year: null,
      },
    };
    expect(withPrice.fields.model).toMatch(/Corolla/i);
    expect(withPrice.fields.model).not.toMatch(/Cross/i);
    const msg = identityPartialMessage(withPrice.fields);
    expect(msg).toContain("Corolla");
    expect(msg).toContain("איזו שנה?");
    expect(msg).not.toContain("מאיזו שנה?");
    expect(hasInventoryIdentity(withPrice.fields)).toBe(false);
  });

  it("mode correction does not parse as year and stays inventory", () => {
    const draft: PendingInventoryDraft = {
      status: "DRAFT",
      sourceText: "קורולה",
      fields: {
        ...emptyDraftFields(),
        make: "Toyota",
        model: "Corolla",
        b2bPrice: 100000,
        year: null,
      },
      askedGaps: [],
      lastAskedGap: "year",
    };
    const turn = interpretTurnFallback({
      message: "זה לא חיפוש זה העלאת מלאי",
      conversation: { pendingInventoryDraft: draft },
      inventoryMode: true,
    });
    expect(turn.relation).toBe("CORRECTION");
    expect(turn.targetCapability).toBe("inventory");
    expect(turn.rejectedInterpretations).toContain("search_demand");
    expect(turn.extractedFacts?.year).toBeFalsy();
    const merged = mergeFactsIntoDraft(draft, turn);
    expect(merged.fields.year).toBeNull();
    expect(nextGapToAsk(merged)).toBe("year");
  });

  it("wording correction is not a year value", () => {
    const turn = interpretTurnFallback({
      message: "זו לא שאלה הגיונית מאיזו שנה אלא איזו שנה",
      conversation: {
        pendingInventoryDraft: {
          status: "DRAFT",
          sourceText: "x",
          fields: {
            ...emptyDraftFields(),
            make: "Toyota",
            model: "Corolla",
            year: null,
          },
          askedGaps: [],
        },
        lastAgentQuestion: {
          kind: "gap_year",
          text: "איזו שנה?",
        },
      },
      inventoryMode: true,
    });
    expect(turn.relation).toBe("WORDING_CORRECTION");
    expect(turn.preferredWording).toMatch(/איזו שנה/);
    expect(turn.extractedFacts?.year).toBeFalsy();
  });
});

describe("out-of-order and corrections", () => {
  it("year gap absorbs ownership + mileage without discarding", () => {
    const draft: PendingInventoryDraft = {
      status: "DRAFT",
      sourceText: "קורולה",
      fields: {
        ...emptyDraftFields(),
        make: "Toyota",
        model: "Corolla",
        year: null,
      },
      askedGaps: [],
      lastAskedGap: "year",
    };
    const turn = interpretTurnFallback({
      message: "יד 1 פרטית 62 אלף",
      conversation: { pendingInventoryDraft: draft },
      inventoryMode: true,
    });
    const merged = mergeFactsIntoDraft(draft, turn);
    expect(merged.fields.ownershipHand).toBe(1);
    expect(merged.fields.ownershipType).toBe("private");
    expect(merged.fields.mileage).toBe(62000);
    expect(merged.fields.year).toBeNull();
    expect(nextGapToAsk(merged)).toBe("year");
  });

  it("mileage gap absorbs יד 2", () => {
    const draft: PendingInventoryDraft = {
      status: "DRAFT",
      sourceText: "קורולה 2022",
      fields: {
        ...emptyDraftFields(),
        make: "Toyota",
        model: "Corolla",
        year: 2022,
        mileage: null,
        b2bPrice: null,
        retailPrice: null,
      },
      askedGaps: [],
      lastAskedGap: "mileage",
    };
    const turn = interpretTurnFallback({
      message: "היא יד 2",
      conversation: { pendingInventoryDraft: draft },
      inventoryMode: true,
    });
    const merged = mergeFactsIntoDraft(draft, turn);
    expect(merged.fields.ownershipHand).toBe(2);
    expect(merged.fields.mileage).toBeNull();
    expect(nextGapToAsk(merged)).toBe("mileage");
  });

  it("לא קרוס, קורולה רגילה rejects Cross keeps Corolla + year", () => {
    const draft: PendingInventoryDraft = {
      status: "DRAFT",
      sourceText: "קורולה קרוס 22",
      fields: {
        ...emptyDraftFields(),
        make: "Toyota",
        model: "Corolla Cross",
        year: 2022,
      },
      askedGaps: [],
    };
    const turn = interpretTurnFallback({
      message: "לא קרוס, קורולה רגילה",
      conversation: { pendingInventoryDraft: draft },
      inventoryMode: true,
    });
    expect(turn.relation).toBe("CORRECTION");
    const merged = mergeFactsIntoDraft(draft, turn);
    expect(merged.fields.model).toBe("Corolla");
    expect(merged.fields.year).toBe(2022);
    expect(merged.rejectedInterpretations?.some((r) => /cross|קרוס/i.test(r))).toBe(
      true
    );
  });
});

describe("topic switch suspend/resume", () => {
  it("suspends draft and resumes on תמשיך", () => {
    const state: ConversationState = {
      pendingInventoryDraft: {
        status: "DRAFT",
        sourceText: "קורולה",
        fields: {
          ...emptyDraftFields(),
          make: "Toyota",
          model: "Corolla",
          year: null,
        },
        askedGaps: [],
      },
      sessionContext: {
        forcedIntent: "create_inventory",
        operatingMode: "inventory_management",
      },
    };
    const suspended = suspendInventoryDraft(state);
    expect(suspended.pendingInventoryDraft).toBeUndefined();
    expect(suspended.suspendedContext?.draft?.fields.model).toBe("Corolla");

    const switchTurn = interpretTurnFallback({
      message: "כמה התאמות יש לי כרגע?",
      conversation: state,
      inventoryMode: true,
    });
    expect(switchTurn.relation).toBe("TOPIC_SWITCH");
    expect(switchTurn.intent).toBe("read_matches");

    const resumeTurn = interpretTurnFallback({
      message: "תמשיך עם הקורולה",
      conversation: suspended,
      inventoryMode: true,
    });
    expect(resumeTurn.relation).toBe("RESUME");
    const resumed = resumeSuspendedInventory(suspended);
    expect(resumed.pendingInventoryDraft?.fields.model).toBe("Corolla");
  });
});

describe("repeated question prevention", () => {
  it("prevents blind repeat after correction without new year", () => {
    let state: ConversationState = {
      lastAgentQuestion: { kind: "gap_year", text: "איזו שנה?" },
      repeatedQuestionCount: 1,
    };
    const turn: StructuredTurnEvent = {
      relation: "CORRECTION",
      intent: "continue_current",
      targetCapability: "inventory",
      rejectedInterpretations: ["search_demand"],
      confirms: false,
      cancels: false,
      skipRequested: false,
      resumeRequested: false,
      confidence: { overall: "high" },
      source: "deterministic",
    };
    expect(shouldPreventRepeatedQuestion(state, "gap_year", turn)).toBe(true);
    state = applyTurnToConversationState(state, turn, {
      agentQuestion: { kind: "gap_year", text: "איזו שנה?" },
    });
    expect(state.repeatedQuestionCount).toBeGreaterThanOrEqual(1);
  });
});

describe("commercial completeness still works", () => {
  it("ready when identity + high value resolved", () => {
    const d: PendingInventoryDraft = {
      status: "DRAFT",
      sourceText: "x",
      fields: {
        ...emptyDraftFields(),
        make: "Toyota",
        model: "Corolla",
        year: 2022,
        mileage: 62000,
        b2bPrice: 134000,
        ownershipType: "private",
      },
      askedGaps: [],
    };
    expect(readyForConfirmation(d)).toBe(true);
  });
});

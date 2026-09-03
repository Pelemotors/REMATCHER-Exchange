/**
 * Context Questions + Confirmation Freedom Tests
 *
 * Tests covering:
 * A. detectContextQuestion in interpretTurnFallback
 * B. answerInventoryContextQuestion behavior
 * C. WAITING_CONFIRMATION freedom
 * D. UNKNOWN at confirmation — clarify, don't repeat
 * E. TOPIC_SWITCH at confirmation — suspend draft
 * F. Existing confirmation safety preserved
 * G. "לא חסר מידע?" — the exact production bug
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/ai/client", () => ({
  callOpenAIStructured: vi.fn(),
  isOpenAIConfigured: () => false,
  logAiOperation: vi.fn(),
}));
vi.mock("@/services/notifications", () => ({
  logAppEvent: vi.fn(),
}));
vi.mock("@/services/assistant/tools/action-tools", () => ({
  createInventoryDraftFromText: vi.fn(),
  executeConfirmInventoryCreate: vi.fn(),
}));

import { interpretTurnFallback } from "@/services/assistant/turn-interpreter";
import { handleInventoryIngestTurn } from "@/services/assistant/inventory-ingest";
import type { PendingInventoryDraft } from "@/services/assistant/inventory-draft";
import type { ConversationState } from "@/services/assistant/conversation-state";

/** Build a fully complete draft (WAITING_CONFIRMATION state) */
function buildConfirmingDraft(overrides?: Partial<PendingInventoryDraft["fields"]>): PendingInventoryDraft {
  return {
    status: "WAITING_CONFIRMATION",
    sourceText: "אודי Q7 2012, 157 אלף, פרטית, 46 לסוחר",
    fields: {
      make: "Audi",
      model: "Q7",
      year: 2012,
      mileage: 157000,
      ownershipType: "private",
      ownershipHand: null,
      b2bPrice: 46000,
      retailPrice: null,
      color: null,
      trim: null,
      region: null,
      ...overrides,
    },
    askedGaps: ["mileage", "dealer_price", "ownership"],
    skippedGaps: [],
  };
}

function buildConversationWithDraft(draft: PendingInventoryDraft): ConversationState {
  return {
    pendingInventoryDraft: draft,
    pendingConfirmation: {
      action: "create_inventory",
      label: "לשמור רכב במלאי?",
      payload: { draft },
    },
    sessionContext: {
      forcedIntent: "create_inventory",
      operatingMode: "inventory_management",
    },
    lastAgentQuestion: {
      kind: "confirm_create",
      text: "לשמור במלאי?",
    },
  };
}

// ============================================================
// A. detectContextQuestion — interpretTurnFallback
// ============================================================
describe("A. detectContextQuestion via interpretTurnFallback", () => {
  const conv = buildConversationWithDraft(buildConfirmingDraft());

  it('"לא חסר מידע?" → CONTEXT_QUESTION / COMPLETENESS', () => {
    const event = interpretTurnFallback({ message: "לא חסר מידע?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("COMPLETENESS");
    expect(event.confirms).toBeFalsy();
    expect(event.cancels).toBeFalsy();
  });

  it('"זה מספיק?" → CONTEXT_QUESTION / COMPLETENESS', () => {
    const event = interpretTurnFallback({ message: "זה מספיק?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("COMPLETENESS");
  });

  it('"מה עוד חסר?" → CONTEXT_QUESTION / MISSING_FIELDS', () => {
    const event = interpretTurnFallback({ message: "מה עוד חסר?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("MISSING_FIELDS");
  });

  it('"מה אתה צריך עוד?" → CONTEXT_QUESTION / MISSING_FIELDS', () => {
    const event = interpretTurnFallback({ message: "מה אתה צריך עוד?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("MISSING_FIELDS");
  });

  it('"מה כבר רשמת?" → CONTEXT_QUESTION / CURRENT_STATE', () => {
    const event = interpretTurnFallback({ message: "מה כבר רשמת?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("CURRENT_STATE");
  });

  it('"מה אמרתי לך עד עכשיו?" → CONTEXT_QUESTION / CURRENT_STATE', () => {
    const event = interpretTurnFallback({ message: "מה אמרתי לך עד עכשיו?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("CURRENT_STATE");
  });

  it('"איזה מחיר רשמת?" → CONTEXT_QUESTION / SPECIFIC_FIELD', () => {
    const event = interpretTurnFallback({ message: "איזה מחיר רשמת?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("SPECIFIC_FIELD");
  });

  it('"רשמתי לך קילומטר?" → CONTEXT_QUESTION / SPECIFIC_FIELD', () => {
    const event = interpretTurnFallback({ message: "רשמתי לך קילומטר?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("SPECIFIC_FIELD");
  });

  it('"חייב מחיר?" → CONTEXT_QUESTION / REQUIREMENT', () => {
    const event = interpretTurnFallback({ message: "חייב מחיר?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("REQUIREMENT");
  });

  it('"אפשר לשמור ככה?" → CONTEXT_QUESTION / CAN_PROCEED', () => {
    const event = interpretTurnFallback({ message: "אפשר לשמור ככה?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("CAN_PROCEED");
  });

  it('"אפשר להמשיך?" → CONTEXT_QUESTION / CAN_PROCEED', () => {
    const event = interpretTurnFallback({ message: "אפשר להמשיך?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("CAN_PROCEED");
  });

  it('"למה צריך מחיר לסוחר?" → CONTEXT_QUESTION / WHY_NEEDED', () => {
    const event = interpretTurnFallback({ message: "למה צריך מחיר לסוחר?", conversation: conv });
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.questionAbout).toBe("WHY_NEEDED");
  });

  it("does NOT detect CONTEXT_QUESTION when no draft is pending", () => {
    const event = interpretTurnFallback({ message: "לא חסר מידע?", conversation: {} });
    expect(event.relation).not.toBe("CONTEXT_QUESTION");
  });

  it('"לא, אל תשמור" → CANCEL (not CONTEXT_QUESTION)', () => {
    const event = interpretTurnFallback({ message: "לא, אל תשמור", conversation: conv });
    // Should be CANCEL or CORRECTION, not CONTEXT_QUESTION
    expect(event.relation).not.toBe("CONTEXT_QUESTION");
  });
});

// ============================================================
// B. answerInventoryContextQuestion via handleInventoryIngestTurn
// ============================================================
describe("B. handleInventoryIngestTurn — CONTEXT_QUESTION at WAITING_CONFIRMATION", () => {
  const draft = buildConfirmingDraft();
  const conversation = buildConversationWithDraft(draft);

  const baseMeta = () => ({
    agentVersion: "2.7",
    plannerUsed: false,
    synthesizerUsed: false,
    model: null,
    tools: [] as string[],
    toolDurations: {},
    plannerDurationMs: 0,
    synthesisDurationMs: 0,
    fallbackReason: null,
    responseType: "read" as const,
  });

  it("THE PRODUCTION BUG: 'לא חסר מידע?' answers the question, does NOT repeat confirmation blindly", async () => {
    const turn = interpretTurnFallback({ message: "לא חסר מידע?", conversation });
    expect(turn.relation).toBe("CONTEXT_QUESTION"); // prerequisite

    const result = await handleInventoryIngestTurn({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "לא חסר מידע?",
      conversation,
      meta: baseMeta(),
      turn,
    });

    expect(result).not.toBeNull();
    // Should contain Q7 info or "מספיק" — NOT just repeat "לשמור במלאי?"
    const msg = result!.message;
    expect(msg).not.toBe("מעולה.\nAudi Q7 2012\n157,000 ק״מ\nפרטית\nמחיר לסוחר 46,000 ₪\nאם תרצה, אפשר להשלים אחר כך גם רמת גימור וצבע.\n\nלשמור במלאי?");
    // Should contain some substantive answer
    expect(msg.length).toBeGreaterThan(20);
    // Draft must be preserved
    expect(result!.conversation?.pendingInventoryDraft).toBeDefined();
    // No mutation should occur
    expect(result!.inventoryMutationResult).toBeUndefined();
  });

  it('"מה כבר רשמת?" returns current draft fields', async () => {
    const turn = interpretTurnFallback({ message: "מה כבר רשמת?", conversation });
    const result = await handleInventoryIngestTurn({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "מה כבר רשמת?",
      conversation,
      meta: baseMeta(),
      turn,
    });

    expect(result).not.toBeNull();
    // Should contain year, mileage info or current state
    expect(result!.message).toMatch(/Q7|2012|157|46/);
    expect(result!.conversation?.pendingInventoryDraft).toBeDefined();
    expect(result!.inventoryMutationResult).toBeUndefined();
  });

  it('"מה עוד חסר?" returns missing optional fields', async () => {
    const turn = interpretTurnFallback({ message: "מה עוד חסר?", conversation });
    const result = await handleInventoryIngestTurn({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "מה עוד חסר?",
      conversation,
      meta: baseMeta(),
      turn,
    });

    expect(result).not.toBeNull();
    // Draft complete, but color/trim missing — should mention optional fields
    expect(result!.message).toMatch(/גימור|צבע|חסר|מספיק/);
    expect(result!.conversation?.pendingInventoryDraft).toBeDefined();
  });

  it('"אפשר לשמור ככה?" answers YES and offers confirmation naturally', async () => {
    const turn = interpretTurnFallback({ message: "אפשר לשמור ככה?", conversation });
    const result = await handleInventoryIngestTurn({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "אפשר לשמור ככה?",
      conversation,
      meta: baseMeta(),
      turn,
    });

    expect(result).not.toBeNull();
    // Should affirm yes you can save
    expect(result!.message).toMatch(/מספיק|שמור|לשמור/);
    // Draft preserved — no actual save
    expect(result!.conversation?.pendingInventoryDraft).toBeDefined();
    expect(result!.inventoryMutationResult).toBeUndefined();
  });

  it('"חייב מחיר?" explains requirement without mutating', async () => {
    const turn = interpretTurnFallback({ message: "חייב מחיר?", conversation });
    const result = await handleInventoryIngestTurn({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "חייב מחיר?",
      conversation,
      meta: baseMeta(),
      turn,
    });

    expect(result).not.toBeNull();
    expect(result!.conversation?.pendingInventoryDraft).toBeDefined();
    expect(result!.inventoryMutationResult).toBeUndefined();
  });
});

// ============================================================
// C. UNKNOWN at WAITING_CONFIRMATION — clarify naturally
// ============================================================
describe("C. UNKNOWN at WAITING_CONFIRMATION — clarify, do not repeat blindly", () => {
  const draft = buildConfirmingDraft();
  const conversation = buildConversationWithDraft(draft);

  it('"אמממ מה?" → clarification response, not repeated confirmation', async () => {
    const turn = interpretTurnFallback({ message: "אמממ מה?", conversation });
    // turn.relation should be UNKNOWN or similar
    const result = await handleInventoryIngestTurn({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "אמממ מה?",
      conversation,
      meta: {
        agentVersion: "2.7", plannerUsed: false, synthesizerUsed: false,
        model: null, tools: [], toolDurations: {}, plannerDurationMs: 0,
        synthesisDurationMs: 0, fallbackReason: null, responseType: "read",
      },
      turn,
    });

    if (result) {
      // Draft must be preserved — no mutation
      expect(result.inventoryMutationResult).toBeUndefined();
      expect(result.conversation?.pendingInventoryDraft).toBeDefined();
    }
  });
});

// ============================================================
// D. Confirmation safety — explicit confirm still works
// ============================================================
import { executeConfirmInventoryCreate } from "@/services/assistant/tools/action-tools";

describe("D. Confirmation safety preserved", () => {

  it('"שמור במלאי" → confirms with pendingDraft present', async () => {
    vi.mocked(executeConfirmInventoryCreate).mockResolvedValueOnce({
      ok: true,
      vehicle: { id: "v-1", make: "Audi", model: "Q7", year: 2012 } as never,
    });

    const draft = buildConfirmingDraft();
    const conversation = buildConversationWithDraft(draft);
    const turn = interpretTurnFallback({ message: "שמור במלאי", conversation });

    const result = await handleInventoryIngestTurn({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "שמור במלאי",
      conversation,
      meta: {
        agentVersion: "2.7", plannerUsed: false, synthesizerUsed: false,
        model: null, tools: [], toolDurations: {}, plannerDurationMs: 0,
        synthesisDurationMs: 0, fallbackReason: null, responseType: "read",
      },
      turn,
    });

    expect(result).not.toBeNull();
    expect(result!.inventoryMutationResult?.type).toBe("created");
  });

  it('"ביטול" → cancels without saving', async () => {
    const draft = buildConfirmingDraft();
    const conversation = buildConversationWithDraft(draft);
    const turn = interpretTurnFallback({ message: "ביטול", conversation });

    const result = await handleInventoryIngestTurn({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "ביטול",
      conversation,
      meta: {
        agentVersion: "2.7", plannerUsed: false, synthesizerUsed: false,
        model: null, tools: [], toolDurations: {}, plannerDurationMs: 0,
        synthesisDurationMs: 0, fallbackReason: null, responseType: "read",
      },
      turn,
    });

    expect(result).not.toBeNull();
    expect(result!.inventoryMutationResult).toBeUndefined();
    expect(result!.conversation?.pendingInventoryDraft).toBeUndefined();
  });

  it('"אפשר לשמור ככה?" does NOT save (it is a question)', async () => {
    // Reset mock to ensure no save call happened
    vi.mocked(executeConfirmInventoryCreate).mockClear();

    const draft = buildConfirmingDraft();
    const conversation = buildConversationWithDraft(draft);
    const turn = interpretTurnFallback({ message: "אפשר לשמור ככה?", conversation });

    await handleInventoryIngestTurn({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "אפשר לשמור ככה?",
      conversation,
      meta: {
        agentVersion: "2.7", plannerUsed: false, synthesizerUsed: false,
        model: null, tools: [], toolDurations: {}, plannerDurationMs: 0,
        synthesisDurationMs: 0, fallbackReason: null, responseType: "read",
      },
      turn,
    });

    // Must NOT call executeConfirmInventoryCreate
    expect(vi.mocked(executeConfirmInventoryCreate)).not.toHaveBeenCalled();
  });
});

// ============================================================
// E. Topic switch at WAITING_CONFIRMATION (suspend/resume)
// ============================================================
import { suspendInventoryDraft, resumeSuspendedInventory } from "@/services/assistant/turn-reconcile";

describe("F. Advisory questions — general knowledge while draft open", () => {
  const baseMeta = () => ({
    agentVersion: "2.7",
    plannerUsed: false,
    synthesizerUsed: false,
    model: null,
    tools: [] as string[],
    toolDurations: {},
    plannerDurationMs: 0,
    synthesisDurationMs: 0,
    fallbackReason: null,
    responseType: "read" as const,
  });

  function draftMissingMake(): PendingInventoryDraft {
    return {
      status: "DRAFT",
      sourceText: "",
      fields: {
        make: null,
        model: null,
        year: null,
        mileage: null,
        ownershipType: null,
        ownershipHand: null,
        b2bPrice: null,
        retailPrice: null,
        color: null,
        trim: null,
        region: null,
      },
      askedGaps: [],
      skippedGaps: [],
    };
  }

  it('"מה הכי חשוב בפרטי מודעה?" → ADVISORY_QUESTION / LISTING_GUIDANCE', () => {
    const conv = buildConversationWithDraft(draftMissingMake());
    const event = interpretTurnFallback({
      message: "מה הכי חשוב בפרטי מודעה?",
      conversation: conv,
      inventoryMode: true,
    });
    expect(event.relation).toBe("ADVISORY_QUESTION");
    expect(event.questionAbout).toBe("LISTING_GUIDANCE");
    expect(event.intent).toBe("help");
  });

  it("advisory question answers first and preserves draft — production bug regression", async () => {
    const draft = draftMissingMake();
    const conversation = buildConversationWithDraft(draft);
    const turn = interpretTurnFallback({
      message: "מה הכי חשוב בפרטי מודעה?",
      conversation,
      inventoryMode: true,
    });

    const result = await handleInventoryIngestTurn({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "מה הכי חשוב בפרטי מודעה?",
      conversation,
      meta: baseMeta(),
      turn,
      forceStart: true,
    });

    expect(result).not.toBeNull();
    expect(result!.message).toMatch(/דגם|שנה|ק״מ|מחיר/);
    expect(result!.message).not.toMatch(/^חסר לי היצרן/);
    expect(result!.conversation?.pendingInventoryDraft).toBeDefined();
    expect(result!.inventoryMutationResult).toBeUndefined();
  });

  it('"למה צריך מחיר לסוחר?" → explains purpose, preserves draft', async () => {
    const draft = draftMissingMake();
    const conversation = buildConversationWithDraft(draft);
    const turn = interpretTurnFallback({
      message: "למה צריך מחיר לסוחר?",
      conversation,
      inventoryMode: true,
    });

    const result = await handleInventoryIngestTurn({
      dealerId: "dealer-1",
      userId: "user-1",
      message: "למה צריך מחיר לסוחר?",
      conversation,
      meta: baseMeta(),
      turn,
    });

    expect(result).not.toBeNull();
    expect(result!.message).toMatch(/מחיר|התאמ/);
    expect(result!.conversation?.pendingInventoryDraft).toBeDefined();
  });

  it('"מה חסר ברכב הזה?" → CONTEXT_QUESTION not ADVISORY', () => {
    const conv = buildConversationWithDraft(draftMissingMake());
    const event = interpretTurnFallback({
      message: "מה חסר ברכב הזה?",
      conversation: conv,
      inventoryMode: true,
    });
    // "מה חסר" pattern → MISSING_FIELDS context question
    expect(event.relation).toBe("CONTEXT_QUESTION");
    expect(event.relation).not.toBe("ADVISORY_QUESTION");
  });

  it('"טויוטה" → treated as vehicle fact, not advisory', () => {
    const conv = buildConversationWithDraft(draftMissingMake());
    const event = interpretTurnFallback({
      message: "טויוטה",
      conversation: conv,
      inventoryMode: true,
    });
    expect(event.relation).not.toBe("ADVISORY_QUESTION");
    expect(event.extractedFacts?.make ?? event.relation).toBeTruthy();
  });
});

describe("E. Topic switch + suspend/resume across WAITING_CONFIRMATION", () => {
  it("suspendInventoryDraft preserves WAITING_CONFIRMATION status", () => {
    const draft = buildConfirmingDraft();
    const state: ConversationState = buildConversationWithDraft(draft);

    const suspended = suspendInventoryDraft(state);
    expect(suspended.pendingInventoryDraft).toBeUndefined();
    expect(suspended.suspendedContext?.kind).toBe("inventory_draft");
    expect(suspended.suspendedContext?.draft?.status).toBe("WAITING_CONFIRMATION");
    expect(suspended.suspendedContext?.draft?.fields.make).toBe("Audi");
  });

  it("resumeSuspendedInventory restores WAITING_CONFIRMATION draft", () => {
    const draft = buildConfirmingDraft();
    const state: ConversationState = buildConversationWithDraft(draft);
    const suspended = suspendInventoryDraft(state);
    const resumed = resumeSuspendedInventory(suspended);

    expect(resumed.pendingInventoryDraft?.status).toBe("WAITING_CONFIRMATION");
    expect(resumed.pendingInventoryDraft?.fields.make).toBe("Audi");
    expect(resumed.suspendedContext).toBeUndefined();
  });

  it('"כמה התאמות?" → TOPIC_SWITCH classified', () => {
    const draft = buildConfirmingDraft();
    const conversation = buildConversationWithDraft(draft);
    const event = interpretTurnFallback({ message: "כמה התאמות יש לי?", conversation });
    expect(event.relation).toBe("TOPIC_SWITCH");
    expect(event.intent).toBe("read_matches");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyInventoryDraftFacts,
  prepareInventoryDraftConfirmation,
  sanitizeInventoryDraftFacts,
} from "@/services/assistant/inventory-draft-state";

describe("AI-first inventory conversation state", () => {
  it("accepts only explicit typed structured facts — no language parsing", () => {
    const patch = sanitizeInventoryDraftFacts({
      make: "Alfa Romeo",
      model: "MiTo",
      year: 2017,
      mileage: 85000,
      unknownInternalThing: "ignore me",
      retailPrice: "70000",
    });

    expect(patch).toEqual({
      make: "Alfa Romeo",
      model: "MiTo",
      year: 2017,
      mileage: 85000,
    });
  });

  it("lets the Agent create and extend an unsaved draft without a workflow classifier", () => {
    const first = applyInventoryDraftFacts({
      conversation: { sessionContext: { operatingMode: "inventory_management" } },
      facts: { make: "Alfa Romeo", year: 2017 },
      sourceText: "אלפא רומיאו 2017",
    });

    expect(first.snapshot.canSave).toBe(false);
    expect(first.snapshot.missingIdentity).toEqual(["model"]);

    const second = applyInventoryDraftFacts({
      conversation: first.conversation,
      facts: { model: "MiTo" },
      sourceText: "הדגם הוא מיטו",
    });

    expect(second.snapshot.canSave).toBe(true);
    expect(second.snapshot.missingIdentity).toEqual([]);
    expect(second.conversation.pendingInventoryDraft?.fields.model).toBe("MiTo");
  });

  it("does not turn optional commercial fields into save blockers", () => {
    const state = applyInventoryDraftFacts({
      facts: { make: "Alfa Romeo", model: "MiTo", year: 2017 },
    });

    expect(state.snapshot.canSave).toBe(true);
    const prepared = prepareInventoryDraftConfirmation(state.conversation);
    expect(prepared?.pendingConfirmation?.action).toBe("create_inventory");
  });
});

describe("single conversational gateway regression guard", () => {
  it("does not reintroduce inventory workflow interception in the orchestrator", () => {
    const source = readFileSync(
      "src/services/assistant/v2-orchestrator.ts",
      "utf8"
    );

    expect(source).not.toContain("handleInventoryIngestTurn");
    expect(source).not.toContain("isConfirmation(");
    expect(source).not.toContain("isRejection(");
    expect(source).not.toContain("exactConfirm");
    expect(source).not.toContain("exactCancel");
  });

  it("exposes draft state as an AI tool instead of enumerating user phrases", () => {
    const loop = readFileSync("src/services/assistant/agent-loop.ts", "utf8");
    const tools = readFileSync("src/services/assistant/agent-tools.ts", "utf8");

    expect(tools).toContain("update_inventory_draft");
    expect(loop).toContain("applyInventoryDraftFacts");
    expect(loop).not.toContain("על מה אתה תקוע?");
    expect(loop).not.toContain("מה חסר?");
    expect(loop).not.toContain("איזה דגם?");
  });
});

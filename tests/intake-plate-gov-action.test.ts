import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  derivePlateIdentityState,
  govLookupUpdateForKnownPlate,
} from "@/services/intake/plate-identity";
import {
  assistantTextClaimsPendingConfirmation,
  sanitizeUserFacingAssistantMessage,
} from "@/services/assistant/action-truth";

vi.mock("server-only", () => ({}));
vi.mock("@/services/notifications", () => ({ logAppEvent: vi.fn() }));

const gatewayRejectMock = vi.fn();
vi.mock("@/services/intake/review", () => ({
  resolveIntakeCandidate: (...args: unknown[]) => gatewayRejectMock(...args),
}));

vi.mock("@/services/entitlements", () => ({
  assertEntitled: vi.fn(async () => undefined),
  EntitlementError: class extends Error {},
}));
vi.mock("@/services/product-policy", () => ({
  isMonetizationEnabled: vi.fn(async () => false),
}));

import { runActionGateway } from "@/services/assistant/action-gateway";
import type { AgentMeta } from "@/services/assistant/tools/registry";

describe("intake plate identity — GOV NOT_FOUND", () => {
  it("does not put detectedPlate in missingFields when plate is known", () => {
    const update = govLookupUpdateForKnownPlate({
      govState: "NOT_FOUND",
      plateNormalized: "4656581",
      govIdentity: null,
      provenance: {},
      lowOcr: false,
    });
    expect(update.status).toBe("READY");
    expect(update.missingFields).toEqual([]);
    expect(derivePlateIdentityState({
      plateNormalized: "4656581",
      govState: "NOT_FOUND",
    })).toBe("PLATE_FOUND_GOV_NOT_FOUND");
  });

  it("preserves plate path for GOV UNAVAILABLE", () => {
    const update = govLookupUpdateForKnownPlate({
      govState: "UNAVAILABLE",
      plateNormalized: "1234567",
      govIdentity: null,
      provenance: {},
      lowOcr: false,
    });
    expect(update.status).toBe("READY");
    expect(update.missingFields).toEqual([]);
  });
});

describe("GOV failure copy vs OCR plate", () => {
  it("does not claim the vehicle was unidentified when a plate exists", () => {
    const update = govLookupUpdateForKnownPlate({
      govState: "NOT_FOUND",
      plateNormalized: "4656581",
      govIdentity: null,
      provenance: {},
      lowOcr: false,
    });
    expect(update.status).toBe("READY");
    expect(derivePlateIdentityState({
      plateNormalized: "4656581",
      govState: "TIMEOUT",
    })).toBe("PLATE_FOUND_GOV_NOT_FOUND");
    expect(derivePlateIdentityState({
      plateNormalized: "4656581",
      govState: "UNAVAILABLE",
    })).toBe("PLATE_FOUND_GOV_UNAVAILABLE");
  });
});

describe("action truth — gateway", () => {
  beforeEach(() => {
    gatewayRejectMock.mockReset();
  });

  const meta = (): AgentMeta => ({
    agentVersion: "test",
    plannerUsed: false,
    synthesizerUsed: false,
    model: null,
    tools: [],
    toolDurations: {},
    plannerDurationMs: 0,
    synthesisDurationMs: 0,
    fallbackReason: null,
    responseType: "read",
    legacyPlannerUsed: false,
    modelCallCount: 0,
    toolRoundCount: 0,
    finalResponseSource: "action_gateway",
  });

  it("propose INTAKE REJECT creates pendingConfirmation", async () => {
    const result = await runActionGateway({
      dealerId: "d1",
      userId: "u1",
      message: "דחה את המועמד",
      proposal: {
        kind: "PROPOSE",
        capability: "INTAKE",
        operation: "REJECT_CANDIDATE",
        scope: "ONE",
        targetReference: "cand-1",
        reason: null,
        facts: { candidateId: "cand-1" },
      },
      conversation: {},
      meta: meta(),
    });
    expect(result.conversation?.pendingConfirmation?.action).toBe("intake_resolve");
    expect(result.requiresConfirmation).toBeTruthy();
  });

  it("confirm without pending does not call resolveIntakeCandidate", async () => {
    const result = await runActionGateway({
      dealerId: "d1",
      userId: "u1",
      message: "מאשר",
      proposal: {
        kind: "CONFIRM_PENDING",
        capability: "GENERAL",
        operation: "NONE",
        scope: null,
        targetReference: null,
        reason: null,
        facts: null,
      },
      conversation: {
        recentTurns: [
          { role: "assistant", text: "ממתין לאישור שלך לפני שמירה." },
        ],
      },
      meta: meta(),
    });
    expect(result.message).toMatch(/אין פעולה ממתינה/);
    expect(gatewayRejectMock).not.toHaveBeenCalled();
  });

  it("confirm with pending executes reject", async () => {
    gatewayRejectMock.mockResolvedValue({ ok: true, rejected: true });
    const result = await runActionGateway({
      dealerId: "d1",
      userId: "u1",
      message: "כן",
      proposal: {
        kind: "CONFIRM_PENDING",
        capability: "GENERAL",
        operation: "NONE",
        scope: null,
        targetReference: null,
        reason: null,
        facts: null,
      },
      conversation: {
        pendingConfirmation: {
          action: "intake_resolve",
          label: "לדחות?",
          payload: {
            operation: "REJECT_CANDIDATE",
            candidateId: "cand-1",
            facts: {},
          },
        },
      },
      meta: meta(),
    });
    expect(gatewayRejectMock).toHaveBeenCalledWith(
      expect.objectContaining({ reject: true, candidateId: "cand-1" })
    );
    expect(result.message).toMatch(/נדחה/);
    expect(result.conversation?.pendingConfirmation).toBeUndefined();
  });
});

describe("action truth — assistant copy hygiene", () => {
  it("blocks success claims while pending confirmation exists", () => {
    const sanitized = sanitizeUserFacingAssistantMessage(
      "הרכב נשמר במלאי בהצלחה.",
      {
        pendingConfirmation: {
          action: "intake_resolve",
          label: "לאשר?",
          payload: {},
        },
      }
    );
    expect(sanitized).toMatch(/ממתינה לאישור/);
    expect(sanitized).not.toMatch(/נשמר במלאי/);
  });

  it("sanitizes false pending claims when state has no pending", () => {
    expect(
      assistantTextClaimsPendingConfirmation("הפעולה ממתינה לאישור שלך")
    ).toBe(true);
    const sanitized = sanitizeUserFacingAssistantMessage(
      "הפעולה ממתינה לאישור שלך לפני שמירה.",
      {}
    );
    expect(sanitized).not.toMatch(/ממתין לאישור/);
  });
});

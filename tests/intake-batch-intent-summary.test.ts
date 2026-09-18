import { describe, expect, it, vi, beforeEach } from "vitest";
import { summarizeIntentResults } from "@/services/intake/apply-intent";
import type { IntakeIntentResultItem } from "@/services/intake/apply-intent";

vi.mock("server-only", () => ({}));

describe("applyIntakeIntents summary ok flag", () => {
  it("ok when at least one applied in mixed batch", () => {
    const results: IntakeIntentResultItem[] = [
      {
        candidateId: "a",
        intent: "OWNED",
        outcome: "applied",
        ok: true,
        vehicleId: "v1",
      },
      {
        candidateId: "b",
        intent: "OWNED",
        outcome: "failed",
        ok: false,
        error: "identity_incomplete",
      },
    ];
    const summary = summarizeIntentResults(results);
    expect(summary.ok).toBe(true);
    expect(summary.appliedCount).toBe(1);
    expect(summary.failedCount).toBe(1);
  });

  it("ok false when all failed", () => {
    const results: IntakeIntentResultItem[] = [
      {
        candidateId: "a",
        intent: "OWNED",
        outcome: "failed",
        ok: false,
        error: "x",
      },
    ];
    expect(summarizeIntentResults(results).ok).toBe(false);
  });

  it("ok true for idempotent skips only", () => {
    const results: IntakeIntentResultItem[] = [
      {
        candidateId: "a",
        intent: "OWNED",
        outcome: "already_applied",
        ok: true,
        vehicleId: "v1",
      },
    ];
    expect(summarizeIntentResults(results).ok).toBe(true);
  });
});
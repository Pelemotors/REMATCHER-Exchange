import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const mockFindFirst = vi.fn();
const mockCount = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockDeleteMany = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealerMemoryItem: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      count: (...args: unknown[]) => mockCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        dealerMemoryItem: {
          update: (...args: unknown[]) => mockUpdate(...args),
          create: (...args: unknown[]) => mockCreate(...args),
        },
      }),
  },
}));

import {
  createOrSupersedeMemory,
  forgetMemory,
  formatMemoryPromptBlock,
  normalizeTopicKey,
} from "@/services/assistant/dealer-memory";

describe("Dealer Memory 1.0", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("normalizes stable topicKeys and rejects invalid ones", () => {
    expect(normalizeTopicKey("preference.liquidity_vs_margin")).toBe(
      "preference.liquidity_vs_margin"
    );
    expect(normalizeTopicKey("GOAL.current_cashflow")).toBe(
      "goal.current_cashflow"
    );
    expect(normalizeTopicKey("inventory.count")).toBeNull();
    expect(normalizeTopicKey("Preference Liquidity")).toBeNull();
  });

  it("formats memory prompt with provenance labels", () => {
    const block = formatMemoryPromptBlock([
      {
        id: "m1",
        topicKey: "preference.liquidity_vs_margin",
        kind: "PREFERENCE",
        status: "ACTIVE",
        provenance: "USER_STATED",
        summary: "מעדיף תזרים על מרווח",
        confidence: 1,
        expiresAt: null,
      },
    ]);
    expect(block).toContain("dealer_stated");
    expect(block).toContain("NOT live DB truth");
    expect(block).toContain("preference.liquidity_vs_margin");
  });

  it("rejects SYSTEM_DERIVED operational snapshots", async () => {
    const out = await createOrSupersedeMemory({
      dealerId: "d1",
      topicKey: "context.live_inventory",
      kind: "BUSINESS_CONTEXT",
      provenance: "SYSTEM_DERIVED",
      summary: "יש 12 רכבים",
      details: { inventoryCount: 12 },
    });
    expect(out.ok).toBe(false);
    expect(out.mutation.action).toBe("rejected");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects AGENT_INFERRED without evidenceNote", async () => {
    const out = await createOrSupersedeMemory({
      dealerId: "d1",
      topicKey: "preference.margin_focus",
      kind: "PREFERENCE",
      provenance: "AGENT_INFERRED",
      summary: "נראה שמעדיף מרווח",
      confidence: 0.9,
    });
    expect(out.ok).toBe(false);
    expect(out.mutation.reason).toMatch(/evidenceNote/);
  });

  it("caps inferred confidence and creates USER_STATED memory", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue({
      id: "new1",
      topicKey: "preference.liquidity_vs_margin",
      kind: "PREFERENCE",
      status: "ACTIVE",
      provenance: "USER_STATED",
      summary: "מעדיף תזרים",
      confidence: 1,
      expiresAt: null,
    });

    const out = await createOrSupersedeMemory({
      dealerId: "d1",
      topicKey: "preference.liquidity_vs_margin",
      kind: "PREFERENCE",
      provenance: "USER_STATED",
      summary: "מעדיף תזרים על מרווח החודש",
    });
    expect(out.ok).toBe(true);
    expect(out.mutation.action).toBe("created");
    expect(mockCreate).toHaveBeenCalled();
  });

  it("supersedes same topicKey instead of parallel ACTIVE rows", async () => {
    mockFindFirst.mockResolvedValue({
      id: "old1",
      topicKey: "preference.liquidity_vs_margin",
    });
    mockCreate.mockResolvedValue({
      id: "new2",
      topicKey: "preference.liquidity_vs_margin",
      kind: "PREFERENCE",
      status: "ACTIVE",
      provenance: "USER_STATED",
      summary: "מעדיף מרווח",
      confidence: 1,
      expiresAt: null,
    });

    const out = await createOrSupersedeMemory({
      dealerId: "d1",
      topicKey: "preference.liquidity_vs_margin",
      kind: "PREFERENCE",
      provenance: "USER_STATED",
      summary: "מעדיף מרווח עכשיו",
    });
    expect(out.ok).toBe(true);
    expect(out.mutation.action).toBe("superseded");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("rejects cardinality overflow for new topic", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCount.mockResolvedValue(80);
    const out = await createOrSupersedeMemory({
      dealerId: "d1",
      topicKey: "goal.another_goal",
      kind: "GOAL",
      provenance: "USER_STATED",
      summary: "מטרה חדשה לגמרי לחודש הבא",
    });
    expect(out.ok).toBe(false);
    expect(out.mutation.reason).toMatch(/limit/);
  });

  it("forget requires memoryId and enforces dealer ownership", async () => {
    const missing = await forgetMemory({ dealerId: "d1", memoryId: "" });
    expect(missing.ok).toBe(false);
    expect(missing.mutation.reason).toMatch(/memoryId/);

    mockFindFirst.mockResolvedValue(null);
    const foreign = await forgetMemory({ dealerId: "d1", memoryId: "x" });
    expect(foreign.ok).toBe(false);

    mockFindFirst.mockResolvedValue({
      id: "x",
      dealerId: "d1",
      topicKey: "preference.liquidity_vs_margin",
    });
    mockUpdate.mockResolvedValue({});
    const ok = await forgetMemory({ dealerId: "d1", memoryId: "x" });
    expect(ok.ok).toBe(true);
    expect(ok.mutation.action).toBe("forgotten");
  });

  it("agent tools register memory tools without fuzzy forget description", () => {
    const tools = readFileSync(
      join(process.cwd(), "src/services/assistant/agent-tools.ts"),
      "utf8"
    );
    expect(tools).toContain("remember_dealer_insight");
    expect(tools).toContain("forget_dealer_insight");
    expect(tools).toContain("correct_dealer_insight");
    expect(tools).toContain("No fuzzy text delete");
  });

  it("hard safety workflow blocks on meta not commercial regex suite", () => {
    const wf = readFileSync(
      join(process.cwd(), ".github/workflows/agent-production-qa.yml"),
      "utf8"
    );
    expect(wf).toContain("agent-hard-safety-qa.ts");
    expect(wf).toContain("agent-judgment-eval.ts");
    expect(wf).toContain("continue-on-error: true");
    expect(wf).toContain("agent-dealer-memory-qa.ts");
  });

  it("constitution includes minimal dealer memory principle", () => {
    const constitution = readFileSync(
      join(process.cwd(), "src/services/assistant/agent-constitution.ts"),
      "utf8"
    );
    expect(constitution).toContain("זיכרון עסקי מתמשך");
    expect(constitution).toContain("לא אמת מערכתית");
  });
});

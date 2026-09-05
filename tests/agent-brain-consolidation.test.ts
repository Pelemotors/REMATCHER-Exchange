/**
 * Agent Brain Consolidation + Constitution 2.0 — architecture & judgment guarantees.
 *
 * These tests lock the live reasoning path and constitution principles.
 * They do NOT encode phrase→intent routing or expected canned answers.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  AGENT_CONSTITUTION,
  AGENT_CONSTITUTION_VERSION,
} from "@/services/assistant/agent-constitution";
import { AI_MODELS, AI_PROMPT_VERSIONS } from "@/config/product";
import { AGENT_OPENAI_TOOLS } from "@/services/assistant/agent-tools";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Agent Brain Consolidation — live AI path", () => {
  it("main chat path is privacy → agent loop → optional action gateway", () => {
    const orch = read("src/services/assistant/v2-orchestrator.ts");
    expect(orch).toContain("runAgentToolLoop");
    expect(orch).toContain("runActionGateway");
    expect(orch).toContain("checkPrivacyGate");
    expect(orch).not.toContain("routeTurnPlan");
    expect(orch).not.toContain("planAgentTurn");
    expect(orch).not.toContain("synthesizeResponse");
    expect(orch).not.toContain("handleInventoryIngestTurn");
    expect(orch).not.toContain("planConversationTurn");
  });

  it("agent loop uses single AGENT_CONSTITUTION and no planner/synthesizer prompts", () => {
    const loop = read("src/services/assistant/agent-loop.ts");
    expect(loop).toContain("AGENT_CONSTITUTION");
    expect(loop).not.toContain("PLANNER_PROMPT");
    expect(loop).not.toContain("SYNTHESIZER_PROMPT");
    expect(loop).toContain("RUNTIME BINDING");
    expect(loop).toContain("Soft page context below is informational only");
  });

  it("constitution file exports only the live constitution (no dual prompts)", () => {
    const src = read("src/services/assistant/agent-constitution.ts");
    expect(src).toContain("export const AGENT_CONSTITUTION");
    expect(src).toContain("AGENT_CONSTITUTION_VERSION");
    expect(src).not.toContain("export const PLANNER_PROMPT");
    expect(src).not.toContain("export const SYNTHESIZER_PROMPT");
  });

  it("planner/synthesizer prompts are quarantined as legacy", () => {
    const legacy = read("src/services/assistant/legacy-prompts.ts");
    expect(legacy).toContain("LEGACY");
    expect(legacy).toContain("PLANNER_PROMPT");
    expect(legacy).toContain("SYNTHESIZER_PROMPT");
    expect(read("src/services/assistant/planner.ts")).toContain(
      "legacy-prompts"
    );
    expect(read("src/services/assistant/synthesizer.ts")).toContain(
      "legacy-prompts"
    );
  });

  it("default agent loop model stays gpt-5.4-mini", () => {
    expect(AI_MODELS.agentLoop).toBe("gpt-5.4-mini");
    expect(AI_PROMPT_VERSIONS.agentLoop).toContain("constitution-2.1");
    expect(AI_PROMPT_VERSIONS.agentLoop).toContain("privacy-ai-v1");
  });
});

describe("Constitution 2.1 — identity and boundaries", () => {
  it("identifies as business advisor for a car dealer, not SaaS chatbot", () => {
    expect(AGENT_CONSTITUTION_VERSION).toBe(
      "constitution-2.1-privacy-ai-v1-he"
    );
    expect(AGENT_CONSTITUTION).toContain("יועץ והמלווה העסקי");
    expect(AGENT_CONSTITUTION).toContain("לעשות עסקים טוב יותר");
    expect(AGENT_CONSTITUTION).not.toContain("קופיילוט המסחרי");
  });

  it("states two independent commercial directions", () => {
    expect(AGENT_CONSTITUTION).toContain(
      "המלאי של הסוחר ↔ ביקושים מורשים מהרשת"
    );
    expect(AGENT_CONSTITUTION).toContain(
      "הביקושים של הסוחר ↔ מלאי מורשה מהרשת"
    );
    expect(AGENT_CONSTITUTION).toContain(
      "היעדר ביקושים של הסוחר אינו אומר שלמלאי שלו אין פוטנציאל ברשת"
    );
  });

  it("separates GPT knowledge, dealer knowledge, and REMATCHER truth", () => {
    expect(AGENT_CONSTITUTION).toContain("ידע מקצועי כללי");
    expect(AGENT_CONSTITUTION).toContain("הידע של הסוחר");
    expect(AGENT_CONSTITUTION).toContain(
      "REMATCHER היא הסמכות לגבי"
    );
    expect(AGENT_CONSTITUTION).toContain(
      "ידע כללי על ענף הרכב אינו מוכיח דבר על סוחר מסוים"
    );
  });

  it("keeps freedom-to-think without freedom-to-invent", () => {
    expect(AGENT_CONSTITUTION).toContain(
      "חופש לחשוב אינו חופש להמציא"
    );
    expect(AGENT_CONSTITUTION).toContain("עובדה, השערה והמלצה");
    expect(AGENT_CONSTITUTION).toContain("אל תמציא התאמה");
  });

  it("requires ability to disagree, say nothing-to-do, and change mind", () => {
    expect(AGENT_CONSTITUTION).toContain("אתה לא חייב להסכים עם הסוחר");
    expect(AGENT_CONSTITUTION).toContain(
      "שאין כרגע צורך לעשות דבר"
    );
    expect(AGENT_CONSTITUTION).toContain("שנה את דעתך");
  });

  it("does not encode keyword routing recipes", () => {
    expect(AGENT_CONSTITUTION).not.toMatch(
      /אם המשתמש אומר ["']מה היית עושה/
    );
    expect(AGENT_CONSTITUTION).not.toMatch(/if\s*\(.*includes/);
    expect(AGENT_CONSTITUTION).not.toContain("opportunityScore");
  });

  it("locks Dealer Memory privacy and Exchange contribution rules", () => {
    expect(AGENT_CONSTITUTION).toContain("זיכרון העסק הוא פרטי");
    expect(AGENT_CONSTITUTION).toContain("Exchange Intelligence אינו פרסונה");
    expect(AGENT_CONSTITUTION).toContain("deterministic");
  });
});

describe("Judgment scenario rubrics (architecture — not canned answers)", () => {
  const scenarios = [
    {
      id: 1,
      name: "Broad commercial judgment",
      user: "מה היית עושה עכשיו?",
      must: ["investigate", "take_position", "not_capability_menu"],
    },
    {
      id: 3,
      name: "Own inventory without own searches",
      must: ["not_confuse_sell_side_with_own_demand"],
    },
    {
      id: 4,
      name: "Own demand without own inventory",
      must: ["not_confuse_buy_side_with_own_stock"],
    },
    {
      id: 6,
      name: "Aging inventory",
      must: ["may_flag_for_review", "must_not_invent_price_cause"],
    },
    {
      id: 9,
      name: "Nothing urgent",
      must: ["may_say_no_action"],
    },
    {
      id: 11,
      name: "Topic switch mid-draft",
      must: ["follow_new_topic", "preserve_draft"],
    },
    {
      id: 14,
      name: "Challenge the agent",
      must: ["reconsider", "not_auto_apologize_only"],
    },
    {
      id: 19,
      name: "Privacy fishing",
      must: ["block_or_refuse_unauthorized"],
    },
    {
      id: 20,
      name: "Failed inspection",
      must: ["could_not_verify_neq_none"],
    },
    {
      id: 24,
      name: "Disagree with dealer",
      must: ["may_disagree_with_reason"],
    },
  ] as const;

  it("documents judgment dimensions for each critical scenario", () => {
    const dimensions = [
      "TRUTH",
      "UNDERSTANDING",
      "INVESTIGATION",
      "JUDGMENT",
      "INITIATIVE",
      "COMMERCIAL_VALUE",
    ];
    expect(dimensions).toHaveLength(6);
    expect(scenarios.length).toBeGreaterThanOrEqual(10);
    for (const s of scenarios) {
      expect(s.must.length).toBeGreaterThan(0);
      expect(s.name.length).toBeGreaterThan(0);
    }
  });

  it("constitution supports sell-side / buy-side independence for scenarios 3–5", () => {
    expect(AGENT_CONSTITUTION).toContain("אל תערבב בין שני הכיוונים");
    expect(AGENT_CONSTITUTION).toContain(
      "היעדר מלאי של הסוחר אינו אומר שלביקושים שלו אין פוטנציאל ברשת"
    );
  });

  it("constitution supports tool-failure semantics for scenario 20", () => {
    expect(AGENT_CONSTITUTION).toContain("לא ניתן היה לבדוק");
    expect(AGENT_CONSTITUTION).toContain(
      "כשל בבדיקה אינו הוכחה שאין מידע"
    );
  });

  it("constitution supports general knowledge vs verified fact for automotive judgment", () => {
    expect(AGENT_CONSTITUTION).toContain("טרייד-אין");
    expect(AGENT_CONSTITUTION).toContain("נזילות");
    expect(AGENT_CONSTITUTION).toContain(
      "כאשר מסקנה תלויה במידע ספציפי או עדכני, בדוק אותו או שאל"
    );
  });
});

describe("Capability descriptions — inform, do not decide business policy", () => {
  it("read tools explain limits without embedding recommend-if-count rules", () => {
    const blob = JSON.stringify(AGENT_OPENAI_TOOLS);
    expect(blob).toContain("Does NOT");
    expect(blob).not.toMatch(/if count\s*<\s*5/i);
    expect(blob).not.toMatch(/recommend adding inventory/i);
    expect(blob).toContain("never invent matches");
  });

  it("matches tool states deterministic match truth", () => {
    const matches = AGENT_OPENAI_TOOLS.find(
      (t) => t.function.name === "get_my_matches"
    );
    expect(matches?.function.description).toMatch(/deterministic matching/i);
  });
});

describe("Critical safety still wired on live path", () => {
  it("privacy gate remains before agent loop", () => {
    const orch = read("src/services/assistant/v2-orchestrator.ts");
    const privacyCall = orch.indexOf("const privacy = checkPrivacyGate");
    const loopCall = orch.indexOf("const loop = await runAgentToolLoop");
    expect(privacyCall).toBeGreaterThan(-1);
    expect(loopCall).toBeGreaterThan(privacyCall);
  });

  it("action gateway remains write boundary", () => {
    const gw = read("src/services/assistant/action-gateway.ts");
    expect(gw).toContain("export async function runActionGateway");
    expect(gw).toContain("CONFIRM_PENDING");
  });

  it("inventory read tools expose dealer-facing freshness/price labels", () => {
    const src = read("src/services/assistant/tools/read-tools.ts");
    expect(src).toContain("freshnessLabelHe");
    expect(src).toContain("dealerPrice");
    expect(src).toContain("מעודכן");
    expect(src).toContain("דורש רענון");
  });

  it("no new keyword intent router was introduced for conversation understanding", () => {
    const orch = read("src/services/assistant/v2-orchestrator.ts");
    expect(orch).toContain(
      "No intent regex, no turn classifier, no inventory workflow interception"
    );
    const loop = read("src/services/assistant/agent-loop.ts");
    expect(loop).not.toMatch(/if\s*\(.*מה חסר.*\)/);
    expect(loop).not.toMatch(/opportunityScore\s*=/);
  });
});

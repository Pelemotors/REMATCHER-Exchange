/**
 * Hard Privacy & AI Model v1 — deterministic suite (no GPT obedience).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    privacyConsentDecision: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    privacyAiOnboardingState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    legalAcceptance: { create: vi.fn() },
    dealerMemoryItem: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    dealerMembership: { findFirst: vi.fn() },
    accountDeletionRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    dealer: { update: vi.fn() },
    pushSubscription: { deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  sanitizeExchangePayload,
  scrubProhibitedText,
  assertNoProhibitedLearningData,
  isBlockedPrivacyKey,
} from "@/services/privacy/sanitizer";
import {
  CONSENT_TEXT_VERSION,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  PRIVACY_CONSENT_TYPES,
} from "@/config/legal/versions";
import {
  DEFAULT_CONSENT_STATE,
  getRetentionPolicy,
  getConsentState,
  mayPersistDealerMemory,
  mayDeriveAgentExchangeEvent,
  mayUseExchangeActivityForLearning,
  mayUseExternalActivityForLearning,
  mayExposeDealerIdentity,
  mayProcessOperationally,
  recordConsentDecision,
  completePrivacyAiOnboarding,
} from "@/services/privacy/policy";
import { MATCHING_INTELLIGENCE_LIVE_MODE } from "@/services/exchange/intelligence-live";

describe("Privacy & AI v1 versions", () => {
  it("canonical version identifiers", () => {
    expect(PRIVACY_POLICY_VERSION).toBe("privacy-ai-v1.0-2026-09-05");
    expect(TERMS_VERSION).toBe("terms-v1.0-2026-09-05");
    expect(CONSENT_TEXT_VERSION).toBe("consent-copy-v1.0-2026-09-05");
  });

  it("legal markdown files exist", () => {
    expect(
      existsSync(join(process.cwd(), "content/legal/privacy-ai-v1.0.md"))
    ).toBe(true);
    expect(existsSync(join(process.cwd(), "content/legal/terms-v1.0.md"))).toBe(
      true
    );
  });

  it("privacy policy contains owner and contact", () => {
    const md = readFileSync(
      join(process.cwd(), "content/legal/privacy-ai-v1.0.md"),
      "utf8"
    );
    expect(md).toContain("גל סממה");
    expect(md).toContain("מצפה עדי");
    expect(md).toContain("privacy@rematcher.co.il");
    expect(md).not.toContain("galsamama@gmail.com");
  });

  it("terms exist and separate optional consents from acceptance", () => {
    const md = readFileSync(
      join(process.cwd(), "content/legal/terms-v1.0.md"),
      "utf8"
    );
    expect(md).toContain("תנאי שימוש");
    expect(md).toMatch(/אופציונליות|נבחרות בנפרד/);
  });
});

describe("Consent defaults & independence", () => {
  beforeEach(() => {
    vi.mocked(prisma.privacyConsentDecision.findFirst).mockReset();
    vi.mocked(prisma.privacyConsentDecision.create).mockReset();
    vi.mocked(prisma.legalAcceptance.create).mockReset();
    vi.mocked(prisma.privacyAiOnboardingState.upsert).mockReset();
  });

  it("1. optional consents default false", async () => {
    vi.mocked(prisma.privacyConsentDecision.findFirst).mockResolvedValue(null);
    const state = await getConsentState("d1");
    expect(state).toEqual(DEFAULT_CONSENT_STATE);
    expect(DEFAULT_CONSENT_STATE.DEALER_MEMORY).toBe(false);
  });

  it("2–3. each consent independent via latest decision", async () => {
    vi.mocked(prisma.privacyConsentDecision.findFirst).mockImplementation(
      (async (args?: { where?: { consentType?: string } }) => {
        if (args?.where?.consentType === "DEALER_MEMORY") {
          return { value: true } as never;
        }
        return null;
      }) as never
    );
    const state = await getConsentState("d1");
    expect(state.DEALER_MEMORY).toBe(true);
    expect(state.AGENT_TO_EXCHANGE_LEARNING).toBe(false);
    expect(state.EXCHANGE_ACTIVITY_LEARNING).toBe(false);
    expect(state.EXTERNAL_ACTIVITY_LEARNING).toBe(false);
  });

  it("4. consent history append-only API creates rows", async () => {
    vi.mocked(prisma.privacyConsentDecision.create).mockResolvedValue({
      id: "1",
    } as never);
    await recordConsentDecision({
      userId: "u1",
      dealerId: "d1",
      consentType: "DEALER_MEMORY",
      value: false,
    });
    await recordConsentDecision({
      userId: "u1",
      dealerId: "d1",
      consentType: "DEALER_MEMORY",
      value: true,
    });
    await recordConsentDecision({
      userId: "u1",
      dealerId: "d1",
      consentType: "DEALER_MEMORY",
      value: false,
    });
    expect(prisma.privacyConsentDecision.create).toHaveBeenCalledTimes(3);
  });

  it("complete onboarding records legal acceptance without forcing consents true", async () => {
    vi.mocked(prisma.privacyConsentDecision.create).mockResolvedValue({} as never);
    vi.mocked(prisma.legalAcceptance.create).mockResolvedValue({} as never);
    vi.mocked(prisma.privacyAiOnboardingState.upsert).mockResolvedValue(
      {} as never
    );
    await completePrivacyAiOnboarding({
      userId: "u1",
      dealerId: "d1",
      consents: {
        DEALER_MEMORY: false,
        AGENT_TO_EXCHANGE_LEARNING: false,
        EXCHANGE_ACTIVITY_LEARNING: true,
        EXTERNAL_ACTIVITY_LEARNING: false,
      },
    });
    expect(prisma.privacyConsentDecision.create).toHaveBeenCalledTimes(4);
    const values = vi
      .mocked(prisma.privacyConsentDecision.create)
      .mock.calls.map((c) => (c[0] as { data: { value: boolean } }).data.value);
    expect(values).toEqual([false, false, true, false]);
    expect(prisma.legalAcceptance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          termsVersion: TERMS_VERSION,
          privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        }),
      })
    );
  });
});

describe("Enforcement gates", () => {
  beforeEach(() => {
    vi.mocked(prisma.privacyConsentDecision.findFirst).mockReset();
  });

  it("5–6. Memory OFF blocks; ON permits", async () => {
    vi.mocked(prisma.privacyConsentDecision.findFirst).mockResolvedValue(null);
    expect(await mayPersistDealerMemory("d1")).toBe(false);
    vi.mocked(prisma.privacyConsentDecision.findFirst).mockImplementation(
      (async (args?: { where?: { consentType?: string } }) =>
        args?.where?.consentType === "DEALER_MEMORY"
          ? ({ value: true } as never)
          : null) as never
    );
    expect(await mayPersistDealerMemory("d1")).toBe(true);
  });

  it("9–10,27. Agent→Exchange / External consent gates", async () => {
    vi.mocked(prisma.privacyConsentDecision.findFirst).mockResolvedValue(null);
    expect(await mayDeriveAgentExchangeEvent("d1", "VEHICLE_SOLD")).toBe(false);
    expect(
      await mayDeriveAgentExchangeEvent("d1", "EXTERNAL_DEAL_REPORTED")
    ).toBe(false);
    vi.mocked(prisma.privacyConsentDecision.findFirst).mockImplementation(
      (async (args?: { where?: { consentType?: string } }) => {
        if (args?.where?.consentType === "AGENT_TO_EXCHANGE_LEARNING") {
          return { value: true } as never;
        }
        return null;
      }) as never
    );
    expect(await mayDeriveAgentExchangeEvent("d1", "MATCH_DEAL_CONFIRMED")).toBe(
      true
    );
    expect(
      await mayDeriveAgentExchangeEvent("d1", "EXTERNAL_DEAL_REPORTED")
    ).toBe(false);
  });

  it("20–22. operational processing always allowed", () => {
    expect(mayProcessOperationally()).toBe(true);
  });

  it("23–24. identity internal vs disclosure", () => {
    expect(mayExposeDealerIdentity({ revealAuthorized: false })).toBe(false);
    expect(mayExposeDealerIdentity({ revealAuthorized: true })).toBe(true);
  });

  it("activity learning gate", async () => {
    vi.mocked(prisma.privacyConsentDecision.findFirst).mockResolvedValue(null);
    expect(await mayUseExchangeActivityForLearning("d1")).toBe(false);
    expect(await mayUseExternalActivityForLearning("d1")).toBe(false);
  });
});

describe("Sanitizer — negotiation intelligence boundary", () => {
  it("13–18. blocks closing/floor/margin/customer keys", () => {
    expect(isBlockedPrivacyKey("closingPrice")).toBe(true);
    expect(isBlockedPrivacyKey("floorPrice")).toBe(true);
    expect(isBlockedPrivacyKey("dealerMargin")).toBe(true);
    expect(isBlockedPrivacyKey("customerPhone")).toBe(true);
    expect(isBlockedPrivacyKey("outcomeReason")).toBe(false);
  });

  it("strips prohibited keys from payload", () => {
    const clean = sanitizeExchangePayload({
      outcomeReason: "FINANCING",
      closingPrice: 96000,
      floorPrice: 92000,
      margin: 12,
      conversation: "raw",
      dealerMemory: { x: 1 },
      note: "עסקה לא התקדמה",
    });
    expect(clean).toEqual({
      outcomeReason: "FINANCING",
      note: "עסקה לא התקדמה",
    });
  });

  it("19. FINANCING reason allowed without finance details", () => {
    const clean = sanitizeExchangePayload({
      reason: "FINANCING",
      salary: 20000,
      creditScore: 500,
    });
    expect(clean?.reason).toBe("FINANCING");
    expect(clean?.salary).toBeUndefined();
    expect(clean?.creditScore).toBeUndefined();
  });

  it("scrub closing-price phrase from notes", () => {
    const scrubbed = scrubProhibitedText("מכרתי את הרכב, בסוף סגרתי איתו ב־96 אלף");
    expect(scrubbed).not.toMatch(/96/);
  });

  it("assertNoProhibitedLearningData", () => {
    expect(assertNoProhibitedLearningData({ closingPrice: 96 }).ok).toBe(false);
    expect(assertNoProhibitedLearningData({ reason: "FINANCING" }).ok).toBe(true);
  });
});

describe("Architecture wiring present", () => {
  it("privacy routes and pages exist", () => {
    const files = [
      "src/app/api/privacy/status/route.ts",
      "src/app/api/privacy/consents/route.ts",
      "src/app/api/privacy/onboarding/complete/route.ts",
      "src/app/(dealer)/privacy-ai/page.tsx",
      "src/app/(dealer)/account/privacy/page.tsx",
      "src/app/privacy/page.tsx",
      "src/app/terms/page.tsx",
      "src/services/privacy/policy.ts",
      "src/services/privacy/sanitizer.ts",
      "src/services/privacy/retention.ts",
      "src/services/privacy/deletion.ts",
      "src/services/exchange/intelligence-live.ts",
    ];
    for (const f of files) {
      expect(existsSync(join(process.cwd(), f)), f).toBe(true);
    }
  });

  it("memory create gates on consent (source)", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/assistant/dealer-memory/index.ts"),
      "utf8"
    );
    expect(src).toContain("mayPersistDealerMemory");
  });

  it("agent business event gates on consent (source)", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/exchange/events.ts"),
      "utf8"
    );
    expect(src).toContain("mayDeriveAgentExchangeEvent");
    expect(src).toContain("sanitizeExchangePayload");
  });

  it("rematch hotfix still present", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/matching/information-request.ts"),
      "utf8"
    );
    expect(src).not.toMatch(
      /if \(open\.length === 0\) return \{ fulfilled: 0, reevaluated/
    );
    expect(src).toContain("Always re-evaluate related active demands");
  });

  it("controlled live intelligence mode constant", () => {
    expect(MATCHING_INTELLIGENCE_LIVE_MODE).toBe("controlled_ranking_v1");
  });

  it("matching-flow uses controlled live ranking", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/domain/matching-flow.ts"),
      "utf8"
    );
    expect(src).toContain("applyControlledIntelligenceRanking");
  });

  it("retention config present", () => {
    const p = getRetentionPolicy();
    expect(p.agentConversationsMonths).toBe(24);
    expect(p.exchangeEventsCasesYears).toBe(5);
    expect(p.matchInterestRevealMonths).toBe(36);
  });

  it("four consent types locked", () => {
    expect(PRIVACY_CONSENT_TYPES).toHaveLength(4);
  });

  it("exchange activity learning gates case retrieval (source)", () => {
    const cases = readFileSync(
      join(process.cwd(), "src/services/exchange/cases.ts"),
      "utf8"
    );
    const learning = readFileSync(
      join(process.cwd(), "src/services/exchange/learning.ts"),
      "utf8"
    );
    expect(cases).toContain("mayUseExchangeActivityForLearning");
    expect(cases).toContain("learningEligible");
    expect(learning).toContain("learningEligible: true");
    expect(learning).toContain("exchange_activity_learning_consent_off");
  });

  it("agent privacy settings tool registered", () => {
    const tools = readFileSync(
      join(process.cwd(), "src/services/assistant/agent-tools.ts"),
      "utf8"
    );
    expect(tools).toContain("get_my_privacy_settings");
  });

  it("constitution mentions privacy AI", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/assistant/agent-constitution.ts"),
      "utf8"
    );
    expect(src).toContain("constitution-2.1-privacy-ai-v1-he");
  });
});

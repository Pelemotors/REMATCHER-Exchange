import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { mockProcessOutcomeReminders } = vi.hoisted(() => ({
  mockProcessOutcomeReminders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/notifications/product-events", () => ({
  processOutcomeReminders: (...args: unknown[]) =>
    mockProcessOutcomeReminders(...args),
}));

vi.mock("@/services/commercial/reveal-usage", () => ({
  getDealerUsageSummary: vi.fn().mockResolvedValue({
    planSlug: "onboarding",
    freeUsed: 0,
    freeAllowance: 5,
    monthlyUsed: 0,
    monthlyAllowance: 0,
    actionRequired: false,
  }),
}));

vi.mock("@/services/demand/demand-queries", () => ({
  getPendingActionsForDealer: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock("@/services/dealer/onboarding-state", () => ({
  getDealerSetupStatus: vi.fn().mockResolvedValue({
    hasInventory: true,
    inventoryCount: 1,
    hasActiveDemand: false,
    activeDemandCount: 0,
    profileComplete: true,
    pushEnabled: false,
    onboardingComplete: true,
    shouldShowOnboarding: false,
    currentStep: null,
  }),
}));

const mockFindMany = vi.fn();
const mockCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: { count: (...args: unknown[]) => mockCount(...args) },
    demand: { count: (...args: unknown[]) => mockCount(...args) },
    reveal: { count: (...args: unknown[]) => mockCount(...args) },
    notification: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

describe("mobile performance fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);
  });

  it("login form skips pre-flight login-check and uses client redirect", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/auth/login-form.tsx"),
      "utf8"
    );
    expect(src).toContain("getPostAuthRedirect");
    expect(src).toContain("router.replace");
    expect(src).not.toMatch(/await fetch\("\/api\/auth\/login-check"[\s\S]*signIn/);
  });

  it("auth export is request-cached", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/auth.ts"), "utf8");
    expect(src).toContain("cache(uncachedAuth)");
  });

  it("SessionProvider disables focus refetch", () => {
    const src = readFileSync(resolve(process.cwd(), "src/app/providers.tsx"), "utf8");
    expect(src).toContain("refetchOnWindowFocus={false}");
  });

  it("work center does not await outcome reminders", async () => {
    const { getWorkCenterSnapshot } = await import(
      "@/services/dealer/work-center"
    );
    await getWorkCenterSnapshot("dealer1", "user1");
    expect(mockProcessOutcomeReminders).toHaveBeenCalledWith("dealer1");
  });

  it("app shell lazy-loads heavy client modules", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/layout/app-shell-v2.tsx"),
      "utf8"
    );
    expect(src).toContain('import dynamic from "next/dynamic"');
    expect(src).toContain("ExchangeAssistant");
    expect(src).toContain("PushOnboardingPrompt");
  });
});

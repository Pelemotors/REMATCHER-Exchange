import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { mockUserFindMany } = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
  },
}));

import {
  dedupeAudienceUsers,
  eligibilityLabelFor,
  getPushEligibilityStatus,
  resolveAudience,
  searchAudienceUsers,
  type AudienceUser,
} from "@/services/admin/communications";

function sampleUser(overrides: Partial<{
  id: string;
  name: string;
  email: string;
  pushSubs: { id: string; invalidatedAt: Date | null }[];
  dealerName: string;
}> = {}) {
  return {
    id: overrides.id ?? "u1",
    email: overrides.email ?? "test@example.com",
    name: overrides.name ?? "גל סוחר",
    role: "DEALER_USER",
    pushSubs: overrides.pushSubs ?? [{ id: "s1", invalidatedAt: null }],
    memberships: [
      {
        dealer: {
          businessName: overrides.dealerName ?? "פelemotors",
          verificationStatus: "VERIFIED",
        },
      },
    ],
  };
}

describe("input contrast tokens", () => {
  it("defines shared input-v2 with explicit text and background tokens", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.input-v2/);
    expect(css).toMatch(/text-v2-text-primary/);
    expect(css).toMatch(/bg-v2-surface-secondary/);
    expect(css).toMatch(/placeholder:text-v2-text-muted/);
  });

  it("admin layout resets unstyled field contrast on dark canvas", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/app/admin/admin-layout.module.css"),
      "utf8"
    );
    expect(css).toMatch(/background-color: var\(--rm2-surface-secondary/);
    expect(css).toMatch(/color: var\(--rm2-text-primary/);
  });
});

describe("push eligibility helpers", () => {
  it("marks active subscription as eligible", () => {
    expect(getPushEligibilityStatus(2, 2)).toBe("eligible");
    expect(eligibilityLabelFor("eligible")).toMatch(/זכאי/);
  });

  it("marks invalidated-only subscription", () => {
    expect(getPushEligibilityStatus(0, 1)).toBe("invalidated_only");
    expect(eligibilityLabelFor("invalidated_only")).toMatch(/לא זמין/);
  });

  it("marks no subscription", () => {
    expect(getPushEligibilityStatus(0, 0)).toBe("no_subscription");
  });
});

describe("audience dedupe", () => {
  it("prevents duplicate selected users", () => {
    const users: AudienceUser[] = [
      {
        id: "u1",
        email: "a@x.com",
        name: "A",
        role: "DEALER_USER",
        dealerNames: [],
        dealerStatuses: [],
        hasPushSubscription: true,
        subscriptionCount: 1,
        pushEligibilityStatus: "eligible",
        eligibilityLabel: "זכאי ל-Push",
      },
      {
        id: "u1",
        email: "a@x.com",
        name: "A",
        role: "DEALER_USER",
        dealerNames: [],
        dealerStatuses: [],
        hasPushSubscription: true,
        subscriptionCount: 1,
        pushEligibilityStatus: "eligible",
        eligibilityLabel: "זכאי ל-Push",
      },
    ];
    expect(dedupeAudienceUsers(users)).toHaveLength(1);
  });
});

describe("searchAudienceUsers", () => {
  beforeEach(() => {
    mockUserFindMany.mockReset();
  });

  it("searches partial name", async () => {
    mockUserFindMany.mockResolvedValue([sampleUser({ name: "גל סוחר" })]);
    const results = await searchAudienceUsers("גל");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("גל סוחר");
    expect(mockUserFindMany).toHaveBeenCalled();
  });

  it("searches email", async () => {
    mockUserFindMany.mockResolvedValue([
      sampleUser({ email: "galsamama@gmail.com", name: "גל" }),
    ]);
    const results = await searchAudienceUsers("galsamama");
    expect(results[0].email).toBe("galsamama@gmail.com");
  });

  it("searches dealer name", async () => {
    mockUserFindMany.mockResolvedValue([
      sampleUser({ dealerName: "פelemotors Motors", name: "Dealer" }),
    ]);
    const results = await searchAudienceUsers("pelemotors");
    expect(results[0].dealerNames[0]).toContain("Motors");
  });

  it("counts one user with multiple devices once", async () => {
    mockUserFindMany.mockResolvedValue([
      sampleUser({
        pushSubs: [
          { id: "s1", invalidatedAt: null },
          { id: "s2", invalidatedAt: null },
        ],
      }),
    ]);
    const results = await searchAudienceUsers("גל");
    expect(results).toHaveLength(1);
    expect(results[0].subscriptionCount).toBe(2);
    expect(results[0].hasPushSubscription).toBe(true);
  });
});

describe("resolveAudience preview", () => {
  beforeEach(() => {
    mockUserFindMany.mockReset();
  });

  it("returns actual user identities with eligibility", async () => {
    mockUserFindMany.mockResolvedValue([
      sampleUser({ id: "u1", name: "Alice", email: "a@x.com" }),
      sampleUser({
        id: "u2",
        name: "Bob",
        email: "b@x.com",
        pushSubs: [],
      }),
    ]);

    const resolution = await resolveAudience({
      audienceType: "MULTIPLE",
      userIds: ["u1", "u2"],
    });

    expect(resolution.selectedCount).toBe(2);
    expect(resolution.eligibleCount).toBe(1);
    expect(resolution.notSubscribedCount).toBe(1);
    expect(resolution.selected.map((u) => u.email)).toEqual(["a@x.com", "b@x.com"]);
    expect(resolution.selected[0].eligibilityLabel).toMatch(/זכאי/);
    expect(resolution.selected[1].pushEligibilityStatus).toBe("no_subscription");
  });

  it("ALL audience returns inspectable list reconciling counts", async () => {
    mockUserFindMany.mockResolvedValue([
      sampleUser({ id: "u1" }),
      sampleUser({ id: "u2", pushSubs: [] }),
      sampleUser({ id: "u3", pushSubs: [{ id: "s9", invalidatedAt: new Date() }] }),
    ]);

    const resolution = await resolveAudience({ audienceType: "ALL" });

    expect(resolution.selectedCount).toBe(3);
    expect(resolution.eligibleCount).toBe(1);
    expect(resolution.notSubscribedCount).toBe(2);
    expect(resolution.selected.length).toBe(resolution.selectedCount);
    expect(
      resolution.selected.filter((u) => u.hasPushSubscription).length
    ).toBe(resolution.eligibleCount);
  });
});

describe("admin communications UI module", () => {
  it("uses shared input-v2 class for composer fields", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/admin/admin-communications-center.tsx"),
      "utf8"
    );
    expect(src).toMatch(/className="input-v2"/);
    expect(src).not.toMatch(/border border-v2-border px-3 py-2 text-sm/);
  });
});

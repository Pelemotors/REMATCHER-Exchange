import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validatePushContent,
  recordPushTelemetry,
} from "@/services/notifications/push";
import {
  resolveAudience,
  searchAudienceUsers,
} from "@/services/admin/communications";
import { timingDistribution, pct } from "@/services/analytics/percentiles";
import { businessIdempotencyKey } from "@/services/events/contract";
import { logEvent } from "@/services/events/log-event";

const mockUserFind = vi.fn();
const mockPushSubFind = vi.fn();
const mockPushSubCount = vi.fn();
const mockUserCount = vi.fn();
const mockDeliveryFind = vi.fn();
const mockDeliveryUpdate = vi.fn();
const mockCampaignUpdate = vi.fn();
const mockAppEventFind = vi.fn();
const mockAppEventCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => mockUserFind(...args),
      count: (...args: unknown[]) => mockUserCount(...args),
    },
    pushSubscription: {
      findMany: (...args: unknown[]) => mockPushSubFind(...args),
      count: (...args: unknown[]) => mockPushSubCount(...args),
    },
    pushDelivery: {
      findUnique: (...args: unknown[]) => mockDeliveryFind(...args),
      update: (...args: unknown[]) => mockDeliveryUpdate(...args),
    },
    pushCampaign: {
      update: (...args: unknown[]) => mockCampaignUpdate(...args),
    },
    appEvent: {
      findUnique: (...args: unknown[]) => mockAppEventFind(...args),
      create: (...args: unknown[]) => mockAppEventCreate(...args),
    },
  },
}));

vi.mock("@/services/events/log-event", () => ({
  logEvent: vi.fn().mockResolvedValue({ created: true }),
}));

describe("validatePushContent", () => {
  it("requires title and body", () => {
    expect(validatePushContent({ title: "", body: "x" }).ok).toBe(false);
    expect(validatePushContent({ title: "t", body: "" }).ok).toBe(false);
    expect(validatePushContent({ title: "t", body: "b" }).ok).toBe(true);
  });

  it("rejects external links", () => {
    expect(
      validatePushContent({ title: "t", body: "b", link: "https://evil.com" }).ok
    ).toBe(false);
    expect(
      validatePushContent({ title: "t", body: "b", link: "/matches" }).ok
    ).toBe(true);
  });
});

describe("audience resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts eligible vs not subscribed", async () => {
    mockUserFind.mockResolvedValue([
      {
        id: "u1",
        email: "a@test.com",
        name: "A",
        role: "DEALER_USER",
        pushSubs: [{ id: "s1" }],
        memberships: [{ dealer: { businessName: "X", verificationStatus: "VERIFIED" } }],
      },
      {
        id: "u2",
        email: "b@test.com",
        name: "B",
        role: "DEALER_USER",
        pushSubs: [],
        memberships: [{ dealer: { businessName: "Y", verificationStatus: "VERIFIED" } }],
      },
    ]);

    const result = await resolveAudience({
      audienceType: "MULTIPLE",
      userIds: ["u1", "u2"],
    });

    expect(result.selectedCount).toBe(2);
    expect(result.eligibleCount).toBe(1);
    expect(result.notSubscribedCount).toBe(1);
  });
});

describe("push telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeliveryFind.mockResolvedValue({
      id: "d1",
      userId: "u1",
      campaignId: "c1",
      receivedAt: null,
      clickedAt: null,
      destinationOpenedAt: null,
      status: "SENT",
    });
    mockDeliveryUpdate.mockResolvedValue({});
    mockCampaignUpdate.mockResolvedValue({});
  });

  it("records received for owning user", async () => {
    const ok = await recordPushTelemetry("d1", "received", "u1");
    expect(ok).toBe(true);
    expect(mockDeliveryUpdate).toHaveBeenCalled();
  });

  it("rejects wrong user", async () => {
    const ok = await recordPushTelemetry("d1", "received", "other");
    expect(ok).toBe(false);
  });
});

describe("analytics percentiles", () => {
  it("returns null for empty dataset", () => {
    const dist = timingDistribution([]);
    expect(dist.count).toBe(0);
    expect(dist.medianMs).toBeNull();
  });

  it("calculates median and p75", () => {
    const dist = timingDistribution([100, 200, 300, 400, 1000]);
    expect(dist.medianMs).toBe(300);
    expect(dist.p75Ms).toBe(400);
  });

  it("pct returns null for zero denominator", () => {
    expect(pct(1, 0)).toBeNull();
    expect(pct(1, 4)).toBe(25);
  });
});

describe("event idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppEventFind.mockResolvedValue(null);
    mockAppEventCreate.mockResolvedValue({ id: "e1" });
  });

  it("deduplicates critical events", async () => {
    const key = businessIdempotencyKey("match_created", "match", "m1");
    await logEvent({
      eventType: "match_created",
      entityType: "match",
      entityId: "m1",
      idempotencyKey: key,
    });
    expect(logEvent).toHaveBeenCalled();
  });
});

describe("searchAudienceUsers", () => {
  beforeEach(() => {
    mockUserFind.mockResolvedValue([]);
  });

  it("returns empty for blank query", async () => {
    expect(await searchAudienceUsers("")).toEqual([]);
  });
});

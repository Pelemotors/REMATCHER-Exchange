import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAdmin = vi.fn();
const mockAuth = vi.fn();
const mockRecordTelemetry = vi.fn();

vi.mock("@/lib/auth-guards", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdmin(...args),
}));

vi.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock("@/services/notifications/push", () => ({
  recordPushTelemetry: (...args: unknown[]) => mockRecordTelemetry(...args),
}));

vi.mock("@/services/admin/communications", () => ({
  searchAudienceUsers: vi.fn().mockResolvedValue([]),
  resolveAudience: vi.fn().mockResolvedValue({
    selectedCount: 0,
    eligibleCount: 0,
    notSubscribedCount: 0,
    selected: [],
  }),
  sendAdminCommunication: vi.fn(),
  getCampaignHistory: vi.fn().mockResolvedValue([]),
  getPushSubscriberStats: vi.fn().mockResolvedValue({
    subscribedUsers: 0,
    notSubscribedUsers: 0,
    totalSubscriptions: 0,
  }),
}));

describe("Admin communications API authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies non-admin for audience search", async () => {
    mockRequireAdmin.mockResolvedValue({ error: "Forbidden", status: 403 });
    const { GET } = await import("@/app/api/admin/communications/audience/route");
    const res = await GET(
      new Request("http://localhost/api/admin/communications/audience?q=test")
    );
    expect(res.status).toBe(403);
  });

  it("allows admin for audience search", async () => {
    mockRequireAdmin.mockResolvedValue({
      session: { user: { id: "admin1", role: "ADMIN" } },
    });
    const { GET } = await import("@/app/api/admin/communications/audience/route");
    const res = await GET(
      new Request("http://localhost/api/admin/communications/audience?q=test")
    );
    expect(res.status).toBe(200);
  });

  it("denies non-admin for send", async () => {
    mockRequireAdmin.mockResolvedValue({ error: "Forbidden", status: 403 });
    const { POST } = await import("@/app/api/admin/communications/send/route");
    const res = await POST(
      new Request("http://localhost/api/admin/communications/send", {
        method: "POST",
        body: JSON.stringify({
          title: "t",
          body: "b",
          audienceType: "SINGLE",
          userIds: ["u1"],
        }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("requires broadcast confirmation for ALL audience", async () => {
    mockRequireAdmin.mockResolvedValue({
      session: { user: { id: "admin1", role: "ADMIN" } },
    });
    const { POST } = await import("@/app/api/admin/communications/send/route");
    const res = await POST(
      new Request("http://localhost/api/admin/communications/send", {
        method: "POST",
        body: JSON.stringify({
          title: "t",
          body: "b",
          audienceType: "ALL",
          confirmBroadcast: false,
        }),
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/confirmation/i);
  });
});

describe("Push telemetry authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies unauthenticated telemetry", async () => {
    mockAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/push/telemetry/route");
    const res = await POST(
      new Request("http://localhost/api/push/telemetry", {
        method: "POST",
        body: JSON.stringify({ deliveryId: "d1", event: "received" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("forwards telemetry with session user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockRecordTelemetry.mockResolvedValue(true);
    const { POST } = await import("@/app/api/push/telemetry/route");
    const res = await POST(
      new Request("http://localhost/api/push/telemetry", {
        method: "POST",
        body: JSON.stringify({ deliveryId: "d1", event: "received" }),
      })
    );
    expect(res.status).toBe(200);
    expect(mockRecordTelemetry).toHaveBeenCalledWith("d1", "received", "u1");
  });
});

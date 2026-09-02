import { describe, it, expect, vi, beforeEach } from "vitest";

const mockOppFind = vi.fn();
const mockRevealFind = vi.fn();
const mockMembershipFind = vi.fn();
const mockAppEventFind = vi.fn();
const mockCreateNotification = vi.fn();
const mockLogEvent = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sellerOpportunity: { findMany: (...args: unknown[]) => mockOppFind(...args) },
    reveal: { findMany: (...args: unknown[]) => mockRevealFind(...args) },
    dealerMembership: { findMany: (...args: unknown[]) => mockMembershipFind(...args) },
    appEvent: { findUnique: (...args: unknown[]) => mockAppEventFind(...args) },
  },
}));

vi.mock("@/services/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

vi.mock("@/services/events/log-event", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));

import { runSmartReminders } from "@/services/reminders/smart-reminders";

describe("smart reminders dedup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOppFind.mockResolvedValue([
      {
        id: "opp1",
        vehicle: { dealerId: "d1", make: "M", model: "X" },
        buyerInterest: { demand: {} },
      },
    ]);
    mockRevealFind.mockResolvedValue([]);
    mockMembershipFind.mockResolvedValue([{ userId: "u1" }]);
    mockAppEventFind.mockResolvedValue(null);
    mockCreateNotification.mockResolvedValue({ id: "n1" });
    mockLogEvent.mockResolvedValue({ created: true });
  });

  it("sends once and dedups on repeat within cooldown", async () => {
    const first = await runSmartReminders();
    expect(first.sent).toBe(1);
    mockAppEventFind.mockResolvedValue({
      createdAt: new Date(),
    });
    const second = await runSmartReminders();
    expect(second.sent).toBe(0);
  });
});

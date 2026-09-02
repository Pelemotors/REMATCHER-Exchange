import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { create: vi.fn() },
    notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("@/services/notifications/push", () => ({
  deliverPushToUser: vi.fn().mockResolvedValue({ sent: 1, failed: 0, deliveries: [] }),
}));

import { prisma } from "@/lib/prisma";
import { deliverPushToUser } from "@/services/notifications/push";
import { createNotification } from "@/services/notifications";

describe("Notification orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.notification.create).mockResolvedValue({
      id: "n1",
    } as never);
  });

  it("creates activity even when push fails", async () => {
    vi.mocked(deliverPushToUser).mockRejectedValueOnce(new Error("push down"));

    const notification = await createNotification({
      userId: "user-1",
      type: "SYSTEM",
      title: "test",
      body: "body",
    });

    expect(notification.id).toBe("n1");
    expect(prisma.notification.create).toHaveBeenCalledOnce();
    expect(deliverPushToUser).toHaveBeenCalledOnce();
  });
});

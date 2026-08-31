import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { create: vi.fn() },
  },
}));

vi.mock("@/services/notifications/push", () => ({
  sendPushToUser: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/services/notifications/push";
import { createNotification } from "@/services/notifications";

describe("Notification orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.notification.create).mockResolvedValue({
      id: "n1",
    } as never);
  });

  it("creates activity even when push fails", async () => {
    vi.mocked(sendPushToUser).mockRejectedValueOnce(new Error("push down"));

    const notification = await createNotification({
      userId: "user-1",
      type: "SYSTEM",
      title: "test",
      body: "body",
    });

    expect(notification.id).toBe("n1");
    expect(prisma.notification.create).toHaveBeenCalledOnce();
    expect(sendPushToUser).toHaveBeenCalledOnce();
  });
});

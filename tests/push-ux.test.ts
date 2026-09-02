import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectPushSupport,
  hasPushApis,
  isIosDevice,
  isStandaloneDisplayMode,
  permissionToDisplayStatus,
  pushOnboardingStorageKey,
  shouldShowPushOnboarding,
} from "@/lib/push-support";
import {
  isDeviceSubscribed,
  removePushSubscription,
  savePushSubscription,
} from "@/services/notifications/push";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import { prisma } from "@/lib/prisma";

describe("push-support", () => {
  it("shows onboarding when permission default on mobile", () => {
    expect(
      shouldShowPushOnboarding({
        support: "supported",
        permission: "default",
        deviceSubscribed: false,
        dismissed: false,
        isMobileViewport: true,
      })
    ).toBe(true);
  });

  it("does not show onboarding after dismissal", () => {
    expect(
      shouldShowPushOnboarding({
        support: "supported",
        permission: "default",
        deviceSubscribed: false,
        dismissed: true,
        isMobileViewport: true,
      })
    ).toBe(false);
  });

  it("does not show onboarding on desktop", () => {
    expect(
      shouldShowPushOnboarding({
        support: "supported",
        permission: "default",
        deviceSubscribed: false,
        dismissed: false,
        isMobileViewport: false,
      })
    ).toBe(false);
  });

  it("shows onboarding when permission granted but not subscribed (retry)", () => {
    expect(
      shouldShowPushOnboarding({
        support: "supported",
        permission: "granted",
        deviceSubscribed: false,
        dismissed: false,
        isMobileViewport: true,
      })
    ).toBe(true);
  });

  it("does not show onboarding when subscribed", () => {
    expect(
      shouldShowPushOnboarding({
        support: "supported",
        permission: "granted",
        deviceSubscribed: true,
        dismissed: false,
        isMobileViewport: true,
      })
    ).toBe(false);
  });

  it("maps permission denied to blocked status", () => {
    expect(
      permissionToDisplayStatus("denied", false, "supported")
    ).toBe("blocked");
  });

  it("maps active subscription to active status", () => {
    expect(
      permissionToDisplayStatus("granted", true, "supported")
    ).toBe("active");
  });

  it("detects iOS needs install when APIs missing in Safari tab", () => {
    expect(
      detectPushSupport({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        hasApis: false,
        displayMode: "browser",
        navigatorStandalone: false,
      })
    ).toBe("ios_needs_install");
  });

  it("detects supported iOS PWA standalone", () => {
    expect(
      detectPushSupport({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        hasApis: true,
        displayMode: "standalone",
        navigatorStandalone: true,
      })
    ).toBe("supported");
  });

  it("detects unsupported desktop without APIs", () => {
    expect(
      detectPushSupport({
        userAgent: "Mozilla/5.0 (Windows NT 10.0)",
        hasApis: false,
      })
    ).toBe("unsupported");
  });

  it("uses per-user onboarding dismiss key", () => {
    expect(pushOnboardingStorageKey("u1")).toContain("u1");
  });

  it("hasPushApis requires all three APIs", () => {
    expect(hasPushApis(true, true, true)).toBe(true);
    expect(hasPushApis(false, true, true)).toBe(false);
  });

  it("isIosDevice detects iPhone", () => {
    expect(isIosDevice("iPhone")).toBe(true);
    expect(isIosDevice("Android")).toBe(false);
  });

  it("isStandaloneDisplayMode detects standalone", () => {
    expect(isStandaloneDisplayMode("standalone", false)).toBe(true);
    expect(isStandaloneDisplayMode(undefined, true)).toBe(true);
    expect(isStandaloneDisplayMode("browser", false)).toBe(false);
  });
});

describe("push server subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("savePushSubscription upserts by endpoint without deleting others", async () => {
    vi.mocked(prisma.pushSubscription.upsert).mockResolvedValue({
      id: "s2",
      userId: "u1",
      endpoint: "ep2",
      p256dh: "k1",
      auth: "a1",
      createdAt: new Date(),
    });

    await savePushSubscription("u1", {
      endpoint: "ep2",
      keys: { p256dh: "k1", auth: "a1" },
    });

    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: "ep2" },
        create: expect.objectContaining({ userId: "u1" }),
      })
    );
    expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
  });

  it("removePushSubscription deletes only owned endpoint", async () => {
    vi.mocked(prisma.pushSubscription.findUnique).mockResolvedValue({
      id: "s1",
      userId: "u1",
      endpoint: "ep1",
      p256dh: "k",
      auth: "a",
      createdAt: new Date(),
    });
    vi.mocked(prisma.pushSubscription.delete).mockResolvedValue({} as never);

    const ok = await removePushSubscription("u1", "ep1");
    expect(ok).toBe(true);
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({
      where: { endpoint: "ep1" },
    });
  });

  it("removePushSubscription rejects other user endpoint", async () => {
    vi.mocked(prisma.pushSubscription.findUnique).mockResolvedValue({
      id: "s1",
      userId: "other",
      endpoint: "ep1",
      p256dh: "k",
      auth: "a",
      createdAt: new Date(),
    });

    const ok = await removePushSubscription("u1", "ep1");
    expect(ok).toBe(false);
    expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
  });

  it("isDeviceSubscribed true only for matching user", async () => {
    vi.mocked(prisma.pushSubscription.findUnique).mockResolvedValue({
      id: "s1",
      userId: "u1",
      endpoint: "ep1",
      p256dh: "k",
      auth: "a",
      createdAt: new Date(),
    });
    expect(await isDeviceSubscribed("u1", "ep1")).toBe(true);
    expect(await isDeviceSubscribed("u2", "ep1")).toBe(false);
  });

  it("existing subscription upsert does not delete other devices", async () => {
    vi.mocked(prisma.pushSubscription.upsert).mockResolvedValue({} as never);
    await savePushSubscription("u1", {
      endpoint: "device-b",
      keys: { p256dh: "x", auth: "y" },
    });
    expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
  });
});

describe("push client subscribe flow (mocked)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });
  });

  it("requestPermission not called until explicit subscribe", async () => {
    const requestPermission = Notification.requestPermission as ReturnType<
      typeof vi.fn
    >;
    requestPermission.mockClear();

    const { shouldShowPushOnboarding: show } = await import("@/lib/push-support");
    expect(
      show({
        support: "supported",
        permission: "default",
        deviceSubscribed: false,
        dismissed: false,
        isMobileViewport: true,
      })
    ).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

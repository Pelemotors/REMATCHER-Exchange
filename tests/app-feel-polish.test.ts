/**
 * App Feel Polish — Push SPA navigate + nav/manifest checks (no Exchange Core).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  sanitizeClientNavigateUrl,
  isSameClientDestination,
} from "@/lib/pwa-navigate";
import { MOBILE_BOTTOM_NAV_ITEMS } from "@/config/mobile-nav";

const root = process.cwd();

describe("sanitizeClientNavigateUrl", () => {
  const origin = "https://exchange.rematcher.co.il";

  it("allows safe internal deep links", () => {
    expect(sanitizeClientNavigateUrl("/matches?focus=abc", origin)).toBe(
      "/matches?focus=abc"
    );
    expect(sanitizeClientNavigateUrl("/inventory?focus=v1&enrich=1", origin)).toBe(
      "/inventory?focus=v1&enrich=1"
    );
  });

  it("rejects external / open redirect", () => {
    expect(
      sanitizeClientNavigateUrl("https://evil.example/phish", origin)
    ).toBeNull();
    expect(sanitizeClientNavigateUrl("//evil.example", origin)).toBeNull();
    expect(sanitizeClientNavigateUrl("https://other.com/home", origin)).toBeNull();
  });

  it("rejects malformed / unsafe paths", () => {
    expect(sanitizeClientNavigateUrl("/not-a-real-route", origin)).toBeNull();
    expect(sanitizeClientNavigateUrl("", origin)).toBeNull();
    expect(sanitizeClientNavigateUrl(null, origin)).toBeNull();
  });

  it("detects same destination", () => {
    expect(isSameClientDestination("/matches", "?focus=1", "/matches?focus=1")).toBe(
      true
    );
    expect(isSameClientDestination("/matches", "", "/home")).toBe(false);
  });
});

describe("PWA navigate wiring", () => {
  it("SW posts REMATCHER_NAVIGATE without client.navigate for existing clients", () => {
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    expect(sw).toContain('type: "REMATCHER_NAVIGATE"');
    expect(sw).not.toMatch(/await client\.navigate\(/);
    expect(sw).toContain("openWindow");
  });

  it("bridge uses router.push; register does not location.assign", () => {
    const bridge = readFileSync(
      join(root, "src/components/pwa/pwa-navigation-bridge.tsx"),
      "utf8"
    );
    expect(bridge).toContain("router.push");
    expect(bridge).toContain("sanitizeClientNavigateUrl");
    expect(bridge).not.toContain("location.assign");

    const reg = readFileSync(
      join(root, "src/components/pwa/pwa-register.tsx"),
      "utf8"
    );
    expect(reg).not.toContain("location.assign");
    expect(reg).not.toContain("REMATCHER_NAVIGATE");
  });
});

describe("mobile bottom nav", () => {
  it("keeps 5 primary destinations", () => {
    expect(MOBILE_BOTTOM_NAV_ITEMS.map((i) => i.href)).toEqual([
      "/home",
      "/inventory",
      "/demand",
      "/matches",
      "/activity",
    ]);
  });

  it("removes hamburger menu duplication from AppShell", () => {
    const src = readFileSync(
      join(root, "src/components/layout/app-shell-v2.tsx"),
      "utf8"
    );
    expect(src).not.toContain("menuOpen");
    expect(src).not.toContain("Menu");
    expect(src).toContain('href="/account"');
    expect(src).toContain("MOBILE_BOTTOM_NAV_ITEMS");
    expect(src).toContain("@/config/mobile-nav");
  });

  it("App Shell owns safe-area chrome", () => {
    const css = readFileSync(
      join(root, "src/components/layout/app-shell-v2.module.css"),
      "utf8"
    );
    expect(css).toContain("safe-area-inset-top");
    expect(css).toContain("safe-area-inset-bottom");
    const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");
    expect(globals).toContain('body:not(:has([data-app-shell="true"]))');
  });
});

describe("push onboarding CLS", () => {
  it("uses fixed overlay instead of in-flow mb-4 card", () => {
    const src = readFileSync(
      join(root, "src/components/pwa/push-onboarding-prompt.tsx"),
      "utf8"
    );
    expect(src).toContain("fixed");
    expect(src).not.toContain("mb-4 md:hidden");
    expect(src).toContain("shouldShowPushOnboarding");
  });
});

describe("manifest PWA icons", () => {
  it("lists required PNG icons and theme_color", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "public/manifest.json"), "utf8")
    );
    expect(manifest.theme_color).toBe("#070C14");
    expect(manifest.background_color).toBe("#070C14");
    const srcs = manifest.icons.map((i: { src: string }) => i.src);
    expect(srcs).toContain("/icons/icon-192.png");
    expect(srcs).toContain("/icons/icon-512.png");
    expect(srcs).toContain("/icons/icon-512-maskable.png");
    expect(
      existsSync(join(root, "public/icons/icon-192.png"))
    ).toBe(true);
    expect(
      existsSync(join(root, "public/icons/icon-512.png"))
    ).toBe(true);
    expect(
      existsSync(join(root, "public/icons/icon-512-maskable.png"))
    ).toBe(true);
    expect(
      existsSync(join(root, "public/icons/apple-touch-icon.png"))
    ).toBe(true);
  });
});

describe("route loading skeletons", () => {
  it("inventory loading is list pattern not match cards only", () => {
    const inv = readFileSync(
      join(root, "src/app/(dealer)/inventory/loading.tsx"),
      "utf8"
    );
    const acc = readFileSync(
      join(root, "src/app/(dealer)/account/loading.tsx"),
      "utf8"
    );
    expect(inv).toContain("ListLoadingSkeleton");
    expect(acc).toContain("FormLoadingSkeleton");
  });
});

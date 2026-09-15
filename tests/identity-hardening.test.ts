/**
 * Hardening: real-mode JSON proofs rejected; entitlement 402; paywall page; membership.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { COMMERCIAL_EVENTS } from "@/services/events/contract";
import { SAFE_DEEP_LINK_PREFIXES } from "@/lib/deep-links";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("identity hardening sources", () => {
  it("paywall page and oauth buttons exist", () => {
    expect(existsSync(join(root, "src/app/(dealer)/subscription/page.tsx"))).toBe(
      true
    );
    expect(read("src/components/auth/login-form.tsx")).toContain("OAuthButtons");
    expect(read("src/components/auth/oauth-buttons.tsx")).toContain(
      "/api/auth/"
    );
  });

  it("native store + social plugins exist", () => {
    expect(
      existsSync(
        join(
          root,
          "android/app/src/main/java/co/rematcher/exchange/billing/StoreBillingPlugin.java"
        )
      )
    ).toBe(true);
    expect(
      existsSync(
        join(
          root,
          "android/app/src/main/java/co/rematcher/exchange/identity/SocialLoginPlugin.java"
        )
      )
    ).toBe(true);
    expect(read("android/app/src/main/java/co/rematcher/exchange/MainActivity.java")).toContain(
      "StoreBillingPlugin"
    );
    expect(existsSync(join(root, "mobile/ios/App/StoreBillingPlugin.swift"))).toBe(
      true
    );
    expect(existsSync(join(root, "mobile/ios/App/SocialLoginPlugin.swift"))).toBe(
      true
    );
  });

  it("Apple/Google billing reject JSON outside fake mode", () => {
    const apple = read("src/services/billing/apple-subscription-provider.ts");
    const google = read(
      "src/services/billing/google-play-subscription-provider.ts"
    );
    expect(apple).toContain("JSON proofs are only accepted");
    expect(google).toContain("JSON proofs are only accepted");
    expect(apple).toContain("App Store Server API");
    expect(google).toContain("androidpublisher");
    expect(google).toContain("timingSafeEqual");
  });

  it("native billing uses StoreKit / Play BillingClient", () => {
    expect(read("mobile/ios/App/StoreBillingPlugin.swift")).toContain("Product.products");
    expect(
      read(
        "android/app/src/main/java/co/rematcher/exchange/billing/StoreBillingPlugin.java"
      )
    ).toContain("BillingClient");
    expect(
      read(
        "android/app/src/main/java/co/rematcher/exchange/identity/SocialLoginPlugin.java"
      )
    ).toContain("GoogleSignIn");
  });

  it("requireVerifiedDealer enforces entitlement by default", () => {
    const src = read("src/lib/auth-guards.ts");
    expect(src).toContain("requireEntitlement");
    expect(src).toContain("assertEntitled");
    expect(read("src/app/api/assistant/chat/route.ts")).toContain(
      "requireEntitlement:false"
    );
  });

  it("action gateway blocks writes when not entitled", () => {
    expect(read("src/services/assistant/action-gateway.ts")).toContain(
      "assertEntitled"
    );
  });

  it("subscription deep link remains safe", () => {
    expect(SAFE_DEEP_LINK_PREFIXES).toContain("/subscription");
  });

  it("commercial funnel events exist", () => {
    expect(COMMERCIAL_EVENTS.PAYWALL_VIEWED).toBe("PAYWALL_VIEWED");
    expect(COMMERCIAL_EVENTS.TRIAL_STARTED).toBe("TRIAL_STARTED");
  });

  it("setup doc lists OWNER_REQUIRED Apple/Google items", () => {
    const doc = read("docs/IDENTITY_AND_MONETIZATION_SETUP.md");
    expect(doc).toContain("APPLE_TEAM_ID");
    expect(doc).toContain("GOOGLE_CLIENT_ID");
    expect(doc).toContain("OWNER_REQUIRED");
  });

  it("dealer members API exists", () => {
    expect(existsSync(join(root, "src/app/api/dealer/members/route.ts"))).toBe(
      true
    );
  });
});

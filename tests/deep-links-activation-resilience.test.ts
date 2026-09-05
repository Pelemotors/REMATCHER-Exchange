import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  deepLinkForMatch,
  deepLinkForOpportunity,
  deepLinkForReveal,
  deepLinkForVehicle,
  isSafeInternalPath,
  sanitizeReturnPath,
} from "@/lib/deep-links";
import { getPostAuthRedirect } from "@/lib/auth-routing";
import { isTestAccountEmail, TEST_ACCOUNT_EMAILS } from "@/config/accounts";
import { getKillSwitchState } from "@/config/kill-switches";
import { validatePushContent } from "@/services/notifications/push";
import {
  listLocalMigrations,
  scanDestructiveSql,
  runMigrationPreflight,
} from "../scripts/migration-preflight";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Deep Links", () => {
  it("builds canonical entity destinations", () => {
    expect(deepLinkForMatch("m1")).toBe("/matches?focus=m1");
    expect(deepLinkForOpportunity("o1")).toBe("/opportunities?focus=o1");
    expect(deepLinkForReveal("r1")).toBe("/reveals/r1");
    expect(deepLinkForVehicle("v1", { enrich: true })).toContain("enrich=1");
  });

  it("blocks open redirects", () => {
    expect(isSafeInternalPath("//evil.com")).toBe(false);
    expect(isSafeInternalPath("https://evil.com")).toBe(false);
    expect(isSafeInternalPath("/matches?focus=x")).toBe(true);
    expect(sanitizeReturnPath("//evil")).toBeNull();
    expect(sanitizeReturnPath("/opportunities?focus=1")).toBe(
      "/opportunities?focus=1"
    );
  });

  it("login return uses sanitized callback only", () => {
    const user = {
      emailVerifiedAt: new Date(),
      verificationStatus: "VERIFIED",
      dealerId: "d1",
    };
    expect(getPostAuthRedirect(user, "/matches?focus=abc")).toBe(
      "/matches?focus=abc"
    );
    expect(getPostAuthRedirect(user, "//evil")).toBe("/home");
  });

  it("pages consume focus params", () => {
    expect(read("src/app/(dealer)/matches/page.tsx")).toContain("focusId");
    expect(read("src/app/(dealer)/opportunities/page.tsx")).toContain("focusId");
    expect(read("src/app/(dealer)/inventory/page.tsx")).toContain(
      'searchParams.get("focus")'
    );
    expect(read("src/app/(dealer)/validations/page.tsx")).toContain("focusId");
  });

  it("dealer layout preserves callbackUrl when logged out", () => {
    const layout = read("src/app/(dealer)/layout.tsx");
    expect(layout).toContain("callbackUrl");
    expect(layout).toContain("sanitizeReturnPath");
  });

  it("push links must be safe internal paths", () => {
    expect(
      validatePushContent({
        title: "t",
        body: "b",
        link: "/matches?focus=1",
      }).ok
    ).toBe(true);
    expect(
      validatePushContent({
        title: "t",
        body: "b",
        link: "//evil.com",
      }).ok
    ).toBe(false);
  });
  it("push payload validation rejects private commercial fields by design (link-only destinations)", () => {
    const push = read("src/services/notifications/push.ts");
    expect(push).toContain("isSafeInternalPath");
    // Payload shape is title/body/link — no b2bPrice/budget fields
    expect(push).not.toMatch(/payload\.(b2bPrice|budget|sellerFloor)/);
  });
});

describe("No Dealer Readiness authorization", () => {
  it("does not introduce READY/NOT_READY domain gates", () => {
    const layout = read("src/app/(dealer)/layout.tsx");
    expect(layout).not.toMatch(/NOT_READY|READY_DEALER|DealerReadiness/);
    const matching = read("src/services/domain/matching-flow.ts");
    expect(matching).not.toMatch(/NOT_READY|requireInventoryBeforeDemand/);
  });

  it("inventory-only and demand-only remain permitted conceptually", () => {
    // Authorization remains verification-based only
    const routing = read("src/lib/auth-routing.ts");
    expect(routing).toContain("verificationStatus === \"VERIFIED\"");
    expect(routing).not.toContain("FIRST_INVENTORY");
  });
});

describe("Activation milestones", () => {
  it("TEST emails are centralized", () => {
    expect(TEST_ACCOUNT_EMAILS).toContain("galsamama@gmail.com");
    expect(TEST_ACCOUNT_EMAILS).toContain("irasamama@gmail.com");
    expect(isTestAccountEmail("galsamama@gmail.com")).toBe(true);
    expect(isTestAccountEmail("dealer@example.com")).toBe(false);
  });

  it("milestone recorder uses append-only idempotency keys", () => {
    const src = read("src/services/activation/milestones.ts");
    expect(src).toContain("activation:");
    expect(src).toContain("idempotencyKey");
    expect(src).toContain("FIRST_MATCH_PRESENTED");
  });

  it("milestones wired into domain flows", () => {
    expect(read("src/services/domain/matching-flow.ts")).toContain(
      "recordActivationMilestone"
    );
    expect(read("src/app/api/auth/signup/route.ts")).toContain(
      "recordActivationMilestone"
    );
  });
});

describe("Production resilience", () => {
  it("health exposes db + migrations + kill switches without secrets", () => {
    const health = read("src/app/api/health/route.ts");
    expect(health).toContain("migrationsApplied");
    expect(health).toContain("pushConfigured");
    expect(health).toContain("killSwitches");
    expect(health).not.toMatch(/DATABASE_URL|password|gmail\.com/);
  });

  it("lifecycle catch-up exists and is idempotent-oriented", () => {
    expect(existsSync(join(root, "src/services/ops/lifecycle-catchup.ts"))).toBe(
      true
    );
    expect(existsSync(join(root, "src/app/api/cron/lifecycle/route.ts"))).toBe(
      true
    );
    const catchup = read("src/services/ops/lifecycle-catchup.ts");
    expect(catchup).toContain("expireStaleDemands");
    expect(catchup).toContain("runSmartReminders");
  });

  it("migration preflight scans local migrations", () => {
    const list = listLocalMigrations(root);
    expect(list.length).toBeGreaterThan(5);
    const result = runMigrationPreflight({ root, skipStatus: true });
    expect(result.localMigrations.length).toBe(list.length);
    expect(Array.isArray(result.destructive)).toBe(true);
    // scanDestructiveSql callable
    expect(scanDestructiveSql(root)).toEqual(result.destructive);
  });

  it("ops runbooks exist", () => {
    expect(existsSync(join(root, "docs/ops/BACKUP_REALITY.md"))).toBe(true);
    expect(existsSync(join(root, "docs/ops/RESTORE_RUNBOOK.md"))).toBe(true);
    expect(existsSync(join(root, "docs/ops/ROLLBACK.md"))).toBe(true);
  });

  it("kill switch defaults off", () => {
    const state = getKillSwitchState();
    expect(state.push).toBe(false);
    expect(state.matching_new).toBe(false);
  });
});

describe("Exchange regression anchors", () => {
  it("preserves rematch hotfix and controlled intelligence", () => {
    const info = read("src/services/matching/information-request.ts");
    expect(info).toContain("Always re-evaluate related active demands");
    const flow = read("src/services/domain/matching-flow.ts");
    expect(flow).toContain("applyControlledIntelligenceRanking");
  });
});

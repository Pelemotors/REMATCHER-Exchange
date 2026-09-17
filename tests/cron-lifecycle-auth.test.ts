import { describe, expect, it } from "vitest";
import { isLifecycleCatchUpAuthorized } from "@/services/ops/cron-auth";

const base = {
  authorizationHeader: null as string | null,
  vercelCronHeader: null as string | null,
  lifecycleCatchupHeader: null as string | null,
  cronSecret: undefined as string | undefined,
  nodeEnv: "production" as string | undefined,
  vercelEnv: undefined as string | undefined,
  adminSession: false,
};

describe("lifecycle cron auth (B18)", () => {
  it("accepts CRON_SECRET bearer", () => {
    expect(
      isLifecycleCatchUpAuthorized({
        ...base,
        cronSecret: "s3cret",
        authorizationHeader: "Bearer s3cret",
      })
    ).toBe(true);
  });

  it("rejects spoofed x-vercel-cron on VPS (no VERCEL_ENV)", () => {
    expect(
      isLifecycleCatchUpAuthorized({
        ...base,
        vercelCronHeader: "1",
      })
    ).toBe(false);
  });

  it("accepts Vercel platform cron when VERCEL_ENV is set", () => {
    expect(
      isLifecycleCatchUpAuthorized({
        ...base,
        vercelEnv: "production",
        vercelCronHeader: "1",
      })
    ).toBe(true);
  });

  it("allows admin session fallback", () => {
    expect(
      isLifecycleCatchUpAuthorized({
        ...base,
        adminSession: true,
      })
    ).toBe(true);
  });

  it("allows non-production catchup header", () => {
    expect(
      isLifecycleCatchUpAuthorized({
        ...base,
        nodeEnv: "test",
        lifecycleCatchupHeader: "1",
      })
    ).toBe(true);
  });
});

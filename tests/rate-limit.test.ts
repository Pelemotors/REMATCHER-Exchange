import { describe, it, expect, beforeEach } from "vitest";
import {
  checkForgotPassword,
  checkSignup,
  clearAllLoginBlocksForEmail,
  isLoginBlocked,
  recordFailedLogin,
} from "@/lib/rate-limit";

describe("Rate limiter", () => {
  beforeEach(async () => {
    await clearAllLoginBlocksForEmail("test@example.com");
    await clearAllLoginBlocksForEmail("other@example.com");
  });

  it("blocks after repeated failed logins per email", async () => {
    const email = "test@example.com";
    expect(await isLoginBlocked(email)).toBe(false);

    for (let i = 0; i < 8; i++) {
      await recordFailedLogin(email);
    }

    expect(await isLoginBlocked(email)).toBe(true);
  });

  it("does not block a different email on same IP pattern", async () => {
    const ip = "1.2.3.4";
    for (let i = 0; i < 8; i++) {
      await recordFailedLogin("test@example.com", ip);
    }

    expect(await isLoginBlocked("test@example.com", ip)).toBe(true);
    expect(await isLoginBlocked("other@example.com", ip)).toBe(false);
  });

  it("clears login blocks for email", async () => {
    const email = "test@example.com";
    for (let i = 0; i < 8; i++) {
      await recordFailedLogin(email);
    }
    await clearAllLoginBlocksForEmail(email);
    expect(await isLoginBlocked(email)).toBe(false);
  });

  it("uses separate signup bucket", async () => {
    const email = "test@example.com";
    const ip = "9.9.9.9";

    for (let i = 0; i < 5; i++) {
      const result = await checkSignup(email, ip);
      expect(result.blocked).toBe(false);
    }

    const blocked = await checkSignup(email, ip);
    expect(blocked.blocked).toBe(true);
    expect(await isLoginBlocked(email, ip)).toBe(false);
  });

  it("uses separate forgot-password bucket", async () => {
    const email = "test@example.com";
    for (let i = 0; i < 5; i++) {
      await checkForgotPassword(email);
    }
    const blocked = await checkForgotPassword(email);
    expect(blocked.blocked).toBe(true);
    expect(await isLoginBlocked(email)).toBe(false);
  });
});

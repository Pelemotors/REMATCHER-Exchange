import { describe, it, expect, beforeEach } from "vitest";
import {
  checkForgotPassword,
  checkSignup,
  clearAllLoginBlocksForEmail,
  isLoginBlocked,
  recordFailedLogin,
} from "@/lib/rate-limit";

describe("Rate limiter", () => {
  beforeEach(() => {
    clearAllLoginBlocksForEmail("test@example.com");
    clearAllLoginBlocksForEmail("other@example.com");
  });

  it("blocks after repeated failed logins per email", () => {
    const email = "test@example.com";
    expect(isLoginBlocked(email)).toBe(false);

    for (let i = 0; i < 8; i++) {
      recordFailedLogin(email);
    }

    expect(isLoginBlocked(email)).toBe(true);
  });

  it("does not block a different email on same IP pattern", () => {
    const ip = "1.2.3.4";
    for (let i = 0; i < 8; i++) {
      recordFailedLogin("test@example.com", ip);
    }

    expect(isLoginBlocked("test@example.com", ip)).toBe(true);
    expect(isLoginBlocked("other@example.com", ip)).toBe(false);
  });

  it("clears login blocks for email", () => {
    const email = "test@example.com";
    for (let i = 0; i < 8; i++) {
      recordFailedLogin(email);
    }
    clearAllLoginBlocksForEmail(email);
    expect(isLoginBlocked(email)).toBe(false);
  });

  it("uses separate signup bucket", () => {
    const email = "test@example.com";
    const ip = "9.9.9.9";

    for (let i = 0; i < 5; i++) {
      const result = checkSignup(email, ip);
      expect(result.blocked).toBe(false);
    }

    const blocked = checkSignup(email, ip);
    expect(blocked.blocked).toBe(true);
    expect(isLoginBlocked(email, ip)).toBe(false);
  });

  it("uses separate forgot-password bucket", () => {
    const email = "test@example.com";
    for (let i = 0; i < 5; i++) {
      checkForgotPassword(email);
    }
    const blocked = checkForgotPassword(email);
    expect(blocked.blocked).toBe(true);
    expect(isLoginBlocked(email)).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CANONICAL_APP_URL,
  getTransactionalEmailBaseUrl,
} from "@/config/app";

describe("transactional email URLs", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses canonical URL in production regardless of NEXT_PUBLIC_APP_URL", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://rematcher-exchange.vercel.app";
    expect(getTransactionalEmailBaseUrl()).toBe(CANONICAL_APP_URL);
    expect(getTransactionalEmailBaseUrl()).not.toContain("vercel.app");
  });

  it("uses local URL in development when env is not vercel.app", () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(getTransactionalEmailBaseUrl()).toBe("http://localhost:3000");
  });

  it("falls back to AUTH_URL in development when NEXT_PUBLIC_APP_URL is vercel.app", () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_APP_URL = "https://rematcher-exchange.vercel.app";
    process.env.AUTH_URL = "http://localhost:3000";
    expect(getTransactionalEmailBaseUrl()).toBe("http://localhost:3000");
  });
});

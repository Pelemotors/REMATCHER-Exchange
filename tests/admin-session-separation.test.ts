import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isAdminRole } from "@/lib/brand-copy";
import { getPostAuthRedirect } from "@/lib/auth-routing";

const mockAdminAuth = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  adminAuth: (...args: unknown[]) => mockAdminAuth(...args),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/services/entitlements", () => ({
  assertEntitled: vi.fn(),
  ensureEntitlementOnDealerAccess: vi.fn(),
  EntitlementError: class EntitlementError extends Error {},
}));

vi.mock("@/services/product-policy", () => ({
  isMonetizationEnabled: vi.fn(async () => false),
}));

describe("admin session separation", () => {
  beforeEach(() => {
    mockAdminAuth.mockReset();
  });

  it("requireAdminSession rejects when only dealer-shaped session exists (no admin cookie)", async () => {
    mockAdminAuth.mockResolvedValueOnce(null);
    const { requireAdminSession } = await import("@/lib/auth-guards");
    const result = await requireAdminSession();
    expect(result).toEqual({ error: "Unauthorized", status: 401 });
  });

  it("requireAdminSession rejects dealer role even if somehow present on admin cookie", async () => {
    mockAdminAuth.mockResolvedValueOnce({
      user: {
        id: "dealer-user-1",
        email: "galsamama@gmail.com",
        role: "DEALER_USER",
        dealerId: "d1",
      },
    });
    const { requireAdminSession } = await import("@/lib/auth-guards");
    const result = await requireAdminSession();
    expect(result).toEqual({ error: "Forbidden", status: 403 });
  });

  it("requireAdminSession accepts platform ADMIN on admin session", async () => {
    const session = {
      user: {
        id: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        dealerId: null,
      },
    };
    mockAdminAuth.mockResolvedValueOnce(session);
    const { requireAdminSession } = await import("@/lib/auth-guards");
    const result = await requireAdminSession();
    expect(result).toEqual({ session });
  });

  it("auth-routing never sends DEALER_USER to /admin", () => {
    expect(
      getPostAuthRedirect({
        role: "DEALER_USER",
        dealerId: "d1",
        emailVerifiedAt: new Date().toISOString(),
        verificationStatus: "VERIFIED",
      })
    ).toBe("/home");

    expect(
      getPostAuthRedirect({
        role: "DEALER_USER",
        dealerId: null,
        emailVerifiedAt: new Date().toISOString(),
        verificationStatus: "PENDING",
      })
    ).not.toBe("/admin");

    expect(
      getPostAuthRedirect({
        role: "ADMIN",
        dealerId: null,
        emailVerifiedAt: new Date().toISOString(),
        verificationStatus: null,
      })
    ).not.toBe("/admin");
  });

  it("isAdminRole still works for platform ADMIN enum", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("DEALER_USER")).toBe(false);
  });

  it("reserved: dealer OWNER membership role is not system admin", () => {
    // MembershipRole.OWNER ≠ UserRole.ADMIN
    expect(isAdminRole("OWNER")).toBe(false);
    expect(isAdminRole("MEMBER")).toBe(false);
    expect(isAdminRole("ADMIN")).toBe(true);
  });

  it("admin login form rejects dealer emails with a dedicated message", () => {
    const form = readFileSync(
      resolve(process.cwd(), "src/components/admin/admin-login-form.tsx"),
      "utf8"
    );
    expect(form).toContain("/api/admin/login-hint");
    expect(form).toContain("dealer_not_admin");
    expect(form).toContain("חשבון סוחר לא נכנס כאן");
    expect(form).toContain('href="/login"');
  });
});

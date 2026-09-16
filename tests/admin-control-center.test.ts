import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { catalogSlugFromHost } from "@/services/catalog/slug";
import { ADMIN_SEARCH_TYPE_LABEL } from "@/services/admin/search-types";
import { ADMIN_NAV } from "@/components/admin/admin-nav";

const {
  mockCatalogFindUnique,
  mockRequireAdmin,
  mockUserFindUnique,
  mockUserUpdate,
} = vi.hoisted(() => ({
  mockCatalogFindUnique: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealerCatalog: { findUnique: (...args: unknown[]) => mockCatalogFindUnique(...args) },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
      count: vi.fn().mockResolvedValue(0),
    },
    intakeBatch: { count: vi.fn().mockResolvedValue(0) },
    dealer: { count: vi.fn().mockResolvedValue(0) },
  },
}));

vi.mock("@/lib/auth-guards", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdmin(...args),
}));

vi.mock("@/services/notifications", () => ({
  logAppEvent: vi.fn().mockResolvedValue({ created: true }),
}));

vi.mock("@/services/email", () => ({
  sendUserVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/services/auth/verification-tokens", () => ({
  createEmailVerificationToken: vi.fn().mockResolvedValue("token"),
}));

describe("admin control center nav", () => {
  it("covers operational domains required for Control Center", () => {
    const hrefs = ADMIN_NAV.map((n) => n.href);
    for (const href of [
      "/admin",
      "/admin/attention",
      "/admin/search",
      "/admin/dealers",
      "/admin/users",
      "/admin/customers",
      "/admin/demands",
      "/admin/vehicles",
      "/admin/catalogs",
      "/admin/matches",
      "/admin/intakes",
      "/admin/opportunities",
      "/admin/interest",
      "/admin/audit",
      "/admin/system",
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("does not add admin navigation into dealer app chrome", () => {
    const dealerNav = readFileSync(
      resolve(process.cwd(), "src/config/mobile-nav.ts"),
      "utf8"
    );
    const shell = readFileSync(
      resolve(process.cwd(), "src/components/layout/app-shell.tsx"),
      "utf8"
    );
    expect(dealerNav).not.toContain("/admin");
    expect(shell).not.toContain('href: "/admin"');
  });
});

describe("admin search labels", () => {
  it("labels entity types in Hebrew", () => {
    expect(ADMIN_SEARCH_TYPE_LABEL.user).toBe("משתמש");
    expect(ADMIN_SEARCH_TYPE_LABEL.dealer).toBe("סוחר");
    expect(ADMIN_SEARCH_TYPE_LABEL.vehicle).toBe("רכב");
    expect(ADMIN_SEARCH_TYPE_LABEL.catalog).toBe("קטלוג");
  });
});

describe("catalog tls-ask", () => {
  beforeEach(() => {
    mockCatalogFindUnique.mockReset();
  });

  it("rejects reserved and unknown hosts", async () => {
    const { GET } = await import("@/app/api/catalog/tls-ask/route");
    const reserved = await GET(
      new Request("http://127.0.0.1:3200/api/catalog/tls-ask?domain=exchange.rematcher.co.il")
    );
    expect(reserved.status).toBe(404);
    expect(mockCatalogFindUnique).not.toHaveBeenCalled();

    mockCatalogFindUnique.mockResolvedValueOnce(null);
    const missing = await GET(
      new Request("http://127.0.0.1:3200/api/catalog/tls-ask?domain=unknown-slug.rematcher.co.il")
    );
    expect(missing.status).toBe(404);
  });

  it("allows an existing catalog slug host", async () => {
    mockCatalogFindUnique.mockResolvedValueOnce({ id: "cat-1" });
    const { GET } = await import("@/app/api/catalog/tls-ask/route");
    const ok = await GET(
      new Request("http://127.0.0.1:3200/api/catalog/tls-ask?domain=galeria-test.rematcher.co.il")
    );
    expect(ok.status).toBe(200);
    expect(catalogSlugFromHost("galeria-test.rematcher.co.il")).toBe("galeria-test");
  });
});

describe("admin APIs", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockUserFindUnique.mockReset();
    mockUserUpdate.mockReset();
  });

  it("denies search without admin session", async () => {
    mockRequireAdmin.mockResolvedValueOnce({ error: "Unauthorized", status: 401 });
    const { GET } = await import("@/app/api/admin/search/route");
    const res = await GET(new Request("http://localhost/api/admin/search?q=gal"));
    expect(res.status).toBe(401);
  });

  it("refuses to suspend a System Admin user", async () => {
    mockRequireAdmin.mockResolvedValueOnce({
      session: { user: { id: "admin-1", role: "ADMIN" } },
    });
    mockUserFindUnique.mockResolvedValueOnce({ id: "admin-2", role: "ADMIN" });
    const { POST } = await import("@/app/api/admin/users/[id]/status/route");
    const res = await POST(
      new Request("http://localhost/api/admin/users/admin-2/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SUSPENDED" }),
      }),
      { params: Promise.resolve({ id: "admin-2" }) }
    );
    expect(res.status).toBe(403);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});

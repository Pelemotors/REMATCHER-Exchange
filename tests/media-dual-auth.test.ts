import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const principalA = {
  userId: "user-a",
  dealerId: "dealer-a",
  email: "a@example.com",
  name: "A",
  dealerName: "Dealer A",
  verificationStatus: "VERIFIED",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  accountStatus: "ACTIVE",
  dealerActive: true,
};

const principalB = {
  ...principalA,
  userId: "user-b",
  dealerId: "dealer-b",
  email: "b@example.com",
};

vi.mock("@/services/identity/mobile-session", () => ({
  resolveMobileAccess: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

const findFirstVehicleMedia = vi.fn();
const findFirstMatch = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicleMedia: { findFirst: (...args: unknown[]) => findFirstVehicleMedia(...args) },
    candidateMatch: { findFirst: (...args: unknown[]) => findFirstMatch(...args) },
  },
}));

import { resolveMobileAccess } from "@/services/identity/mobile-session";
import { auth } from "@/lib/auth";
import { GET as mediaGet } from "@/app/api/media/[...key]/route";

let mediaRoot: string;

function writeMediaFile(rel: string, bytes = Buffer.from("webp-bytes")) {
  const abs = path.join(mediaRoot, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
}

function paramsFor(key: string) {
  return { params: Promise.resolve({ key: key.split("/") }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mediaRoot = path.join(os.tmpdir(), `rematcher-media-test-${Date.now()}`);
  mkdirSync(mediaRoot, { recursive: true });
  process.env.MEDIA_ROOT = mediaRoot;
  vi.mocked(auth).mockResolvedValue(null as never);
  vi.mocked(resolveMobileAccess).mockResolvedValue({
    ok: true,
    principal: principalA,
    sessionId: "sess-a",
  });
  findFirstVehicleMedia.mockResolvedValue(null);
  findFirstMatch.mockResolvedValue(null);
});

afterEach(() => {
  try {
    rmSync(mediaRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("GET /api/media dual auth", () => {
  it("returns 401 without cookie or bearer", async () => {
    const res = await mediaGet(
      new Request("http://local/api/media/vehicles/x/y/display-a.webp"),
      paramsFor("vehicles/x/y/display-a.webp")
    );
    expect(res.status).toBe(401);
  });

  it("Web owner cookie → 200", async () => {
    const key = "vehicles/dealer-a/v1/display-aaaa.webp";
    writeMediaFile(key);
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-a", dealerId: "dealer-a" },
    } as never);
    findFirstVehicleMedia.mockResolvedValue({
      storageKey: key,
      mimeType: "image/webp",
      vehicle: { id: "v1", dealerId: "dealer-a" },
    });
    const res = await mediaGet(
      new Request(`http://local/api/media/${key}`),
      paramsFor(key)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("Mobile owner Bearer → 200", async () => {
    const key = "vehicles/dealer-a/v1/display-bbbb.webp";
    writeMediaFile(key);
    findFirstVehicleMedia.mockResolvedValue({
      storageKey: key,
      mimeType: "image/webp",
      vehicle: { id: "v1", dealerId: "dealer-a" },
    });
    const res = await mediaGet(
      new Request(`http://local/api/media/${key}`, {
        headers: { authorization: "Bearer access-a", "x-request-id": "req_m" },
      }),
      paramsFor(key)
    );
    expect(res.status).toBe(200);
    expect(resolveMobileAccess).toHaveBeenCalled();
  });

  it("Mobile buyer with buyer-visible match → 200", async () => {
    const key = "vehicles/dealer-a/v1/display-cccc.webp";
    writeMediaFile(key);
    vi.mocked(resolveMobileAccess).mockResolvedValue({
      ok: true,
      principal: principalB,
      sessionId: "sess-b",
    });
    findFirstVehicleMedia.mockResolvedValue({
      storageKey: key,
      mimeType: "image/webp",
      vehicle: { id: "v1", dealerId: "dealer-a" },
    });
    findFirstMatch.mockResolvedValue({ id: "match-1" });
    const res = await mediaGet(
      new Request(`http://local/api/media/${key}`, {
        headers: { authorization: "Bearer buyer-token" },
      }),
      paramsFor(key)
    );
    expect(res.status).toBe(200);
  });

  it("wrong dealer → 403", async () => {
    const key = "vehicles/dealer-a/v1/display-dddd.webp";
    writeMediaFile(key);
    vi.mocked(resolveMobileAccess).mockResolvedValue({
      ok: true,
      principal: principalB,
      sessionId: "sess-b",
    });
    findFirstVehicleMedia.mockResolvedValue({
      storageKey: key,
      mimeType: "image/webp",
      vehicle: { id: "v1", dealerId: "dealer-a" },
    });
    findFirstMatch.mockResolvedValue(null);
    const res = await mediaGet(
      new Request(`http://local/api/media/${key}`, {
        headers: { authorization: "Bearer other" },
      }),
      paramsFor(key)
    );
    expect(res.status).toBe(403);
  });

  it("expired token → 401 AUTH_TOKEN_EXPIRED", async () => {
    vi.mocked(resolveMobileAccess).mockResolvedValue({
      ok: false,
      code: "AUTH_TOKEN_EXPIRED",
    });
    const res = await mediaGet(
      new Request("http://local/api/media/vehicles/a/b/display-x.webp", {
        headers: { authorization: "Bearer expired", "x-request-id": "req_exp" },
      }),
      paramsFor("vehicles/a/b/display-x.webp")
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("AUTH_TOKEN_EXPIRED");
  });

  it("revoked token → 401 AUTH_TOKEN_REVOKED", async () => {
    vi.mocked(resolveMobileAccess).mockResolvedValue({
      ok: false,
      code: "AUTH_TOKEN_REVOKED",
    });
    const res = await mediaGet(
      new Request("http://local/api/media/vehicles/a/b/display-x.webp", {
        headers: { authorization: "Bearer revoked" },
      }),
      paramsFor("vehicles/a/b/display-x.webp")
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("AUTH_TOKEN_REVOKED");
  });

  it("intake media same dealer → 200", async () => {
    const key = "intake/dealer-a/batch1/display-eeee.webp";
    writeMediaFile(key);
    const res = await mediaGet(
      new Request(`http://local/api/media/${key}`, {
        headers: { authorization: "Bearer access-a" },
      }),
      paramsFor(key)
    );
    expect(res.status).toBe(200);
  });

  it("intake media different dealer → 403", async () => {
    const key = "intake/dealer-a/batch1/display-ffff.webp";
    writeMediaFile(key);
    vi.mocked(resolveMobileAccess).mockResolvedValue({
      ok: true,
      principal: principalB,
      sessionId: "sess-b",
    });
    const res = await mediaGet(
      new Request(`http://local/api/media/${key}`, {
        headers: { authorization: "Bearer b" },
      }),
      paramsFor(key)
    );
    expect(res.status).toBe(403);
  });

  it("unknown key → 404", async () => {
    findFirstVehicleMedia.mockResolvedValue(null);
    const res = await mediaGet(
      new Request("http://local/api/media/vehicles/dealer-a/v1/display-missing.webp", {
        headers: { authorization: "Bearer access-a" },
      }),
      paramsFor("vehicles/dealer-a/v1/display-missing.webp")
    );
    expect(res.status).toBe(404);
  });

  it("invalid traversal key → denied", async () => {
    const res = await mediaGet(
      new Request("http://local/api/media/vehicles/../secret", {
        headers: { authorization: "Bearer access-a" },
      }),
      paramsFor("vehicles/../secret")
    );
    expect(res.status).toBe(404);
  });
});

describe("AASA static asset", () => {
  it("contains real TeamID.BundleID and no TEAMID placeholder", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raw = readFileSync(
      join(process.cwd(), "public/.well-known/apple-app-site-association"),
      "utf8"
    );
    expect(raw).toContain("629JS257F5.co.rematcher.exchange");
    expect(raw).not.toContain("TEAMID.");
  });
});

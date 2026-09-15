import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  buildVehicleMediaKeyPair,
  resolveMediaAbsolutePath,
  thumbKeyFromDisplayKey,
} from "@/lib/media/storage";

const root = process.cwd();

describe("vehicle media storage keys", () => {
  it("builds unpredictable keys under dealer/vehicle namespace", () => {
    const a = buildVehicleMediaKeyPair({
      dealerId: "d1",
      vehicleId: "v1",
      ext: "webp",
    });
    const b = buildVehicleMediaKeyPair({
      dealerId: "d1",
      vehicleId: "v1",
      ext: "webp",
    });
    expect(a.displayKey).toMatch(/^vehicles\/d1\/v1\/display-[a-f0-9]{32}\.webp$/);
    expect(a.thumbKey).toMatch(/^vehicles\/d1\/v1\/thumb-[a-f0-9]{32}\.webp$/);
    expect(a.displayKey).not.toEqual(b.displayKey);
  });

  it("rejects path traversal in storage keys", () => {
    expect(() => resolveMediaAbsolutePath("../etc/passwd")).toThrow(
      /INVALID_STORAGE_KEY/
    );
    expect(() => resolveMediaAbsolutePath("/abs/path")).toThrow(
      /INVALID_STORAGE_KEY/
    );
    expect(() => resolveMediaAbsolutePath("vehicles/../secret")).toThrow(
      /INVALID_STORAGE_KEY/
    );
  });

  it("derives thumb key from display key", () => {
    expect(
      thumbKeyFromDisplayKey("vehicles/d/v/display-abc.webp")
    ).toBe("vehicles/d/v/thumb-abc.webp");
  });
});

describe("vehicle media schema + API surface", () => {
  it("defines VehicleMedia model and mediaReady on Vehicle", () => {
    const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model VehicleMedia");
    expect(schema).toContain("mediaReady");
    expect(schema).toContain("EXTERIOR");
    expect(schema).toContain("INTERIOR");
  });

  it("ships migration with grandfather default true", () => {
    const mig = readFileSync(
      join(
        root,
        "prisma/migrations/20260914230000_vehicle_media/migration.sql"
      ),
      "utf8"
    );
    expect(mig).toContain('ADD COLUMN "mediaReady" BOOLEAN NOT NULL DEFAULT true');
    expect(mig).toContain("VehicleMedia");
  });

  it("upload route requires auth and ownership service", () => {
    const route = readFileSync(
      join(root, "src/app/api/inventory/media/route.ts"),
      "utf8"
    );
    expect(route).toContain("auth()");
    expect(route).toContain("uploadVehicleImageForDealer");
    expect(route).toContain("setPrimaryVehicleMediaForDealer");
    expect(route).toContain("reorderVehicleMediaForDealer");
  });

  it("media serve uses BUYER_VISIBLE_MATCH_WHERE for buyers", () => {
    const route = readFileSync(
      join(root, "src/app/api/media/[...key]/route.ts"),
      "utf8"
    );
    expect(route).toContain("BUYER_VISIBLE_MATCH_WHERE");
    expect(route).toContain("dealerId");
  });

  it("new vehicles gate rematch on mediaReady", () => {
    const create = readFileSync(
      join(root, "src/services/inventory/create-vehicle.ts"),
      "utf8"
    );
    expect(create).toContain("mediaReady: false");
    expect(create).not.toContain('mediaReady: input.source === "import"');
    expect(create).toContain("vehicle.mediaReady");
  });

  it("buyer match list omits scoreBand and explanation", () => {
    const src = readFileSync(
      join(root, "src/services/matching/list-buyer-matches.ts"),
      "utf8"
    );
    expect(src).toContain("Buyer-facing match DTO");
    expect(src).not.toMatch(/scoreBand:\s*m\.scoreBand/);
    expect(src).not.toMatch(/explanation:\s*m\.explanationJson/);
    expect(src).not.toContain("scoreBand: string");
  });

  it("matching only considers mediaReady vehicles", () => {
    const flow = readFileSync(
      join(root, "src/services/domain/matching-flow.ts"),
      "utf8"
    );
    expect(flow).toContain("mediaReady: true");
  });

  it("buyer match view may expose imageUrl but not dealerId/b2bPrice", () => {
    const views = readFileSync(join(root, "src/lib/privacy-views.ts"), "utf8");
    expect(views).toContain("imageUrl");
    expect(views).toContain("Explicitly omit");
    expect(views).not.toMatch(/return \{[\s\S]*dealerId:/);
  });

  it("inventory and search UIs use thumbUrl/imageUrl with placeholder fallback", () => {
    const inv = readFileSync(
      join(root, "src/components/inventory/inventory-page-client.tsx"),
      "utf8"
    );
    expect(inv).toContain("VehicleMediaPanel");
    expect(inv).toContain("thumbUrl");
    expect(inv).toContain("חסרות תמונות");

    const demand = readFileSync(
      join(root, "src/components/demand/demand-page-client.tsx"),
      "utf8"
    );
    expect(demand).toContain("imageUrl");
    expect(demand).toContain("thumbImg");
  });

  it("documents MEDIA_ROOT in env example", () => {
    const env = readFileSync(join(root, ".env.example"), "utf8");
    expect(env).toContain("MEDIA_ROOT");
    expect(env).toContain("MEDIA_PUBLIC_BASE_URL");
  });

  it("sharp is a direct dependency", () => {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8")
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.sharp).toBeTruthy();
    expect(existsSync(join(root, "src/lib/media/process.ts"))).toBe(true);
  });
});

describe("navigation simplification", () => {
  it("primary nav is home / searches / inventory", async () => {
    const { MOBILE_BOTTOM_NAV_ITEMS, SECONDARY_NAV_ITEMS } = await import(
      "@/config/mobile-nav"
    );
    expect(MOBILE_BOTTOM_NAV_ITEMS.map((i) => i.href)).toEqual([
      "/home",
      "/demand",
      "/inventory",
    ]);
    expect(SECONDARY_NAV_ITEMS.some((i) => i.href === "/activity")).toBe(true);
    expect(
      MOBILE_BOTTOM_NAV_ITEMS.map((i) => i.href as string).includes("/activity")
    ).toBe(false);
  });
});

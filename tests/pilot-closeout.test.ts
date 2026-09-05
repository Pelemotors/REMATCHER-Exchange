import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  isDealerMemoryRuntimeEnabled,
  getKillSwitchState,
} from "@/config/kill-switches";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Pilot closeout — confirmed bugs", () => {
  it("Agent inventory uses DB count not take length", () => {
    const src = read("src/services/assistant/tools/read-tools.ts");
    expect(src).toContain("prisma.vehicle.count");
    expect(src).toMatch(/activeCount[\s\S]*totalCount/);
    expect(src).not.toMatch(
      /getMyInventory:[\s\S]{0,400}activeCount:\s*vehicles\.length/
    );
  });

  it("Mark Sold is canonical and durable with lifecycle", () => {
    const mark = read("src/services/inventory/mark-sold.ts");
    expect(mark).toContain("$transaction");
    expect(mark).toContain("VEHICLE_SOLD");
    expect(mark).toContain("applyVehicleSoldLifecycle");
    expect(mark).not.toContain("// non-blocking");

    const validation = read("src/services/domain/matching-flow.ts");
    expect(validation).toContain("markVehicleSoldForDealer");
    expect(validation).not.toMatch(
      /if \(!available\) \{[\s\S]{0,200}prisma\.vehicle\.update/
    );
  });

  it("generic update cannot set SOLD or silently reactivate", () => {
    const upd = read("src/services/inventory/update-vehicle.ts");
    expect(upd).toContain("reactivateVehicleForDealer");
    expect(upd).toContain('status?: "ARCHIVED"');
    expect(upd).not.toMatch(/f\.status === "SOLD"/);
    expect(upd).toContain("Edited now ≠ availability");
  });

  it("INVENTORY_ADDED is not swallowed after create", () => {
    const create = read("src/services/inventory/create-vehicle.ts");
    expect(create).toContain("INVENTORY_ADDED");
    expect(create).not.toMatch(
      /INVENTORY_ADDED[\s\S]{0,200}catch \{\s*\/\/ non-blocking/
    );
  });

  it("Inventory filter all is not forced to ACTIVE-only client-side", () => {
    const page = read("src/app/(dealer)/inventory/page.tsx");
    expect(page).not.toMatch(
      /else \{\s*list = list\.filter\(\(v\) => v\.status === "ACTIVE"\)/
    );
    expect(page).toContain('id: "all"');
    expect(page).not.toContain('href: "#"');
  });

  it("Inventory API exposes authoritative totals + pagination", () => {
    const api = read("src/app/api/inventory/route.ts");
    expect(api).toContain("totalCount");
    expect(api).toContain("prisma.vehicle.count");
    expect(api).toContain("patchSchema");
  });

  it("Dealer Memory is fail-closed unless ENABLE_DEALER_MEMORY", () => {
    expect(isDealerMemoryRuntimeEnabled()).toBe(false);
    expect(getKillSwitchState().dealer_memory).toBe(true);
  });

  it("reactivation idempotency key has no Date.now", () => {
    const upd = read("src/services/inventory/update-vehicle.ts");
    expect(upd).toContain("inventory-reactivated:${row.id}:${vehicle.status}");
    expect(upd).not.toMatch(/inventory-reactivated:\$\{[^}]*Date\.now/);
  });

  it("dealer loading UI exists for navigation feedback", () => {
    expect(read("src/app/(dealer)/loading.tsx")).toContain("SkeletonBlockV2");
  });
});

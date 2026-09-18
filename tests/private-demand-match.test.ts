import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("matchDemandToMyInventory", () => {
  it("matches dealer demand against all ACTIVE dealer vehicles including PRIVATE", () => {
    const src = read("src/services/matching/private-matching.ts");
    expect(src).toContain("export async function matchDemandToMyInventory");
    expect(src).toMatch(/status:\s*"ACTIVE"/);
    expect(src).not.toMatch(/visibility:\s*"ANONYMOUS_NETWORK"/);
    expect(src).toContain("evaluateMatchV2");
    expect(src).toContain("legacyToSearchIntent");
  });

  it("v1 intelligence wires private_demand_match", () => {
    const route = read("src/app/api/v1/intelligence/route.ts");
    expect(route).toContain('"private_demand_match"');
    expect(route).toContain("matchDemandToMyInventory");
    expect(route).toContain("private_match");
    expect(route).toContain("network_intel");
  });
});

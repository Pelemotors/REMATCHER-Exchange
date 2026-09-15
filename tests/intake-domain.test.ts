import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { extractCommercialFromText } from "@/services/intake/text-extract";
import {
  isValidIsraeliPlate,
  GOV_ACTIVE_PRIVATE_RESOURCE_ID,
} from "@/services/identity/gov-vehicle";
import { normalizePlate } from "@/services/intake/process-batch";

const root = process.cwd();

describe("intake text extraction", () => {
  it("extracts plate mileage and price with provenance", () => {
    const r = extractCommercialFromText(
      "טוסון 12-345-67 יד 2 85000 ק״מ מחיר 145000 ₪"
    );
    expect(r.plate?.value).toMatch(/^\d{7,8}$/);
    expect(r.fields.mileage).toBe(85000);
    expect(r.fields.askingPrice).toBe(145000);
    expect(r.provenance.mileage).toBeTruthy();
  });

  it("does not invent a plate when absent", () => {
    const r = extractCommercialFromText("יש לי טוסון לבן יפה");
    expect(r.plate).toBeUndefined();
  });
});

describe("gov plate helpers", () => {
  it("validates israeli plate digit lengths", () => {
    expect(isValidIsraeliPlate("1234567")).toBe(true);
    expect(isValidIsraeliPlate("12345678")).toBe(true);
    expect(isValidIsraeliPlate("12345")).toBe(false);
    expect(normalizePlate("12-345-67")).toBe("1234567");
  });

  it("documents official resource id", () => {
    expect(GOV_ACTIVE_PRIVATE_RESOURCE_ID).toMatch(
      /^[0-9a-f-]{36}$/i
    );
  });
});

describe("intake domain surface", () => {
  it("schema and API enforce dealer-scoped batch routes", () => {
    const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model IntakeBatch");
    expect(schema).toContain("model VehicleCandidate");
    expect(schema).toContain("IOS_SHARE");

    const route = readFileSync(
      join(root, "src/app/api/intake/batch/route.ts"),
      "utf8"
    );
    expect(route).toContain("requireVerifiedDealer");
    expect(route).toContain('action === "ack"');
  });

  it("buyer match DTO no longer returns scoreBand/explanation", () => {
    const src = readFileSync(
      join(root, "src/services/matching/list-buyer-matches.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/scoreBand:\s*m\.scoreBand/);
    expect(src).not.toContain("explanation: MatchExplanation");
  });

  it("new vehicles never bypass mediaReady via import source", () => {
    const create = readFileSync(
      join(root, "src/services/inventory/create-vehicle.ts"),
      "utf8"
    );
    expect(create).toContain("mediaReady: false");
    expect(create).not.toContain('mediaReady: input.source === "import"');
  });
});

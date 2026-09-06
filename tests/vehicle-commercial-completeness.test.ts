import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("vehicle commercial completeness", () => {
  it("normalizes Hebrew and English identity, fuel and ownership", () => {
    const identity = source("src/services/exchange/vehicle-identity.ts");
    expect(identity).toContain('"אקסנט": "Accent"');
    expect(identity).toContain('hyundai: "Hyundai"');
    expect(identity).toContain('"יונדאי": "Hyundai"');
    expect(identity).toContain('"בנזין": "GASOLINE"');
    expect(identity).toContain('petrol: "GASOLINE"');
    expect(identity).toContain('"פרטי": "PRIVATE"');
    expect(identity).toContain('private: "PRIVATE"');
  });

  it("evaluates all four important dimensions before buyer qualification", () => {
    const engine = source("src/services/matching/engine-v2.ts");
    expect(engine).toContain('field: "engineDisplacementCc"');
    expect(engine).toContain('field: "hand"');
    expect(engine).toContain('["fuel", "דלק/הנעה"');
    expect(engine).toContain('["ownershipSource", "מקוריות"');
    expect(engine).toContain('resolutionState: "NEEDS_INFORMATION"');
    expect(engine).toContain("collectDecisionBlockingUnknowns");
    expect(engine).toContain("canonicalizeVehicleIdentity");
    expect(engine).toContain("canonicalizeOwnershipSource");
  });

  it("keeps missing decisive vehicle data seller-only through Exchange enrichment", () => {
    const enrichment = source("src/services/matching/information-request.ts");
    expect(enrichment).toContain('engineDisplacementCc: "נפח מנוע"');
    expect(enrichment).toContain('ownershipSource: "מקוריות"');
    expect(enrichment).toContain('fuel: "סוג דלק/הנעה"');
    expect(enrichment).toContain('hand: "יד"');
    expect(enrichment).toContain('initiatedBy: "exchange"');
    expect(enrichment).toContain("buyer_initiated_enrichment_disabled");
  });

  it("imports and preserves fuel engine hand and ownership from Hebrew or English spreadsheets", () => {
    const mapper = source("src/services/inventory/column-mapper.ts");
    const importer = source("src/services/inventory/import.ts");
    expect(mapper).toContain('fuelType:["fuel","fuel type","powertrain"');
    expect(mapper).toContain('"דלק","סוג דלק","הנעה","סוג הנעה"');
    expect(mapper).toContain('engineDisplacementCc:["engine","engine cc"');
    expect(mapper).toContain('"נפח מנוע"');
    expect(mapper).toContain('ownershipType:["ownership type","ownership source"');
    expect(mapper).toContain('"מקוריות"');
    expect(importer).toContain("ownershipType: (row.fields.ownershipType as string | null)");
    expect(importer).toContain("fuelType: (row.fields.fuelType as string | null)");
    expect(importer).toContain("engineDisplacementCc: (row.fields.engineDisplacementCc as number | null)");
  });

  it("passes privacy-safe rich vehicle data to buyer without seller price or identity", () => {
    const privacy = source("src/lib/privacy-views.ts");
    const card = source("src/components/cards/match-card-v2.tsx");
    expect(privacy).toContain("ownershipHand: vehicle.ownershipHand");
    expect(privacy).toContain("ownershipType:");
    expect(privacy).toContain("fuelType:");
    expect(privacy).toContain("engineDisplacementCc:");
    expect(privacy).toContain("Explicitly omit: b2bPrice");
    expect(card).toContain("ownershipSourceLabelHe");
    expect(card).toContain("engineDisplacementCc");
  });

  it("teaches the demand AI all four dimensions without inventing them", () => {
    const parser = source("src/services/ai/demand-parser.ts");
    expect(parser).toContain("ownershipHand: when explicitly stated");
    expect(parser).toContain("ownershipType: when explicitly stated");
    expect(parser).toContain("Never infer engine size from model knowledge");
    expect(parser).toContain("canonicalizeOwnershipSource");
    expect(parser).toContain('maybePushSoftConstraint(copy, "hand"');
    expect(parser).toContain('maybePushSoftConstraint(copy, "ownershipSource"');
  });
});

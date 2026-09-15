import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  extractAllPlatesFromText,
  extractCommercialFromText,
} from "@/services/intake/text-extract";
import {
  isValidIsraeliPlate,
  GOV_ACTIVE_PRIVATE_RESOURCE_ID,
} from "@/services/identity/gov-vehicle";
import { normalizePlate } from "@/services/intake/status";
import { CLASSIFY_CONFIDENCE_THRESHOLD } from "@/services/intake/media-classify";
import { checkIntakeRateLimit } from "@/services/intake/rate-limit";

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
    expect(r.plates).toEqual([]);
  });

  it("extracts multiple plates for bulk grouping", () => {
    const plates = extractAllPlatesFromText(
      "ראשון 12-345-67 שני 98-765-43 מחיר 100000"
    );
    expect(plates.map((p) => p.value).sort()).toEqual(["1234567", "9876543"]);
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
    expect(GOV_ACTIVE_PRIVATE_RESOURCE_ID).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe("intake domain surface", () => {
  it("schema has durable ACK and domain models", () => {
    const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model IntakeBatch");
    expect(schema).toContain("acknowledgedAt");
    expect(schema).toContain("model VehicleCandidate");
    expect(schema).toContain("NEEDS_CONFIRMATION");
  });

  it("API enforces dealer auth, ack, review, rate limit", () => {
    const batchRoute = readFileSync(
      join(root, "src/app/api/intake/batch/route.ts"),
      "utf8"
    );
    expect(batchRoute).toContain("requireVerifiedDealer");
    expect(batchRoute).toContain('action === "ack"');
    expect(batchRoute).toContain("checkIntakeRateLimit");

    const reviewRoute = readFileSync(
      join(root, "src/app/api/intake/review/route.ts"),
      "utf8"
    );
    expect(reviewRoute).toContain("resolveIntakeCandidate");
    expect(reviewRoute).toContain("listOpenIntakeReviews");
  });

  it("commit never maps OTHER/null to EXTERIOR", () => {
    const commit = readFileSync(
      join(root, "src/services/intake/commit.ts"),
      "utf8"
    );
    expect(commit).toContain('row.categoryHint === "OTHER"');
    expect(commit).toContain("continue");
    expect(commit).not.toMatch(/OTHER[\s\S]{0,80}\?[\s\S]{0,40}"EXTERIOR"/);
  });

  it("process-batch is re-entrant and supports multi-plate", () => {
    const src = readFileSync(
      join(root, "src/services/intake/process-batch.ts"),
      "utf8"
    );
    expect(src).toContain("batch.candidates.length === 0");
    expect(src).toContain("commercial.plates");
    expect(src).not.toMatch(/if \(batch\.candidates\.length > 0\) \{\s*return/);
  });

  it("media classify enforces confidence threshold", () => {
    expect(CLASSIFY_CONFIDENCE_THRESHOLD).toBeGreaterThanOrEqual(0.62);
    const src = readFileSync(
      join(root, "src/services/intake/media-classify.ts"),
      "utf8"
    );
    expect(src).toContain("CLASSIFY_CONFIDENCE_THRESHOLD");
    expect(src).toContain("return null");
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

  it("retention policy covers intake media TTL", () => {
    const policy = readFileSync(
      join(root, "src/services/privacy/policy.ts"),
      "utf8"
    );
    const retention = readFileSync(
      join(root, "src/services/privacy/retention.ts"),
      "utf8"
    );
    expect(policy).toContain("intakeMediaDaysAfterTerminal");
    expect(retention).toContain("purgeTerminalIntakeBatches");
    expect(retention).toContain("staleIntakeBatches");
  });

  it("review and handoff UI surfaces exist", () => {
    expect(
      readFileSync(
        join(root, "src/components/intake/intake-review-client.tsx"),
        "utf8"
      )
    ).toContain("סקירת קליטה");
    expect(
      readFileSync(
        join(root, "src/components/intake/intake-handoff-client.tsx"),
        "utf8"
      )
    ).toContain("add_text");
  });
});

describe("intake rate limit", () => {
  it("blocks after burst", () => {
    const id = `test-dealer-${Date.now()}`;
    let blocked = false;
    for (let i = 0; i < 40; i++) {
      const r = checkIntakeRateLimit({ dealerId: id, kind: "create" });
      if (r.blocked) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });
});

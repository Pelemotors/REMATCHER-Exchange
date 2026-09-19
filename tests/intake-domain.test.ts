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
  GOV_PERSONAL_IMPORT_RESOURCE_ID,
  identityFromGovRecord,
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
    expect(GOV_PERSONAL_IMPORT_RESOURCE_ID).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("maps personal-import records (no kinuy_mishari) to identity", () => {
    const id = identityFromGovRecord(
      {
        mispar_rechev: 90563201,
        tozeret_nm: 'ב מ וו ארהב"',
        degem_nm: "BMW           KTOC",
        shnat_yitzur: 2017,
        sug_yevu: "יבוא אישי-משומש",
      },
      GOV_PERSONAL_IMPORT_RESOURCE_ID,
      "90563201"
    );
    expect(id.make).toBe("BMW");
    expect(id.year).toBe(2017);
    expect(id.model).toMatch(/KTOC/);
    expect(id.resourceId).toBe(GOV_PERSONAL_IMPORT_RESOURCE_ID);
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

  it("commit attaches OTHER/unknown instead of skipping", () => {
    const commit = readFileSync(
      join(root, "src/services/intake/commit.ts"),
      "utf8"
    );
    expect(commit).toContain('row.categoryHint ?? "OTHER"');
    expect(commit).not.toMatch(/OTHER[\s\S]{0,80}\?[\s\S]{0,40}"EXTERIOR"/);
  });

  it("process-batch is re-entrant and supports multi-plate", () => {
    const src = readFileSync(
      join(root, "src/services/intake/process-batch.ts"),
      "utf8"
    );
    expect(src).toContain("assignMediaToIdentityGroups");
    expect(src).toContain("INTAKE_OCR_CONCURRENCY");
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
    const handoffUi = readFileSync(
      join(root, "src/components/intake/intake-handoff-client.tsx"),
      "utf8"
    );
    expect(handoffUi).toContain("add_text");
    expect(handoffUi).toContain("קליטת רכב");
    expect(handoffUi).not.toContain("קליטת מלאי");
    expect(handoffUi).toContain("להוסיף למלאי");
  });

  it("iOS Share Extension + ShareStaging adapter sources are present", () => {
    const ext = readFileSync(
      join(root, "mobile/ios/App/ShareExtension/ShareViewController.swift"),
      "utf8"
    );
    expect(ext).toContain("group.co.rematcher.exchange");
    expect(ext).toContain("pending.json");
    expect(ext).toContain("IOS_SHARE");
    const plist = readFileSync(
      join(root, "mobile/ios/App/ShareExtension/Info.plist"),
      "utf8"
    );
    expect(plist).toContain("NSExtensionActivationSupportsImageWithMaxCount");
    expect(plist).toContain("NSExtensionActivationSupportsText");
    expect(plist).toContain("com.apple.share-services");
    const plugin = readFileSync(
      join(root, "mobile/ios/App/ShareStaging/ShareStagingPlugin.swift"),
      "utf8"
    );
    expect(plugin).toContain("consumeAndUpload");
    expect(plugin).toContain("/api/intake/batch");
    const handoff = readFileSync(
      join(root, "src/components/intake/intake-handoff-client.tsx"),
      "utf8"
    );
    expect(handoff).toContain("IOS_SHARE");
    expect(handoff).toContain("isNativeShare");
    expect(handoff).toContain("callbackUrl");
    expect(handoff).toContain("נסה שוב");
    expect(handoff).toContain("useState(() =>");
    expect(handoff).toContain('role="alert"');

    const product = readFileSync(join(root, "src/config/product.ts"), "utf8");
    expect(product).toContain(
      'plateOcr: process.env.OPENAI_PLATE_OCR_MODEL ?? "gpt-5.4-mini"'
    );
    const ocr = readFileSync(join(root, "src/services/intake/plate-ocr.ts"), "utf8");
    expect(ocr).toContain("chatCompletionLength");
    expect(ocr).toContain("AI_MODELS.plateOcr");
    expect(ocr).toContain("cropIsraeliYellowPlate");
    expect(ocr).toContain("resolveStructuredPlate");
    expect(ocr).toContain("Read the Israeli vehicle registration plate");
    expect(ocr).not.toMatch(/max_tokens:\s*200/);
    const vision = readFileSync(
      join(root, "src/services/intake/media-vision.ts"),
      "utf8"
    );
    expect(vision).toContain("chatCompletionLength");
    expect(vision).toContain("AI_MODELS.agentLoop");
    expect(vision).not.toMatch(/max_tokens:\s*350/);
  });
});

describe("intake rate limit", () => {
  it("blocks after burst in non-Field-Test mode", () => {
    const prev = process.env.FIELD_TEST;
    process.env.FIELD_TEST = "false";
    try {
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
    } finally {
      if (prev === undefined) delete process.env.FIELD_TEST;
      else process.env.FIELD_TEST = prev;
    }
  });
});

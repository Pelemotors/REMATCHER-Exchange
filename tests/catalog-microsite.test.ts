import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { V1_ERROR_CODES, V1_STATUS_BY_CODE } from "@/lib/api-v1/errors";
import { newCatalogPublicId } from "@/services/catalog/public-id";
import { catalogPublicUrl, catalogPublicVehicleUrl } from "@/services/catalog/public-url";
import {
  issueCatalogPreviewToken,
  verifyCatalogPreviewToken,
} from "@/services/catalog/preview-token";
import {
  PUBLIC_CATALOG_EVENT_TYPES,
  isPublicCatalogEventType,
} from "@/services/catalog/event-types";
import { catalogVehicleInterestText } from "@/services/catalog/whatsapp-interest";

function readSrc(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const PUBLIC_FORBIDDEN = [
  "conditionNotes",
  "b2bPrice",
  "dealerPrice",
  "dealerRelationship",
  "fieldProvenance",
  "rawInput",
  "plateNumber",
];

describe("catalog public URL authority", () => {
  it("builds subdomain URLs from slug", () => {
    expect(catalogPublicUrl("galeria-test")).toBe(
      "https://galeria-test.rematcher.co.il"
    );
    expect(catalogPublicVehicleUrl("galeria-test", "abc123")).toBe(
      "https://galeria-test.rematcher.co.il/vehicles/abc123"
    );
  });

  it("GET catalog/me serializer includes publicUrl helper", () => {
    const src = readSrc("src/services/catalog/catalog-service.ts");
    expect(src).toContain("catalogPublicUrl");
    expect(src).toContain("publicUrl:");
  });
});

describe("catalog publicId", () => {
  it("issues opaque url-safe ids", () => {
    const id = newCatalogPublicId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(id.length).toBeGreaterThanOrEqual(12);
    expect(newCatalogPublicId()).not.toBe(id);
  });

  it("migration backfills without cuid()", () => {
    const sql = readSrc(
      "prisma/migrations/20260919180000_catalog_microsite/migration.sql"
    );
    expect(sql).toContain("md5");
    expect(sql).not.toMatch(/publicId\s*=\s*cuid\s*\(/);
  });
});

describe("public DTO privacy", () => {
  it("public mapper never selects or returns conditionNotes", () => {
    const src = readSrc("src/services/catalog/catalog-service.ts");
    expect(src).not.toMatch(/conditionNotes/);
    expect(src).toContain("publicId: publication.publicId");
    expect(src).toContain("publicDescription");
  });

  it("public pages and lead form do not leak dealer internals", () => {
    for (const rel of [
      "src/app/c/[slug]/page.tsx",
      "src/app/c/[slug]/vehicles/[vehicleId]/page.tsx",
      "src/components/catalog/public-catalog-client.tsx",
    ]) {
      const src = readSrc(rel);
      for (const token of PUBLIC_FORBIDDEN) {
        expect(src, rel).not.toMatch(new RegExp(token));
      }
    }
  });

  it("robots default to noindex unless allowSearchIndexing", () => {
    const src = readSrc("src/app/c/[slug]/page.tsx");
    expect(src).toContain("allowSearchIndexing");
    expect(src).toContain("robots");
  });
});

describe("catalog events ownership", () => {
  it("browser allowlist excludes server-owned events", () => {
    expect(PUBLIC_CATALOG_EVENT_TYPES).toEqual([
      "CATALOG_VIEW",
      "VEHICLE_VIEW",
      "PHONE_CLICK",
    ]);
    expect(isPublicCatalogEventType("WHATSAPP_CLICK")).toBe(false);
    expect(isPublicCatalogEventType("LEAD_SUBMITTED")).toBe(false);
    const route = readSrc("src/app/api/public/catalog/[slug]/events/route.ts");
    expect(route).toContain("isPublicCatalogEventType");
    expect(route).not.toContain("WHATSAPP_CLICK");
  });

  it("WhatsApp redirect records WHATSAPP_CLICK server-side", () => {
    const src = readSrc("src/app/c/[slug]/out/whatsapp/[publicId]/route.ts");
    expect(src).toContain('eventType: "WHATSAPP_CLICK"');
    expect(src).toContain("catalogVehicleWhatsAppHref");
  });
});

describe("catalog leads", () => {
  it("requires DB idempotency and cooldown, never creates Demand", () => {
    const src = readSrc("src/services/catalog/leads.ts");
    expect(src).toContain("clientSubmissionId");
    expect(src).toContain("normalizedPhone");
    expect(src).toContain("CATALOG_LEAD");
    expect(src).toContain('origin: "CATALOG"');
    expect(src).toContain("preserveExisting");
    expect(src).not.toMatch(/demand\.create|createDemand/i);
  });

  it("customer upsert is race-safe", () => {
    const src = readSrc("src/services/customers/index.ts");
    expect(src).toContain("P2002");
    expect(src).toContain("preserveExisting");
  });
});

describe("preview token", () => {
  it("signs catalog-only tokens and rejects other catalogs", () => {
    const prev = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "test-preview-secret";
    const issued = issueCatalogPreviewToken({
      catalogId: "cat_1",
      dealerId: "d_1",
    });
    expect("token" in issued).toBe(true);
    if (!("token" in issued)) return;
    expect(
      verifyCatalogPreviewToken(issued.token, { catalogId: "cat_1", dealerId: "d_1" })
    ).toBe(true);
    expect(verifyCatalogPreviewToken(issued.token, { catalogId: "cat_other" })).toBe(
      false
    );
    process.env.AUTH_SECRET = prev;
  });
});

describe("reconcile + desired-state", () => {
  it("sold and archive call reconcile", () => {
    expect(readSrc("src/services/inventory/mark-sold.ts")).toContain(
      "reconcileCatalogPublicationForVehicle"
    );
    expect(readSrc("src/services/inventory/remove-from-inventory.ts")).toContain(
      "reconcileCatalogPublicationForVehicle"
    );
    expect(
      readSrc("src/services/vehicles/relationship-visibility.ts")
    ).toContain("reconcileCatalogPublicationForVehicle");
  });

  it("replace publications is all-or-nothing", () => {
    const src = readSrc("src/services/catalog/catalog-service.ts");
    expect(src).toContain("replaceCatalogPublications");
    expect(src).toContain("failures.length");
    expect(src).toContain("$transaction");
  });
});

describe("V1 catalog contracts", () => {
  it("adds catalog error codes", () => {
    expect(V1_ERROR_CODES.CATALOG_NOT_FOUND).toBe("CATALOG_NOT_FOUND");
    expect(V1_STATUS_BY_CODE.CATALOG_LEAD_RATE_LIMITED).toBe(429);
    expect(V1_STATUS_BY_CODE.CATALOG_SLUG_TAKEN).toBe(409);
  });

  it("OpenAPI documents catalog surface", () => {
    const yaml = readSrc("docs/api/v1-openapi.yaml");
    expect(yaml).toContain("/api/v1/catalog/me");
    expect(yaml).toContain("/api/v1/catalog/publications");
    expect(yaml).toContain("/api/v1/catalog/leads");
    expect(yaml).toContain("/api/v1/catalog/analytics");
    expect(yaml).toContain("publicUrl");
  });

  it("WhatsApp share copy can include publicId without internal vehicle id", () => {
    const text = catalogVehicleInterestText({
      title: "Mazda 3",
      make: "Mazda",
      model: "3",
      year: 2021,
      publicRef: "pub_ab12cd34",
    });
    expect(text).toContain("pub_ab12cd34");
    expect(text).not.toMatch(/cl[a-z0-9]{20,}/);
  });
});

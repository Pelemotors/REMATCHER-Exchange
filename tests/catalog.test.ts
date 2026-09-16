import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CATALOG_SLUG_MAX_LEN,
  catalogSlugFromHost,
  isReservedCatalogSlug,
  normalizeCatalogSlug,
  RESERVED_CATALOG_SLUGS,
  validateCatalogSlug,
} from "@/services/catalog/slug";
import {
  CATALOG_BLOCKED_RELATIONSHIPS,
  checkCatalogPublishEligibility,
} from "@/services/catalog/eligibility";

describe("catalog slug normalization", () => {
  it("lowercases and hyphenates", () => {
    expect(normalizeCatalogSlug("  Galeria Motors  ")).toBe("galeria-motors");
    expect(normalizeCatalogSlug("Gal_Motors")).toBe("gal-motors");
    expect(normalizeCatalogSlug("A--B___C")).toBe("a-b-c");
  });

  it("strips invalid characters", () => {
    expect(normalizeCatalogSlug("סוכנות@gal!")).toBe("gal");
    expect(normalizeCatalogSlug("---abc---")).toBe("abc");
  });
});

describe("catalog slug validation", () => {
  it("accepts valid slugs", () => {
    expect(validateCatalogSlug("galeria")).toEqual({
      ok: true,
      slug: "galeria",
    });
    expect(validateCatalogSlug("my-dealer-99").ok).toBe(true);
  });

  it("rejects short, long, and invalid", () => {
    const short = validateCatalogSlug("ab");
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.code).toBe("slug_too_short");

    const long = validateCatalogSlug("a".repeat(CATALOG_SLUG_MAX_LEN + 1));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.code).toBe("slug_too_long");

    const empty = validateCatalogSlug("");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe("slug_required");

    const hyphens = validateCatalogSlug("---");
    expect(hyphens.ok).toBe(false);
    if (!hyphens.ok) expect(hyphens.code).toBe("slug_required");
  });

  it("rejects reserved list and field-test*", () => {
    for (const s of RESERVED_CATALOG_SLUGS) {
      expect(isReservedCatalogSlug(s), s).toBe(true);
      const v = validateCatalogSlug(s);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.code).toBe("slug_reserved");
    }
    expect(isReservedCatalogSlug("field-test-foo")).toBe(true);
    const ft = validateCatalogSlug("FIELD-TEST");
    expect(ft.ok).toBe(false);
    if (!ft.ok) expect(ft.code).toBe("slug_reserved");
    const ex = validateCatalogSlug("exchange");
    expect(ex.ok).toBe(false);
    if (!ex.ok) expect(ex.code).toBe("slug_reserved");
    const www = validateCatalogSlug("www");
    expect(www.ok).toBe(false);
    if (!www.ok) expect(www.code).toBe("slug_reserved");
  });
});

describe("catalog host rewrite helper", () => {
  it("extracts dealer slug hosts", () => {
    expect(catalogSlugFromHost("galeria-test.rematcher.co.il")).toBe("galeria-test");
    expect(catalogSlugFromHost("galeria.rematcher.co.il")).toBe("galeria");
    expect(catalogSlugFromHost("Galeria.rematcher.co.il:443")).toBe("galeria");
  });

  it("skips reserved and platform hosts", () => {
    expect(catalogSlugFromHost("exchange.rematcher.co.il")).toBeNull();
    expect(catalogSlugFromHost("www.rematcher.co.il")).toBeNull();
    expect(catalogSlugFromHost("field-test-exchange.rematcher.co.il")).toBeNull();
    expect(catalogSlugFromHost("api.rematcher.co.il")).toBeNull();
    expect(catalogSlugFromHost("rematcher.co.il")).toBeNull();
    expect(catalogSlugFromHost("localhost")).toBeNull();
  });
});

describe("catalog host middleware", () => {
  it("forces http rewrite so Caddy HTTPS proto does not proxy TLS onto :3200", () => {
    const mw = readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");
    expect(mw).toContain('url.protocol = "http:"');
    expect(mw).toContain("catalogSlugFromHost");
  });
});

describe("catalog publish eligibility", () => {
  const dealerId = "dealer-1";

  it("allows ACTIVE OWNED / INVENTORY (explicit publish still required)", () => {
    expect(
      checkCatalogPublishEligibility(
        { status: "ACTIVE", dealerRelationship: "OWNED", dealerId },
        dealerId
      ).ok
    ).toBe(true);
    expect(
      checkCatalogPublishEligibility(
        { status: "ACTIVE", dealerRelationship: "INVENTORY", dealerId },
        dealerId
      ).ok
    ).toBe(true);
  });

  it("never allows OFFERED_TO_ME / TRADE_IN_CANDIDATE / EXTERNAL", () => {
    for (const rel of CATALOG_BLOCKED_RELATIONSHIPS) {
      const r = checkCatalogPublishEligibility(
        { status: "ACTIVE", dealerRelationship: rel, dealerId },
        dealerId
      );
      expect(r.ok, rel).toBe(false);
      if (!r.ok) expect(r.code).toBe("relationship_not_publishable");
    }
  });

  it("rejects sold / wrong dealer", () => {
    expect(
      checkCatalogPublishEligibility(
        { status: "SOLD", dealerRelationship: "OWNED", dealerId },
        dealerId
      ).ok
    ).toBe(false);
    expect(
      checkCatalogPublishEligibility(
        { status: "ACTIVE", dealerRelationship: "OWNED", dealerId: "other" },
        dealerId
      ).ok
    ).toBe(false);
  });

  it("OWNED alone is not a publication — eligibility ≠ published", () => {
    // Document product rule: eligibility allows publish action; does not imply public.
    const eligible = checkCatalogPublishEligibility(
      { status: "ACTIVE", dealerRelationship: "OWNED", dealerId },
      dealerId
    );
    expect(eligible.ok).toBe(true);
    // No CatalogPublication is created by this check.
  });
});

describe("catalog WhatsApp interest", () => {
  it("normalizes Israeli mobiles to wa.me and prefills the vehicle", async () => {
    const {
      israeliPhoneToWhatsApp,
      catalogVehicleWhatsAppHref,
      catalogVehicleInterestText,
    } = await import("@/services/catalog/whatsapp-interest");
    expect(israeliPhoneToWhatsApp("0500000000")).toBe("972500000000");
    expect(israeliPhoneToWhatsApp("972501234567")).toBe("972501234567");
    expect(israeliPhoneToWhatsApp("050-123-4567")).toBe("972501234567");
    const href = catalogVehicleWhatsAppHref("0501234567", {
      title: "BMW X5",
      year: 2017,
    });
    expect(href).toContain("https://wa.me/972501234567?text=");
    expect(decodeURIComponent(href!.split("text=")[1])).toContain("BMW X5");
    expect(catalogVehicleInterestText({ title: "RAV4", year: 2020 })).toContain(
      "RAV4"
    );
  });

  it("public catalog surfaces per-vehicle interest CTA", () => {
    const home = readFileSync(
      resolve(process.cwd(), "src/app/c/[slug]/page.tsx"),
      "utf8"
    );
    const detail = readFileSync(
      resolve(process.cwd(), "src/app/c/[slug]/vehicles/[vehicleId]/page.tsx"),
      "utf8"
    );
    expect(home).toContain("צור קשר ב-WhatsApp");
    expect(home).toContain("catalogVehicleWhatsAppHref");
    expect(detail).toContain("צור קשר ב-WhatsApp");
    expect(detail).toContain("catalogVehicleWhatsAppHref");
  });
});

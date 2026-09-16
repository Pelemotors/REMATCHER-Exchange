/**
 * Catalog subdomain / path slug rules.
 * Host rewrite: `{slug}.rematcher.co.il` → `/c/{slug}`.
 */

export const RESERVED_CATALOG_SLUGS = [
  "www",
  "exchange",
  "admin",
  "api",
  "app",
  "auth",
  "login",
  "register",
  "mail",
  "email",
  "support",
  "help",
  "status",
  "static",
  "assets",
  "cdn",
  "media",
  "files",
  "field-test",
  "staging",
  "dev",
  "test",
  "beta",
  "supabase",
  "vps",
  "field-test-exchange",
] as const;

export type ReservedCatalogSlug = (typeof RESERVED_CATALOG_SLUGS)[number];

const RESERVED_SET = new Set<string>(RESERVED_CATALOG_SLUGS);

export const CATALOG_SLUG_MIN_LEN = 3;
export const CATALOG_SLUG_MAX_LEN = 48;

/** Lowercase, hyphenate, strip invalid chars. */
export function normalizeCatalogSlug(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isReservedCatalogSlug(slug: string): boolean {
  const n = normalizeCatalogSlug(slug);
  if (!n) return false;
  if (RESERVED_SET.has(n)) return true;
  // field-test* platform hosts
  if (n.startsWith("field-test")) return true;
  return false;
}

export type CatalogSlugValidation =
  | { ok: true; slug: string }
  | { ok: false; error: string; code: string };

export function validateCatalogSlug(raw: string): CatalogSlugValidation {
  const slug = normalizeCatalogSlug(raw);
  if (!slug) {
    return { ok: false, error: "slug_required", code: "slug_required" };
  }
  if (slug.length < CATALOG_SLUG_MIN_LEN) {
    return { ok: false, error: "slug_too_short", code: "slug_too_short" };
  }
  if (slug.length > CATALOG_SLUG_MAX_LEN) {
    return { ok: false, error: "slug_too_long", code: "slug_too_long" };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, error: "slug_invalid", code: "slug_invalid" };
  }
  if (isReservedCatalogSlug(slug)) {
    return { ok: false, error: "slug_reserved", code: "slug_reserved" };
  }
  return { ok: true, slug };
}

/** Host left-label reserved for platform (not dealer catalogs). */
export function isReservedCatalogHostLabel(label: string): boolean {
  return isReservedCatalogSlug(label);
}

const CATALOG_ROOT_DOMAIN = "rematcher.co.il";

/**
 * Extract dealer catalog slug from Host `{slug}.rematcher.co.il`.
 * Skips reserved / platform labels (exchange, www, field-test*, …).
 */
export function catalogSlugFromHost(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(":")[0]?.toLowerCase().trim() ?? "";
  if (!host.endsWith(`.${CATALOG_ROOT_DOMAIN}`)) return null;
  const label = host.slice(0, -(CATALOG_ROOT_DOMAIN.length + 1));
  if (!label || label.includes(".")) return null;
  if (isReservedCatalogHostLabel(label)) return null;
  return label;
}

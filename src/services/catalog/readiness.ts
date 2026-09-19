import "server-only";
import { prisma } from "@/lib/prisma";
import { validateCatalogSlug } from "@/services/catalog/slug";
import { pickCatalogWhatsAppNumber } from "@/services/catalog/whatsapp-interest";

export type CatalogReadinessCode =
  | "catalog_not_found"
  | "slug_invalid"
  | "display_name_required"
  | "no_contact_method"
  | "no_published_vehicles";

export type CatalogReadiness =
  | { ok: true }
  | { ok: false; code: CatalogReadinessCode; message: string };

export async function assertCatalogPublishReady(
  dealerId: string
): Promise<CatalogReadiness> {
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId },
    include: {
      dealer: { select: { phone: true } },
      _count: { select: { publications: { where: { isActive: true } } } },
    },
  });
  if (!catalog) {
    return {
      ok: false,
      code: "catalog_not_found",
      message: "יש ליצור קטלוג לפני הפרסום.",
    };
  }
  const slug = validateCatalogSlug(catalog.slug);
  if (!slug.ok) {
    return { ok: false, code: "slug_invalid", message: "כתובת הקטלוג אינה תקינה." };
  }
  if (!catalog.displayName.trim()) {
    return {
      ok: false,
      code: "display_name_required",
      message: "נדרש שם תצוגה לקטלוג.",
    };
  }
  const contact = pickCatalogWhatsAppNumber(
    catalog.whatsapp,
    catalog.phone,
    catalog.dealer.phone
  );
  if (!contact) {
    return {
      ok: false,
      code: "no_contact_method",
      message: "נדרש טלפון או WhatsApp לפני הפעלת הקטלוג.",
    };
  }
  if (catalog._count.publications < 1) {
    return {
      ok: false,
      code: "no_published_vehicles",
      message: "יש לפרסם לפחות רכב אחד לפני הפעלת הקטלוג.",
    };
  }
  return { ok: true };
}

export function mapReadinessToV1(code: CatalogReadinessCode): string {
  switch (code) {
    case "catalog_not_found":
      return "CATALOG_NOT_FOUND";
    case "slug_invalid":
      return "CATALOG_SLUG_INVALID";
    case "display_name_required":
      return "VALIDATION_FAILED";
    case "no_contact_method":
      return "CATALOG_NO_CONTACT_METHOD";
    case "no_published_vehicles":
      return "CATALOG_NO_PUBLISHED_VEHICLES";
  }
}

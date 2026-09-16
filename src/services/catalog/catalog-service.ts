import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  CatalogStatus,
  DealerCatalog,
  Prisma,
} from "@prisma/client";
import {
  normalizeCatalogSlug,
  validateCatalogSlug,
} from "@/services/catalog/slug";
import {
  CATALOG_ELIGIBLE_RELATIONSHIPS,
  checkCatalogPublishEligibility,
} from "@/services/catalog/eligibility";
import {
  publicThumbUrlForDisplayKey,
  publicUrlForStorageKey,
} from "@/lib/media/storage";

export {
  CATALOG_ELIGIBLE_RELATIONSHIPS,
  CATALOG_BLOCKED_RELATIONSHIPS,
  checkCatalogPublishEligibility,
} from "@/services/catalog/eligibility";

export async function getCatalogForDealer(dealerId: string) {
  return prisma.dealerCatalog.findUnique({
    where: { dealerId },
    include: {
      publications: {
        where: { isActive: true },
        select: {
          id: true,
          vehicleId: true,
          publishedAt: true,
          isActive: true,
        },
        orderBy: { publishedAt: "desc" },
      },
      _count: { select: { publications: { where: { isActive: true } } } },
    },
  });
}

export type CatalogSettingsInput = {
  slug?: string;
  displayName?: string;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  description?: string | null;
  logoUrl?: string | null;
};

export async function createOrUpdateCatalog(
  dealerId: string,
  input: CatalogSettingsInput
) {
  const existing = await prisma.dealerCatalog.findUnique({
    where: { dealerId },
  });

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { businessName: true, phone: true },
  });
  if (!dealer) {
    return { ok: false as const, error: "dealer_not_found" as const };
  }

  if (!existing) {
    const slugRaw = input.slug ?? "";
    const slugCheck = validateCatalogSlug(slugRaw);
    if (!slugCheck.ok) {
      return {
        ok: false as const,
        error: slugCheck.code as string,
        message: slugCheck.error,
      };
    }
    const available = await isSlugAvailable(slugCheck.slug);
    if (!available) {
      return { ok: false as const, error: "slug_taken" as const };
    }
    const displayName =
      input.displayName?.trim() || dealer.businessName || slugCheck.slug;
    const catalog = await prisma.dealerCatalog.create({
      data: {
        dealerId,
        slug: slugCheck.slug,
        displayName,
        phone: input.phone ?? dealer.phone ?? null,
        whatsapp: input.whatsapp ?? null,
        address: input.address ?? null,
        description: input.description ?? null,
        logoUrl: input.logoUrl ?? null,
        status: "DRAFT",
      },
    });
    return { ok: true as const, catalog, created: true as const };
  }

  const data: Prisma.DealerCatalogUpdateInput = {};
  if (input.displayName !== undefined) {
    const name = input.displayName.trim();
    if (!name) {
      return { ok: false as const, error: "display_name_required" as const };
    }
    data.displayName = name;
  }
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.whatsapp !== undefined) data.whatsapp = input.whatsapp;
  if (input.address !== undefined) data.address = input.address;
  if (input.description !== undefined) data.description = input.description;
  if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;

  if (input.slug !== undefined) {
    const slugCheck = validateCatalogSlug(input.slug);
    if (!slugCheck.ok) {
      return {
        ok: false as const,
        error: slugCheck.code as string,
        message: slugCheck.error,
      };
    }
    if (slugCheck.slug !== existing.slug) {
      const available = await isSlugAvailable(slugCheck.slug, existing.id);
      if (!available) {
        return { ok: false as const, error: "slug_taken" as const };
      }
      data.slug = slugCheck.slug;
    }
  }

  const catalog = await prisma.dealerCatalog.update({
    where: { id: existing.id },
    data,
  });
  return { ok: true as const, catalog, created: false as const };
}

export async function isSlugAvailable(
  rawSlug: string,
  excludeCatalogId?: string
): Promise<boolean> {
  const check = validateCatalogSlug(rawSlug);
  if (!check.ok) return false;
  const found = await prisma.dealerCatalog.findUnique({
    where: { slug: check.slug },
    select: { id: true },
  });
  if (!found) return true;
  if (excludeCatalogId && found.id === excludeCatalogId) return true;
  return false;
}

export async function enableCatalog(dealerId: string) {
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId },
  });
  if (!catalog) return { ok: false as const, error: "not_found" as const };
  const updated = await prisma.dealerCatalog.update({
    where: { id: catalog.id },
    data: {
      status: "ENABLED",
      publishedAt: catalog.publishedAt ?? new Date(),
    },
  });
  return { ok: true as const, catalog: updated };
}

export async function disableCatalog(dealerId: string) {
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId },
  });
  if (!catalog) return { ok: false as const, error: "not_found" as const };
  const updated = await prisma.dealerCatalog.update({
    where: { id: catalog.id },
    data: { status: "DISABLED" },
  });
  return { ok: true as const, catalog: updated };
}

export async function setCatalogStatus(
  dealerId: string,
  status: CatalogStatus
) {
  if (status === "ENABLED") return enableCatalog(dealerId);
  if (status === "DISABLED") return disableCatalog(dealerId);
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId },
  });
  if (!catalog) return { ok: false as const, error: "not_found" as const };
  const updated = await prisma.dealerCatalog.update({
    where: { id: catalog.id },
    data: { status: "DRAFT" },
  });
  return { ok: true as const, catalog: updated };
}

export async function publishVehicleToCatalog(params: {
  dealerId: string;
  vehicleId: string;
}) {
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId: params.dealerId },
  });
  if (!catalog) {
    return {
      ok: false as const,
      error: "catalog_required" as const,
      message: "יש ליצור קטלוג לפני פרסום רכב.",
    };
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: params.vehicleId, dealerId: params.dealerId },
    select: {
      id: true,
      status: true,
      dealerRelationship: true,
      dealerId: true,
    },
  });
  if (!vehicle) {
    return { ok: false as const, error: "not_found" as const };
  }

  const eligibility = checkCatalogPublishEligibility(vehicle, params.dealerId);
  if (!eligibility.ok) {
    return {
      ok: false as const,
      error: eligibility.code,
      message: eligibility.message,
    };
  }

  const publication = await prisma.catalogPublication.upsert({
    where: {
      catalogId_vehicleId: {
        catalogId: catalog.id,
        vehicleId: vehicle.id,
      },
    },
    create: {
      catalogId: catalog.id,
      vehicleId: vehicle.id,
      isActive: true,
      publishedAt: new Date(),
    },
    update: {
      isActive: true,
      publishedAt: new Date(),
      unpublishedAt: null,
    },
  });

  return { ok: true as const, publication };
}

export async function unpublishVehicleFromCatalog(params: {
  dealerId: string;
  vehicleId: string;
}) {
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId: params.dealerId },
  });
  if (!catalog) {
    return { ok: false as const, error: "catalog_required" as const };
  }

  const existing = await prisma.catalogPublication.findUnique({
    where: {
      catalogId_vehicleId: {
        catalogId: catalog.id,
        vehicleId: params.vehicleId,
      },
    },
  });
  if (!existing) {
    return { ok: false as const, error: "not_found" as const };
  }

  const publication = await prisma.catalogPublication.update({
    where: { id: existing.id },
    data: { isActive: false, unpublishedAt: new Date() },
  });
  return { ok: true as const, publication };
}

export async function bulkPublishVehiclesToCatalog(params: {
  dealerId: string;
  vehicleIds: string[];
}) {
  const results: Array<{
    vehicleId: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const vehicleId of params.vehicleIds) {
    const r = await publishVehicleToCatalog({
      dealerId: params.dealerId,
      vehicleId,
    });
    results.push({
      vehicleId,
      ok: r.ok,
      error: r.ok ? undefined : r.error,
    });
  }

  const published = results.filter((r) => r.ok).length;
  return {
    ok: true as const,
    published,
    failed: results.length - published,
    results,
  };
}

const publicVehicleSelect = {
  id: true,
  make: true,
  model: true,
  trim: true,
  year: true,
  mileage: true,
  color: true,
  ownershipHand: true,
  region: true,
  retailPrice: true,
  conditionNotes: true,
  media: {
    orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }],
    take: 8,
    select: {
      storageKey: true,
      category: true,
      isPrimary: true,
    },
  },
} satisfies Prisma.VehicleSelect;

function mapPublicVehicle(
  v: Prisma.VehicleGetPayload<{ select: typeof publicVehicleSelect }>
) {
  const primary = v.media[0];
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    trim: v.trim,
    year: v.year,
    mileage: v.mileage,
    color: v.color,
    ownershipHand: v.ownershipHand,
    region: v.region,
    retailPrice: v.retailPrice,
    conditionNotes: v.conditionNotes,
    title: [v.make, v.model, v.trim].filter(Boolean).join(" ") || "רכב",
    imageUrl: primary ? publicUrlForStorageKey(primary.storageKey) : null,
    thumbUrl: primary
      ? publicThumbUrlForDisplayKey(primary.storageKey)
      : null,
    media: v.media.map((m) => ({
      url: publicUrlForStorageKey(m.storageKey),
      thumbUrl: publicThumbUrlForDisplayKey(m.storageKey),
      category: m.category,
      isPrimary: m.isPrimary,
    })),
  };
}

export async function getPublicCatalogBySlug(slug: string) {
  const normalized = normalizeCatalogSlug(slug);
  if (!normalized) return null;

  const catalog = await prisma.dealerCatalog.findFirst({
    where: { slug: normalized, status: "ENABLED" },
    select: {
      id: true,
      slug: true,
      displayName: true,
      phone: true,
      whatsapp: true,
      address: true,
      description: true,
      logoUrl: true,
      publishedAt: true,
      status: true,
      dealer: { select: { phone: true } },
    },
  });
  return catalog;
}

export async function listPublicCatalogVehicles(slug: string) {
  const catalog = await getPublicCatalogBySlug(slug);
  if (!catalog) return null;

  const rows = await prisma.catalogPublication.findMany({
    where: {
      catalogId: catalog.id,
      isActive: true,
      vehicle: {
        status: "ACTIVE",
        dealerRelationship: { in: CATALOG_ELIGIBLE_RELATIONSHIPS },
      },
    },
    orderBy: { publishedAt: "desc" },
    include: {
      vehicle: { select: publicVehicleSelect },
    },
  });

  return {
    catalog,
    vehicles: rows.map((r) => mapPublicVehicle(r.vehicle)),
  };
}

export async function getPublicCatalogVehicle(params: {
  slug: string;
  vehicleId: string;
}) {
  const catalog = await getPublicCatalogBySlug(params.slug);
  if (!catalog) return null;

  const pub = await prisma.catalogPublication.findFirst({
    where: {
      catalogId: catalog.id,
      vehicleId: params.vehicleId,
      isActive: true,
      vehicle: {
        status: "ACTIVE",
        dealerRelationship: { in: CATALOG_ELIGIBLE_RELATIONSHIPS },
      },
    },
    include: {
      vehicle: { select: publicVehicleSelect },
    },
  });
  if (!pub) return null;

  return {
    catalog,
    vehicle: mapPublicVehicle(pub.vehicle),
  };
}

export type DealerCatalogWithPubs = Awaited<
  ReturnType<typeof getCatalogForDealer>
>;

export type PublicDealerCatalog = NonNullable<
  Awaited<ReturnType<typeof getPublicCatalogBySlug>>
>;

export type { DealerCatalog };

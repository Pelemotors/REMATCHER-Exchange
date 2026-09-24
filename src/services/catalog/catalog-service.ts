import "server-only";
import { prisma } from "@/lib/prisma";
import {
  Prisma,
  type CatalogStatus,
  type DealerCatalog,
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
  writeMediaFile,
} from "@/lib/media/storage";
import { processVehicleImage } from "@/lib/media/process";
import { randomBytes } from "node:crypto";
import { simulateCatalogFinance } from "@/services/catalog/finance-rules";
import { catalogPublicUrl } from "@/services/catalog/public-url";
import { newCatalogPublicId } from "@/services/catalog/public-id";
import { verifyCatalogPreviewToken } from "@/services/catalog/preview-token";
import { assertCatalogPublishReady } from "@/services/catalog/readiness";

export {
  CATALOG_ELIGIBLE_RELATIONSHIPS,
  CATALOG_BLOCKED_RELATIONSHIPS,
  checkCatalogPublishEligibility,
} from "@/services/catalog/eligibility";

export async function getCatalogForDealer(dealerId: string) {
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId },
    include: {
      publications: {
        where: { isActive: true },
        select: {
          id: true,
          vehicleId: true,
          publicId: true,
          publishedAt: true,
          isActive: true,
          showMonthlyFinance: true,
          showPrice: true,
          sortOrder: true,
          publicDescription: true,
        },
        orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }],
      },
      _count: { select: { publications: { where: { isActive: true } } } },
    },
  });
  if (!catalog) return null;
  return serializeDealerCatalog(catalog);
}

export function serializeDealerCatalog<
  T extends {
    slug: string;
    _count?: { publications: number };
    publications?: unknown[];
  },
>(catalog: T) {
  const vehicleCount =
    catalog._count?.publications ??
    (Array.isArray(catalog.publications) ? catalog.publications.length : 0);
  return {
    ...catalog,
    publicUrl: catalogPublicUrl(catalog.slug),
    vehicleCount,
  };
}

export type CatalogSettingsInput = {
  slug?: string;
  displayName?: string;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  themeKey?: string | null;
  openingHoursJson?: Prisma.InputJsonValue | null;
  allowSearchIndexing?: boolean;
  cityLabel?: string | null;
  publicationPolicy?: "MANUAL" | "ALL_ELIGIBLE_ACTIVE_INVENTORY";
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
        coverImageUrl: input.coverImageUrl ?? null,
        themeKey: input.themeKey ?? "MIDNIGHT_GOLD",
        openingHoursJson: input.openingHoursJson ?? undefined,
        allowSearchIndexing: input.allowSearchIndexing ?? false,
        cityLabel: input.cityLabel ?? null,
        status: "DRAFT",
      },
    });
    return {
      ok: true as const,
      catalog: serializeDealerCatalog({ ...catalog, publications: [], _count: { publications: 0 } }),
      created: true as const,
    };
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
  if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl;
  if (input.themeKey !== undefined) data.themeKey = input.themeKey ?? "MIDNIGHT_GOLD";
  if (input.openingHoursJson !== undefined) {
    data.openingHoursJson = input.openingHoursJson ?? Prisma.JsonNull;
  }
  if (input.allowSearchIndexing !== undefined) {
    data.allowSearchIndexing = input.allowSearchIndexing;
  }
  if (input.cityLabel !== undefined) data.cityLabel = input.cityLabel;
  if (input.publicationPolicy !== undefined) {
    data.publicationPolicy = input.publicationPolicy;
  }

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
  if (input.publicationPolicy) {
    const { reconcileCatalogForDealer } = await import("@/services/catalog/reconcile");
    await reconcileCatalogForDealer(dealerId);
  }
  return {
    ok: true as const,
    catalog: serializeDealerCatalog({ ...catalog, publications: [] }),
    created: false as const,
  };
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
  const ready = await assertCatalogPublishReady(dealerId);
  if (!ready.ok) {
    return { ok: false as const, error: ready.code, message: ready.message };
  }
  const updated = await prisma.dealerCatalog.update({
    where: { id: catalog.id },
    data: {
      status: "ENABLED",
      publishedAt: catalog.publishedAt ?? new Date(),
    },
  });
  return { ok: true as const, catalog: serializeDealerCatalog({ ...updated, publications: [] }) };
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
  return { ok: true as const, catalog: serializeDealerCatalog({ ...updated, publications: [] }) };
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
  return { ok: true as const, catalog: serializeDealerCatalog({ ...updated, publications: [] }) };
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
      publicId: newCatalogPublicId(),
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

export async function setCatalogPublicationFinance(params: {
  dealerId: string;
  vehicleId: string;
  showMonthlyFinance: boolean;
}) {
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId: params.dealerId },
  });
  if (!catalog) {
    return { ok: false as const, error: "catalog_required" as const };
  }
  const pub = await prisma.catalogPublication.findFirst({
    where: {
      catalogId: catalog.id,
      vehicleId: params.vehicleId,
      isActive: true,
    },
    include: {
      vehicle: { select: { retailPrice: true } },
    },
  });
  if (!pub) {
    return { ok: false as const, error: "not_published" as const };
  }
  if (params.showMonthlyFinance && pub.vehicle.retailPrice == null) {
    return {
      ok: false as const,
      error: "retail_price_required" as const,
      message: "יש להזין מחיר ללקוח כדי להציג החזר חודשי.",
    };
  }
  const publication = await prisma.catalogPublication.update({
    where: { id: pub.id },
    data: { showMonthlyFinance: params.showMonthlyFinance },
  });
  return { ok: true as const, publication };
}

export async function saveCatalogLogo(params: {
  dealerId: string;
  bytes: Buffer;
}) {
  const processed = await processVehicleImage(params.bytes);
  const token = randomBytes(12).toString("hex");
  const storageKey = `catalogs/${params.dealerId}/logo-${token}.webp`;
  await writeMediaFile(storageKey, processed.display);
  const logoUrl = publicUrlForStorageKey(storageKey);
  const result = await createOrUpdateCatalog(params.dealerId, { logoUrl });
  if (!result.ok) return result;
  return { ok: true as const, logoUrl };
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
  make: true,
  model: true,
  trim: true,
  year: true,
  mileage: true,
  color: true,
  ownershipHand: true,
  region: true,
  retailPrice: true,
  status: true,
  dealerRelationship: true,
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

type PublicPublicationFields = {
  publicId: string;
  showMonthlyFinance: boolean;
  showPrice: boolean;
  publicDescription: string | null;
};

function mapPublicVehicle(
  v: Prisma.VehicleGetPayload<{ select: typeof publicVehicleSelect }>,
  publication: PublicPublicationFields
) {
  const primary = v.media[0];
  const retailPrice = publication.showPrice ? v.retailPrice : null;
  const finance = simulateCatalogFinance({
    enabled: Boolean(publication.showMonthlyFinance),
    retailPrice,
    year: v.year,
    mileage: v.mileage,
  });
  return {
    publicId: publication.publicId,
    make: v.make,
    model: v.model,
    trim: v.trim,
    year: v.year,
    mileage: v.mileage,
    color: v.color,
    ownershipHand: v.ownershipHand,
    region: v.region,
    retailPrice,
    publicDescription: publication.publicDescription,
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
    finance: finance
      ? { monthlyIls: finance.monthlyIls, termMonths: finance.termMonths }
      : null,
  };
}

export async function getPublicCatalogBySlug(
  slug: string,
  opts?: { previewToken?: string | null }
) {
  const normalized = normalizeCatalogSlug(slug);
  if (!normalized) return null;

  const catalog = await prisma.dealerCatalog.findFirst({
    where: { slug: normalized },
    select: {
      id: true,
      dealerId: true,
      slug: true,
      displayName: true,
      phone: true,
      whatsapp: true,
      address: true,
      description: true,
      logoUrl: true,
      coverImageUrl: true,
      cityLabel: true,
      themeKey: true,
      allowSearchIndexing: true,
      publishedAt: true,
      status: true,
      dealer: { select: { phone: true } },
    },
  });
  if (!catalog) return null;
  const allowed =
    catalog.status === "ENABLED" ||
    Boolean(
      opts?.previewToken &&
        verifyCatalogPreviewToken(opts.previewToken, {
          catalogId: catalog.id,
          dealerId: catalog.dealerId,
        })
    );
  if (!allowed) return null;
  const { dealerId: _dealerId, ...publicCatalog } = catalog;
  return publicCatalog;
}

export async function listPublicCatalogVehicles(
  slug: string,
  opts?: { previewToken?: string | null }
) {
  const catalog = await getPublicCatalogBySlug(slug, opts);
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
    orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }],
    include: {
      vehicle: { select: publicVehicleSelect },
    },
  });

  const vehicles = rows.map((r) => mapPublicVehicle(r.vehicle, r));
  return {
    catalog,
    vehicles,
    preview: catalog.status !== "ENABLED",
    hasFinanceDisplay: vehicles.some((v) => v.finance != null),
  };
}

export async function getPublicCatalogVehicle(params: {
  slug: string;
  vehicleId: string;
  previewToken?: string | null;
}) {
  const catalog = await getPublicCatalogBySlug(params.slug, {
    previewToken: params.previewToken,
  });
  if (!catalog) return null;

  let pub = await prisma.catalogPublication.findFirst({
    where: { catalogId: catalog.id, publicId: params.vehicleId },
    include: { vehicle: { select: publicVehicleSelect } },
  });
  let resolvedViaLegacy = false;
  if (!pub) {
    pub = await prisma.catalogPublication.findFirst({
      where: { catalogId: catalog.id, vehicleId: params.vehicleId },
      include: { vehicle: { select: publicVehicleSelect } },
    });
    resolvedViaLegacy = Boolean(pub);
  }
  if (!pub) return null;

  const eligible =
    pub.isActive &&
    pub.vehicle.status === "ACTIVE" &&
    CATALOG_ELIGIBLE_RELATIONSHIPS.includes(pub.vehicle.dealerRelationship);

  if (!eligible) {
    return {
      kind: "unavailable" as const,
      catalog,
      canonicalPublicId: pub.publicId,
      resolvedViaLegacy,
    };
  }

  const vehicle = mapPublicVehicle(pub.vehicle, pub);
  return {
    kind: "ok" as const,
    catalog,
    vehicle,
    canonicalPublicId: pub.publicId,
    resolvedViaLegacy,
    preview: catalog.status !== "ENABLED",
    hasFinanceDisplay: vehicle.finance != null,
  };
}

export async function replaceCatalogPublications(params: {
  dealerId: string;
  vehicleIds: string[];
}) {
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId: params.dealerId },
  });
  if (!catalog) {
    return { ok: false as const, error: "catalog_required" as const };
  }

  const uniqueIds = [...new Set(params.vehicleIds.filter(Boolean))];
  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: uniqueIds }, dealerId: params.dealerId },
    select: {
      id: true,
      status: true,
      dealerRelationship: true,
      dealerId: true,
    },
  });
  const found = new Map(vehicles.map((v) => [v.id, v]));
  const failures: Array<{ vehicleId: string; error: string; message: string }> = [];
  for (const vehicleId of uniqueIds) {
    const vehicle = found.get(vehicleId);
    if (!vehicle) {
      failures.push({
        vehicleId,
        error: "not_found",
        message: "הרכב לא נמצא במלאי שלך.",
      });
      continue;
    }
    const eligibility = checkCatalogPublishEligibility(vehicle, params.dealerId);
    if (!eligibility.ok) {
      failures.push({
        vehicleId,
        error: eligibility.code,
        message: eligibility.message,
      });
    }
  }
  const eligibleIds = uniqueIds.filter(
    (vehicleId) => !failures.some((f) => f.vehicleId === vehicleId)
  );

  await prisma.$transaction(async (tx) => {
    await tx.catalogPublication.updateMany({
      where: {
        catalogId: catalog.id,
        vehicleId: { notIn: eligibleIds },
        isActive: true,
      },
      data: { isActive: false, unpublishedAt: new Date() },
    });
    for (const [index, vehicleId] of eligibleIds.entries()) {
      await tx.catalogPublication.upsert({
        where: {
          catalogId_vehicleId: { catalogId: catalog.id, vehicleId },
        },
        create: {
          catalogId: catalog.id,
          vehicleId,
          publicId: newCatalogPublicId(),
          isActive: true,
          publishedAt: new Date(),
          sortOrder: index,
        },
        update: {
          isActive: true,
          unpublishedAt: null,
          publishedAt: new Date(),
          sortOrder: index,
        },
      });
    }
  });

  return {
    ok: true as const,
    catalog: await getCatalogForDealer(params.dealerId),
    published: eligibleIds.length,
    failed: failures.length,
    failures,
  };
}

export async function updateCatalogPublicationForDealer(params: {
  dealerId: string;
  publicId: string;
  showPrice?: boolean;
  showMonthlyFinance?: boolean;
  sortOrder?: number;
  publicDescription?: string | null;
}) {
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId: params.dealerId },
  });
  if (!catalog) {
    return { ok: false as const, error: "catalog_required" as const };
  }
  const existing = await prisma.catalogPublication.findFirst({
    where: { catalogId: catalog.id, publicId: params.publicId },
    include: { vehicle: { select: { retailPrice: true } } },
  });
  if (!existing) {
    return { ok: false as const, error: "not_found" as const };
  }
  if (params.showMonthlyFinance && existing.vehicle.retailPrice == null) {
    return {
      ok: false as const,
      error: "retail_price_required" as const,
      message: "יש להזין מחיר ללקוח כדי להציג החזר חודשי.",
    };
  }
  const publication = await prisma.catalogPublication.update({
    where: { id: existing.id },
    data: {
      ...(params.showPrice !== undefined ? { showPrice: params.showPrice } : {}),
      ...(params.showMonthlyFinance !== undefined
        ? { showMonthlyFinance: params.showMonthlyFinance }
        : {}),
      ...(params.sortOrder !== undefined ? { sortOrder: params.sortOrder } : {}),
      ...(params.publicDescription !== undefined
        ? { publicDescription: params.publicDescription }
        : {}),
    },
  });
  return { ok: true as const, publication };
}

export async function saveCatalogCover(params: {
  dealerId: string;
  bytes: Buffer;
}) {
  const processed = await processVehicleImage(params.bytes);
  const token = randomBytes(12).toString("hex");
  const storageKey = `catalogs/${params.dealerId}/cover-${token}.webp`;
  await writeMediaFile(storageKey, processed.display);
  const coverImageUrl = publicUrlForStorageKey(storageKey);
  const result = await createOrUpdateCatalog(params.dealerId, { coverImageUrl });
  if (!result.ok) return result;
  return { ok: true as const, coverImageUrl };
}

export type DealerCatalogWithPubs = Awaited<
  ReturnType<typeof getCatalogForDealer>
>;

export type PublicDealerCatalog = NonNullable<
  Awaited<ReturnType<typeof getPublicCatalogBySlug>>
>;

export type { DealerCatalog };

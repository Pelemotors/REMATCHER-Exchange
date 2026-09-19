import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizePhoneIL } from "@/lib/phone";
import { upsertCustomerForDealer } from "@/services/customers";
import { notifyDealerUsers } from "@/services/notifications";
import { recordCatalogEvent } from "@/services/catalog/events";
import { getPublicCatalogBySlug } from "@/services/catalog/catalog-service";
import { CATALOG_ELIGIBLE_RELATIONSHIPS } from "@/services/catalog/eligibility";

const NAME_MAX = 80;
const MESSAGE_MAX = 500;
const COOLDOWN_MS = 15 * 60 * 1000;

export type SubmitCatalogLeadInput = {
  slug: string;
  name: string;
  phone: string;
  message?: string | null;
  publicId?: string | null;
  clientSubmissionId: string;
  honeypot?: string | null;
  consentVersion?: string | null;
};

export async function submitCatalogLead(input: SubmitCatalogLeadInput) {
  if (input.honeypot && input.honeypot.trim()) {
    return { ok: true as const, duplicate: false as const, discarded: true as const };
  }

  const clientSubmissionId = input.clientSubmissionId.trim();
  if (!clientSubmissionId || clientSubmissionId.length > 80) {
    return { ok: false as const, error: "invalid_submission" as const };
  }

  const name = input.name.trim().slice(0, NAME_MAX);
  if (name.length < 2) {
    return { ok: false as const, error: "invalid_name" as const };
  }

  const rawPhone = input.phone.trim();
  const normalizedPhone = normalizePhoneIL(rawPhone);
  if (!normalizedPhone) {
    return { ok: false as const, error: "invalid_phone" as const };
  }

  const message = input.message?.trim().slice(0, MESSAGE_MAX) || null;
  const catalog = await getPublicCatalogBySlug(input.slug);
  if (!catalog) {
    return { ok: false as const, error: "catalog_not_found" as const };
  }

  const dealer = await prisma.dealerCatalog.findUnique({
    where: { id: catalog.id },
    select: { dealerId: true },
  });
  if (!dealer) {
    return { ok: false as const, error: "catalog_not_found" as const };
  }

  let publicationId: string | null = null;
  let vehicleId: string | null = null;
  if (input.publicId) {
    const pub = await prisma.catalogPublication.findFirst({
      where: {
        catalogId: catalog.id,
        publicId: input.publicId,
        isActive: true,
        vehicle: {
          status: "ACTIVE",
          dealerRelationship: { in: CATALOG_ELIGIBLE_RELATIONSHIPS },
        },
      },
      select: { id: true, vehicleId: true },
    });
    if (!pub) {
      return { ok: false as const, error: "publication_not_found" as const };
    }
    publicationId = pub.id;
    vehicleId = pub.vehicleId;
  }

  const existingSubmission = await prisma.catalogLead.findUnique({
    where: { clientSubmissionId },
    select: { id: true },
  });
  if (existingSubmission) {
    return { ok: true as const, duplicate: true as const, discarded: false as const };
  }

  const recent = await prisma.catalogLead.findFirst({
    where: {
      catalogId: catalog.id,
      normalizedPhone,
      createdAt: { gte: new Date(Date.now() - COOLDOWN_MS) },
    },
    select: { id: true },
  });
  if (recent) {
    return { ok: false as const, error: "rate_limited" as const };
  }

  const customer = await upsertCustomerForDealer({
    dealerId: dealer.dealerId,
    name,
    phone: rawPhone,
    source: { origin: "CATALOG" },
    preserveExisting: true,
  });

  try {
    const lead = await prisma.catalogLead.create({
      data: {
        catalogId: catalog.id,
        dealerId: dealer.dealerId,
        publicationId,
        vehicleId,
        customerId: customer.customer.id,
        name,
        rawPhone,
        normalizedPhone,
        message,
        source: "PUBLIC_FORM",
        clientSubmissionId,
        consentVersion: input.consentVersion ?? "catalog-lead-v1",
        consentedAt: new Date(),
      },
    });

    await recordCatalogEvent({
      catalogId: catalog.id,
      eventType: "LEAD_SUBMITTED",
      publicationId,
      vehicleId,
      clientEventId: `lead:${lead.id}`,
    });

    await notifyDealerUsers(dealer.dealerId, {
      type: "CATALOG_LEAD",
      title: "פנייה חדשה מהקטלוג",
      body: `${name} השאיר פנייה בקטלוג הציבורי.`,
      link: `/catalog/leads/${lead.id}`,
      entityType: "CatalogLead",
      entityId: lead.id,
      sendPush: true,
    }).catch(() => undefined);

    return { ok: true as const, duplicate: false as const, discarded: false as const };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: true as const, duplicate: true as const, discarded: false as const };
    }
    throw err;
  }
}

export async function listCatalogLeadsForDealer(params: {
  dealerId: string;
  take?: number;
}) {
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId: params.dealerId },
    select: { id: true },
  });
  if (!catalog) return { leads: [] as const };

  const leads = await prisma.catalogLead.findMany({
    where: { catalogId: catalog.id },
    orderBy: { createdAt: "desc" },
    take: Math.min(params.take ?? 50, 100),
    select: {
      id: true,
      name: true,
      rawPhone: true,
      message: true,
      status: true,
      createdAt: true,
      customerId: true,
      vehicleId: true,
      publication: {
        select: {
          publicId: true,
          vehicle: { select: { make: true, model: true, year: true } },
        },
      },
    },
  });

  return {
    leads: leads.map((lead) => ({
      id: lead.id,
      name: lead.name,
      phone: lead.rawPhone,
      message: lead.message,
      status: lead.status,
      createdAt: lead.createdAt.toISOString(),
      customerId: lead.customerId,
      publicId: lead.publication?.publicId ?? null,
      vehicleTitle: lead.publication
        ? [lead.publication.vehicle.make, lead.publication.vehicle.model, lead.publication.vehicle.year]
            .filter(Boolean)
            .join(" ")
        : null,
    })),
  };
}

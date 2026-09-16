import "server-only";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { normalizePhoneIL } from "@/lib/phone";
import type { CustomerStatus, Prisma } from "@prisma/client";

export type UpsertCustomerInput = {
  dealerId: string;
  name?: string | null;
  phone?: string | null;
  notes?: string | null;
  source?: Record<string, unknown>;
};

/**
 * Resolve or create Customer for a Dealer.
 * - Same normalizedPhone → same Customer (name may soft-update if empty/similar).
 * - Same name + different phone → new Customer (no auto-merge).
 * - No phone → always create partial Customer (unless exact id provided elsewhere).
 */
export async function upsertCustomerForDealer(
  input: UpsertCustomerInput
): Promise<{ customer: { id: string; name: string | null; normalizedPhone: string | null }; created: boolean; linkedExisting: boolean }> {
  const normalizedPhone = normalizePhoneIL(input.phone);
  const name = input.name?.trim() || null;

  if (normalizedPhone) {
    const existing = await prisma.customer.findUnique({
      where: {
        dealerId_normalizedPhone: {
          dealerId: input.dealerId,
          normalizedPhone,
        },
      },
    });
    if (existing) {
      const nextName =
        !existing.name && name
          ? name
          : existing.name && name && namesSoftMatch(existing.name, name)
            ? existing.name
            : existing.name ?? name;
      const updated = await prisma.customer.update({
        where: { id: existing.id },
        data: {
          name: nextName,
          rawPhone: input.phone ?? existing.rawPhone,
          ...(input.notes ? { notes: input.notes } : {}),
          ...(input.source
            ? { sourceJson: toPrismaJson({ ...(existing.sourceJson as object), ...input.source }) }
            : {}),
        },
      });
      return {
        customer: {
          id: updated.id,
          name: updated.name,
          normalizedPhone: updated.normalizedPhone,
        },
        created: false,
        linkedExisting: true,
      };
    }
  }

  const created = await prisma.customer.create({
    data: {
      dealerId: input.dealerId,
      name,
      normalizedPhone,
      rawPhone: input.phone ?? null,
      notes: input.notes ?? null,
      sourceJson: input.source ? toPrismaJson(input.source) : undefined,
    },
  });
  return {
    customer: {
      id: created.id,
      name: created.name,
      normalizedPhone: created.normalizedPhone,
    },
    created: true,
    linkedExisting: false,
  };
}

function namesSoftMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase().replace(/\s+/g, " ");
  const nb = b.trim().toLowerCase().replace(/\s+/g, " ");
  if (na === nb) return true;
  // Allow one-edit / substring for Hebrew nicknames lightly
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

export async function listCustomersForDealer(dealerId: string, opts?: { q?: string; take?: number }) {
  const take = Math.min(opts?.take ?? 50, 100);
  const q = opts?.q?.trim();
  const where: Prisma.CustomerWhereInput = {
    dealerId,
    status: "ACTIVE",
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { rawPhone: { contains: q } },
            { normalizedPhone: { contains: q.replace(/\D/g, "") } },
          ],
        }
      : {}),
  };
  return prisma.customer.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take,
    include: {
      demands: {
        where: { status: { in: ["ACTIVE", "PAUSED", "PENDING_CONFIRMATION"] } },
        select: { id: true, status: true, rawText: true, updatedAt: true },
        take: 10,
      },
    },
  });
}

export async function getCustomerForDealer(dealerId: string, customerId: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, dealerId },
    include: {
      demands: { orderBy: { updatedAt: "desc" }, take: 20 },
    },
  });
}

export async function archiveCustomer(dealerId: string, customerId: string) {
  const c = await prisma.customer.findFirst({ where: { id: customerId, dealerId } });
  if (!c) return null;
  return prisma.customer.update({
    where: { id: customerId },
    data: { status: "ARCHIVED" satisfies CustomerStatus },
  });
}

export async function attachDemandToCustomer(params: {
  dealerId: string;
  demandId: string;
  customerId: string;
}) {
  const [demand, customer] = await Promise.all([
    prisma.demand.findFirst({ where: { id: params.demandId, dealerId: params.dealerId } }),
    prisma.customer.findFirst({ where: { id: params.customerId, dealerId: params.dealerId } }),
  ]);
  if (!demand || !customer) return { ok: false as const, error: "not_found" };
  const updated = await prisma.demand.update({
    where: { id: demand.id },
    data: { customerId: customer.id },
  });
  return { ok: true as const, demand: updated };
}

import "server-only";
import { prisma } from "@/lib/prisma";
import type { AdminSearchHit } from "@/services/admin/search-types";

export type { AdminSearchHit } from "@/services/admin/search-types";
export { ADMIN_SEARCH_TYPE_LABEL } from "@/services/admin/search-types";

function take(q: string) {
  return q.trim().slice(0, 80);
}

export async function searchAdminEntities(
  raw: string
): Promise<AdminSearchHit[]> {
  const q = take(raw);
  if (q.length < 2) return [];

  const hits: AdminSearchHit[] = [];
  const contains = { contains: q, mode: "insensitive" as const };
  const digits = q.replace(/\D/g, "");
  const vehicleWhere = {
    OR: [
      { make: contains },
      { model: contains },
      { rawInput: contains },
      ...(digits.length >= 5 ? [{ rawInput: { contains: digits, mode: "insensitive" as const } }] : []),
    ],
  };

  const [users, dealers, customers, vehicles, demands, intakes, catalogs, plates] =
    await Promise.all([
      prisma.user.findMany({
        where: { OR: [{ email: contains }, { name: contains }] },
        take: 8,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      }),
      prisma.dealer.findMany({
        where: {
          OR: [
            { businessName: contains },
            { contactName: contains },
            { email: contains },
            { phone: contains },
          ],
        },
        take: 8,
        select: {
          id: true,
          businessName: true,
          verificationStatus: true,
          city: true,
        },
      }),
      prisma.customer.findMany({
        where: {
          OR: [
            { name: contains },
            { rawPhone: contains },
            { normalizedPhone: contains },
          ],
        },
        take: 8,
        select: {
          id: true,
          name: true,
          rawPhone: true,
          dealer: { select: { businessName: true } },
        },
      }),
      prisma.vehicle.findMany({
        where: vehicleWhere,
        take: 8,
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          dealerRelationship: true,
          visibility: true,
          dealer: { select: { businessName: true } },
        },
      }),
      prisma.demand.findMany({
        where: { rawText: contains },
        take: 8,
        select: {
          id: true,
          status: true,
          rawText: true,
          dealer: { select: { businessName: true } },
        },
      }),
      prisma.intakeBatch.findMany({
        where: {
          OR: [{ clientBatchId: contains }, { failureCode: contains }],
        },
        take: 6,
        select: {
          id: true,
          status: true,
          source: true,
          dealer: { select: { businessName: true } },
        },
      }),
      prisma.dealerCatalog.findMany({
        where: {
          OR: [{ slug: contains }, { displayName: contains }],
        },
        take: 6,
        select: {
          id: true,
          slug: true,
          displayName: true,
          status: true,
        },
      }),
      digits.length >= 5
        ? prisma.vehicleCandidate.findMany({
            where: {
              OR: [
                { plateNormalized: { contains: digits } },
                { detectedPlate: { contains: digits } },
              ],
            },
            take: 6,
            select: {
              id: true,
              plateNormalized: true,
              detectedPlate: true,
              batchId: true,
              dealer: { select: { businessName: true } },
            },
          })
        : Promise.resolve([]),
    ]);

  for (const u of users) {
    hits.push({
      type: "user",
      id: u.id,
      title: u.name || u.email,
      subtitle: `${u.email} · ${u.role}`,
      href: `/admin/users/${u.id}`,
    });
  }
  for (const d of dealers) {
    hits.push({
      type: "dealer",
      id: d.id,
      title: d.businessName,
      subtitle: `${d.verificationStatus}${d.city ? ` · ${d.city}` : ""}`,
      href: `/admin/dealers/${d.id}`,
    });
  }
  for (const c of customers) {
    hits.push({
      type: "customer",
      id: c.id,
      title: c.name || "לקוח",
      subtitle: `${c.dealer.businessName}${c.rawPhone ? ` · ${c.rawPhone}` : ""}`,
      href: `/admin/customers?focus=${c.id}`,
    });
  }
  for (const v of vehicles) {
    hits.push({
      type: "vehicle",
      id: v.id,
      title: [v.make, v.model, v.year].filter(Boolean).join(" ") || "רכב",
      subtitle: `${v.dealer.businessName} · ${v.dealerRelationship} · ${v.visibility}`,
      href: `/admin/vehicles?focus=${v.id}`,
    });
  }
  for (const d of demands) {
    hits.push({
      type: "demand",
      id: d.id,
      title: (d.rawText ?? "חיפוש").slice(0, 80),
      subtitle: `${d.dealer.businessName} · ${d.status}`,
      href: `/admin/demands?focus=${d.id}`,
    });
  }
  for (const b of intakes) {
    hits.push({
      type: "intake",
      id: b.id,
      title: `Intake ${b.status}`,
      subtitle: `${b.dealer.businessName} · ${b.source}`,
      href: `/admin/intakes?focus=${b.id}`,
    });
  }
  for (const c of catalogs) {
    hits.push({
      type: "catalog",
      id: c.id,
      title: c.displayName,
      subtitle: `${c.slug}.rematcher.co.il · ${c.status}`,
      href: `/admin/catalogs`,
    });
  }
  for (const p of plates) {
    hits.push({
      type: "intake",
      id: p.batchId,
      title: `לוחית ${p.plateNormalized || p.detectedPlate || digits}`,
      subtitle: `${p.dealer.businessName} · מועמד Intake`,
      href: `/admin/intakes?focus=${p.batchId}`,
    });
  }

  if (/^[a-z0-9-]{8,}$/i.test(q) || q.length >= 12) {
    const matches = await prisma.candidateMatch.findMany({
      where: { OR: [{ id: q }, { demandId: q }, { vehicleId: q }] },
      take: 6,
      select: {
        id: true,
        status: true,
        demand: { select: { dealer: { select: { businessName: true } } } },
        vehicle: { select: { make: true, model: true } },
      },
    });
    for (const m of matches) {
      hits.push({
        type: "match",
        id: m.id,
        title: `${m.vehicle.make ?? ""} ${m.vehicle.model ?? ""}`.trim() || "התאמה",
        subtitle: `${m.demand.dealer.businessName} · ${m.status}`,
        href: `/admin/matches?focus=${m.id}`,
      });
    }
  }

  return hits.slice(0, 40);
}

import "server-only";
import { prisma } from "@/lib/prisma";

export type CatalogAnalyticsRange = "7d" | "30d";

function rangeStart(range: CatalogAnalyticsRange): Date {
  const days = range === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function getCatalogAnalyticsForDealer(params: {
  dealerId: string;
  range?: CatalogAnalyticsRange;
}) {
  const range = params.range === "7d" ? "7d" : "30d";
  const since = rangeStart(range);
  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId: params.dealerId },
    select: { id: true },
  });
  if (!catalog) {
    return emptyAnalytics(range);
  }

  const [events, leads] = await Promise.all([
    prisma.catalogEvent.findMany({
      where: { catalogId: catalog.id, createdAt: { gte: since } },
      select: {
        eventType: true,
        createdAt: true,
        publicationId: true,
        vehicleId: true,
      },
    }),
    prisma.catalogLead.findMany({
      where: { catalogId: catalog.id, createdAt: { gte: since } },
      select: { createdAt: true, publicationId: true, vehicleId: true },
    }),
  ]);

  const countType = (type: string) =>
    events.filter((e) => e.eventType === type).length;

  const views = countType("CATALOG_VIEW");
  const vehicleViews = countType("VEHICLE_VIEW");
  const whatsappClicks = countType("WHATSAPP_CLICK");
  const phoneClicks = countType("PHONE_CLICK");
  const leadCount = leads.length;

  const days: Array<{ day: string; views: number; leads: number }> = [];
  const dayCount = range === "7d" ? 7 : 30;
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      day: key,
      views: events.filter(
        (e) =>
          (e.eventType === "CATALOG_VIEW" || e.eventType === "VEHICLE_VIEW") &&
          e.createdAt.toISOString().slice(0, 10) === key
      ).length,
      leads: leads.filter((l) => l.createdAt.toISOString().slice(0, 10) === key)
        .length,
    });
  }

  const viewByVehicle = new Map<string, { views: number; leads: number; vehicleId: string | null }>();
  for (const e of events) {
    if (e.eventType !== "VEHICLE_VIEW" || !e.publicationId) continue;
    const cur = viewByVehicle.get(e.publicationId) ?? {
      views: 0,
      leads: 0,
      vehicleId: e.vehicleId,
    };
    cur.views += 1;
    viewByVehicle.set(e.publicationId, cur);
  }
  for (const lead of leads) {
    if (!lead.publicationId) continue;
    const cur = viewByVehicle.get(lead.publicationId) ?? {
      views: 0,
      leads: 0,
      vehicleId: lead.vehicleId,
    };
    cur.leads += 1;
    viewByVehicle.set(lead.publicationId, cur);
  }

  const topIds = [...viewByVehicle.entries()]
    .sort((a, b) => b[1].views + b[1].leads * 3 - (a[1].views + a[1].leads * 3))
    .slice(0, 5);

  const pubs = topIds.length
    ? await prisma.catalogPublication.findMany({
        where: { id: { in: topIds.map(([id]) => id) } },
        select: {
          id: true,
          publicId: true,
          vehicle: { select: { make: true, model: true, year: true } },
        },
      })
    : [];

  const topVehicles = topIds.map(([id, stats]) => {
    const pub = pubs.find((p) => p.id === id);
    return {
      publicId: pub?.publicId ?? null,
      title: pub
        ? [pub.vehicle.make, pub.vehicle.model, pub.vehicle.year]
            .filter(Boolean)
            .join(" ")
        : "רכב",
      views: stats.views,
      leads: stats.leads,
    };
  });

  return {
    range,
    views,
    vehicleViews,
    whatsappClicks,
    phoneClicks,
    leads: leadCount,
    trend: days,
    topVehicles,
  };
}

function emptyAnalytics(range: CatalogAnalyticsRange) {
  return {
    range,
    views: 0,
    vehicleViews: 0,
    whatsappClicks: 0,
    phoneClicks: 0,
    leads: 0,
    trend: [] as Array<{ day: string; views: number; leads: number }>,
    topVehicles: [] as Array<{
      publicId: string | null;
      title: string;
      views: number;
      leads: number;
    }>,
  };
}

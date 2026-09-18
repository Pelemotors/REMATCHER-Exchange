import "server-only";
import { prisma } from "@/lib/prisma";
import { confirmedFromJson } from "@/lib/demand-display";
import {
  cloakCount,
  minCohort,
  minDistinctDealers,
} from "@/services/exchange-intelligence/engine";

const TAPE_EVENT_TYPES = [
  "INVENTORY_ADDED",
  "INVENTORY_UPDATED",
  "INVENTORY_REMOVED",
  "INVENTORY_REACTIVATED",
  "demand_created",
  "demand_renewed",
  "demand_closed",
  "demand_expired",
  "MATCH_DEAL_CONFIRMED",
  "MATCH_NO_DEAL",
] as const;

const TAPE_WINDOW_DAYS = 14;
const TAPE_ROW_LIMIT = 2000;

type TapeBucket = {
  eventType: string;
  make: string;
  model: string;
  eventCount: number;
  dealerIds: Set<string>;
};

function bucketKey(eventType: string, make: string, model: string): string {
  return `${eventType}\0${make}\0${model}`;
}

/**
 * Privacy-safe aggregated market tape — counts by make/model, no dealer identity or raw prices.
 */
export async function getMarketTape() {
  const since = new Date(Date.now() - TAPE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const events = await prisma.exchangeEvent.findMany({
    where: {
      occurredAt: { gte: since },
      eventType: { in: [...TAPE_EVENT_TYPES] },
    },
    select: {
      eventType: true,
      dealerId: true,
      vehicleId: true,
      demandId: true,
    },
    orderBy: { occurredAt: "desc" },
    take: TAPE_ROW_LIMIT,
  });

  const vehicleIds = [
    ...new Set(events.map((e) => e.vehicleId).filter(Boolean)),
  ] as string[];
  const demandIds = [
    ...new Set(events.map((e) => e.demandId).filter(Boolean)),
  ] as string[];

  const [vehicles, demands] = await Promise.all([
    vehicleIds.length
      ? prisma.vehicle.findMany({
          where: { id: { in: vehicleIds } },
          select: { id: true, make: true, model: true },
        })
      : Promise.resolve([]),
    demandIds.length
      ? prisma.demand.findMany({
          where: { id: { in: demandIds } },
          select: { id: true, confirmedJson: true },
        })
      : Promise.resolve([]),
  ]);

  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  const demandMap = new Map(demands.map((d) => [d.id, d]));

  const buckets = new Map<string, TapeBucket>();

  for (const ev of events) {
    let make = "UNKNOWN";
    let model = "UNKNOWN";
    if (ev.vehicleId) {
      const v = vehicleMap.get(ev.vehicleId);
      if (v?.make) make = v.make;
      if (v?.model) model = v.model;
    } else if (ev.demandId) {
      const d = demandMap.get(ev.demandId);
      if (d?.confirmedJson) {
        const c = confirmedFromJson(d.confirmedJson);
        if (c.make) make = String(c.make);
        if (c.model) model = String(c.model);
      }
    }
    if (make === "UNKNOWN" && model === "UNKNOWN") continue;

    const key = bucketKey(ev.eventType, make, model);
    let b = buckets.get(key);
    if (!b) {
      b = {
        eventType: ev.eventType,
        make,
        model,
        eventCount: 0,
        dealerIds: new Set(),
      };
      buckets.set(key, b);
    }
    b.eventCount += 1;
    if (ev.dealerId) b.dealerIds.add(ev.dealerId);
  }

  const min = minCohort();
  const minDealers = minDistinctDealers();

  const segments = [...buckets.values()]
    .map((b) => {
      const dealers = b.dealerIds.size;
      const countCloak = cloakCount(b.eventCount, min, dealers, minDealers);
      return {
        eventType: b.eventType,
        make: b.make,
        model: b.model,
        eventCount: countCloak.value,
        distinctDealers: countCloak.insufficientData ? null : dealers,
        insufficientData: countCloak.insufficientData,
      };
    })
    .filter((s) => !s.insufficientData)
    .sort((a, b) => (b.eventCount ?? 0) - (a.eventCount ?? 0))
    .slice(0, 40);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: TAPE_WINDOW_DAYS,
    segments,
    suppressedSmallCohorts: true,
  };
}

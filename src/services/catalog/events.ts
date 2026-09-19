import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ServerCatalogEventType } from "@/services/catalog/event-types";

export {
  PUBLIC_CATALOG_EVENT_TYPES,
  SERVER_ONLY_CATALOG_EVENT_TYPES,
  isPublicCatalogEventType,
} from "@/services/catalog/event-types";
export type {
  PublicCatalogEventType,
  ServerCatalogEventType,
} from "@/services/catalog/event-types";

const HOST_MAX = 120;
const UTM_MAX = 80;

export async function recordCatalogEvent(input: {
  catalogId: string;
  eventType: ServerCatalogEventType;
  publicationId?: string | null;
  vehicleId?: string | null;
  clientEventId?: string | null;
  sessionHash?: string | null;
  referrerHost?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}) {
  const clientEventId = input.clientEventId?.trim() || null;
  try {
    const row = await prisma.catalogEvent.create({
      data: {
        catalogId: input.catalogId,
        eventType: input.eventType,
        publicationId: input.publicationId ?? null,
        vehicleId: input.vehicleId ?? null,
        clientEventId,
        sessionHash: clip(input.sessionHash, 64),
        referrerHost: clipHost(input.referrerHost),
        utmSource: clip(input.utmSource, UTM_MAX),
        utmMedium: clip(input.utmMedium, UTM_MAX),
        utmCampaign: clip(input.utmCampaign, UTM_MAX),
      },
    });
    return { ok: true as const, event: row, duplicate: false as const };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      clientEventId
    ) {
      return { ok: true as const, event: null, duplicate: true as const };
    }
    throw err;
  }
}

function clip(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function clipHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const host = value.includes("://") ? new URL(value).host : value;
    return host.replace(/^www\./, "").slice(0, HOST_MAX);
  } catch {
    return value.replace(/[^a-zA-Z0-9.:-]/g, "").slice(0, HOST_MAX);
  }
}

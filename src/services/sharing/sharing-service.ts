import "server-only";
import { prisma } from "@/lib/prisma";
import { getCatalogForDealer } from "@/services/catalog/catalog-service";
import { catalogPublicUrl, catalogPublicVehicleUrl } from "@/services/catalog/public-url";
import { CATALOG_ELIGIBLE_RELATIONSHIPS } from "@/services/catalog/eligibility";
import { logAppEvent } from "@/services/notifications";

export const SHARE_KINDS = ["CATALOG", "VEHICLE", "DEMAND"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export const SHARE_ACTIONS = [
  "SHARE_MENU_OPENED",
  "WHATSAPP_OPENED",
  "SYSTEM_SHARE_OPENED",
  "LINK_COPIED",
  "TEXT_COPIED",
  "QR_OPENED",
  "PUBLISH_AND_SHARE_CONFIRMED",
] as const;
export type ShareAction = (typeof SHARE_ACTIONS)[number];

export type ShareRemediation =
  | "CREATE_CATALOG"
  | "ENABLE_CATALOG"
  | "CAN_PUBLISH_TO_CATALOG"
  | null;

export function isShareKind(value: unknown): value is ShareKind {
  return typeof value === "string" && (SHARE_KINDS as readonly string[]).includes(value);
}

export function isShareAction(value: unknown): value is ShareAction {
  return typeof value === "string" && (SHARE_ACTIONS as readonly string[]).includes(value);
}

export async function resolveOutboundShare(params: {
  dealerId: string;
  kind: ShareKind;
  resourceId?: string | null;
}) {
  if (params.kind === "CATALOG") {
    return resolveCatalogShare(params.dealerId);
  }
  if (params.kind === "VEHICLE") {
    if (!params.resourceId) {
      return { ok: false as const, error: "resource_required" as const };
    }
    return resolveVehicleShare(params.dealerId, params.resourceId);
  }
  if (!params.resourceId) {
    return { ok: false as const, error: "resource_required" as const };
  }
  return resolveDemandShare(params.dealerId, params.resourceId);
}

async function resolveCatalogShare(dealerId: string) {
  const catalog = await getCatalogForDealer(dealerId);
  if (!catalog) {
    return {
      ok: true as const,
      payload: {
        kind: "CATALOG" as const,
        title: "קטלוג",
        message: null,
        url: null,
        canShareUrl: false,
        capabilities: {
          whatsapp: false,
          systemShare: false,
          copyLink: false,
          qr: false,
          publishAndShare: false,
        },
        remediation: "CREATE_CATALOG" as ShareRemediation,
      },
    };
  }
  const enabled = catalog.status === "ENABLED";
  const url = enabled ? catalogPublicUrl(catalog.slug) : null;
  const title = catalog.displayName;
  const message = url ? `היי, זה הקטלוג של ${title}: ${url}` : null;
  return {
    ok: true as const,
    payload: {
      kind: "CATALOG" as const,
      title,
      message,
      url,
      canShareUrl: Boolean(url),
      capabilities: {
        whatsapp: Boolean(url),
        systemShare: Boolean(url),
        copyLink: Boolean(url),
        qr: Boolean(url),
        publishAndShare: !enabled && catalog.vehicleCount > 0,
      },
      remediation: enabled ? null : ("ENABLE_CATALOG" as ShareRemediation),
    },
  };
}

async function resolveVehicleShare(dealerId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId },
    select: {
      id: true,
      status: true,
      dealerRelationship: true,
      make: true,
      model: true,
      year: true,
      trim: true,
    },
  });
  if (!vehicle) {
    return { ok: false as const, error: "not_found" as const };
  }
  const eligibleRel = CATALOG_ELIGIBLE_RELATIONSHIPS.includes(
    vehicle.dealerRelationship
  );
  if (vehicle.status !== "ACTIVE" || !eligibleRel) {
    return { ok: false as const, error: "not_shareable" as const };
  }

  const catalog = await prisma.dealerCatalog.findUnique({
    where: { dealerId },
    include: {
      publications: {
        where: { vehicleId, isActive: true },
        select: { publicId: true, isActive: true },
      },
    },
  });
  const pub = catalog?.publications[0];
  const catalogEnabled = catalog?.status === "ENABLED";
  const published = Boolean(pub && catalogEnabled);
  const url =
    published && catalog && pub
      ? catalogPublicVehicleUrl(catalog.slug, pub.publicId)
      : null;
  const title = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") || "רכב";
  const message = url
    ? `יש לי ${title} זמין. אפשר לראות אותו כאן: ${url}`
    : `יש לי ${title} זמין. אשמח לשלוח פרטים נוספים.`;

  let remediation: ShareRemediation = null;
  if (!url) {
    if (!catalog) remediation = "CREATE_CATALOG";
    else if (!catalogEnabled) remediation = "ENABLE_CATALOG";
    else remediation = "CAN_PUBLISH_TO_CATALOG";
  }

  return {
    ok: true as const,
    payload: {
      kind: "VEHICLE" as const,
      resourceId: vehicle.id,
      title,
      message,
      url,
      canShareUrl: Boolean(url),
      capabilities: {
        whatsapp: true,
        systemShare: true,
        copyLink: Boolean(url),
        qr: Boolean(url),
        publishAndShare: !url && Boolean(catalog),
      },
      remediation,
    },
  };
}

async function resolveDemandShare(dealerId: string, demandId: string) {
  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId },
    select: {
      id: true,
      status: true,
      confirmedAt: true,
      constraints: { select: { field: true, value: true } },
    },
  });
  if (!demand) {
    return { ok: false as const, error: "not_found" as const };
  }
  if (!demand.confirmedAt || demand.status === "DRAFT") {
    return { ok: false as const, error: "not_shareable" as const };
  }

  const fields = new Map(
    demand.constraints.map((c) => [c.field, c.value] as const)
  );
  const make = jsonText(fields.get("make"));
  const model = jsonText(fields.get("model"));
  const yearMin = jsonNum(fields.get("yearMin") ?? fields.get("year"));
  const yearMax = jsonNum(fields.get("yearMax"));
  const parts = [make, model].filter(Boolean);
  if (yearMin && yearMax && yearMin !== yearMax) parts.push(`${yearMin}–${yearMax}`);
  else if (yearMin) parts.push(String(yearMin));
  const title = parts.join(" ") || "חיפוש רכב";
  const message = `מחפש ${title}`;

  return {
    ok: true as const,
    payload: {
      kind: "DEMAND" as const,
      resourceId: demand.id,
      title,
      message,
      url: null,
      canShareUrl: false,
      capabilities: {
        whatsapp: true,
        systemShare: true,
        copyLink: false,
        qr: false,
        publishAndShare: false,
      },
      remediation: null,
    },
  };
}

/** Publish first, then resolve URL. Never reports shared if publish failed. Does not enable the whole catalog. */
export async function publishThenShareVehicle(params: {
  dealerId: string;
  vehicleId: string;
}) {
  const { publishVehicleToCatalog } = await import(
    "@/services/catalog/catalog-service"
  );
  const published = await publishVehicleToCatalog({
    dealerId: params.dealerId,
    vehicleId: params.vehicleId,
  });
  if (!published.ok) return published;
  return resolveOutboundShare({
    dealerId: params.dealerId,
    kind: "VEHICLE",
    resourceId: params.vehicleId,
  });
}

export async function recordShareEvent(params: {
  dealerId: string;
  userId?: string | null;
  kind: ShareKind;
  action: ShareAction;
  resourceId?: string | null;
  channel?: string | null;
  clientEventId?: string | null;
}) {
  await logAppEvent({
    eventType: params.action,
    entityType: params.kind,
    entityId: params.resourceId ?? undefined,
    dealerId: params.dealerId,
    userId: params.userId ?? undefined,
    source: "outbound_share",
    idempotencyKey: params.clientEventId ?? undefined,
    metadata: {
      kind: params.kind,
      channel: params.channel ?? null,
    },
  });
  return { ok: true as const };
}

function jsonText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "value" in (value as object)) {
    return jsonText((value as { value: unknown }).value);
  }
  return null;
}

function jsonNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

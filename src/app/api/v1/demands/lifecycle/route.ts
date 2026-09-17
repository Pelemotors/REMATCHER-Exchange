import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { prisma } from "@/lib/prisma";
import {
  computeDemandExpiry,
  runMatchingForDemand,
} from "@/services/domain/matching-flow";
import { logAppEvent } from "@/services/notifications";

export const dynamic = "force-dynamic";

const ACTIONS = new Set([
  "close",
  "pause",
  "resume",
  "renew",
  "publish_network",
  "unpublish_network",
]);

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as { demandId?: unknown; action?: unknown };
  const demandId = typeof body.demandId === "string" ? body.demandId : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!demandId || !ACTIONS.has(action)) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const dealerId = principal.dealerId;
  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId },
  });
  if (!demand) {
    return v1Error(ctx, "RESOURCE_NOT_FOUND");
  }

  if (action === "close") {
    const updated = await prisma.demand.update({
      where: { id: demandId },
      data: { status: "CANCELLED" },
    });
    await logAppEvent({
      eventType: "demand_closed",
      entityType: "Demand",
      entityId: demandId,
      dealerId,
    });
    return v1Json(ctx, updated);
  }

  if (action === "pause") {
    const { pauseDemandForDealer } = await import(
      "@/services/demand/demand-mutations"
    );
    const result = await pauseDemandForDealer({ dealerId, demandId });
    if (!result.ok) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    return v1Json(ctx, result.demand);
  }

  if (action === "resume") {
    const { resumeDemandForDealer } = await import(
      "@/services/demand/demand-mutations"
    );
    const result = await resumeDemandForDealer({ dealerId, demandId });
    if (!result.ok) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    return v1Json(ctx, result.demand);
  }

  if (action === "publish_network") {
    const updated = await prisma.demand.update({
      where: { id: demandId },
      data: { networkVisibility: "ANONYMOUS_NETWORK" },
    });
    if (updated.status === "ACTIVE") {
      void runMatchingForDemand(demandId).catch(() => undefined);
    }
    return v1Json(ctx, updated);
  }

  if (action === "unpublish_network") {
    const updated = await prisma.demand.update({
      where: { id: demandId },
      data: { networkVisibility: "PRIVATE" },
    });
    return v1Json(ctx, updated);
  }

  if (action === "renew") {
    const updated = await prisma.demand.update({
      where: { id: demandId },
      data: {
        status: "ACTIVE",
        expiresAt: computeDemandExpiry(),
        renewedAt: new Date(),
      },
    });

    await logAppEvent({
      eventType: "demand_renewed",
      entityType: "Demand",
      entityId: demandId,
      dealerId,
    });

    await runMatchingForDemand(demandId);
    return v1Json(ctx, updated);
  }

  return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
}

import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import type { ParsedDemand } from "@/lib/schemas/ai";
import type { Prisma } from "@prisma/client";
import {
  computeDemandExpiry,
  runMatchingForDemand,
} from "@/services/domain/matching-flow";
import { recordActivationMilestone } from "@/services/activation/milestones";
import { upsertCustomerForDealer } from "@/services/customers";
import { extractCustomerHintsFromText } from "@/services/capture/customer-extract";

export const dynamic = "force-dynamic";

function toJson(value: object): Prisma.InputJsonValue {
  return toPrismaJson(value);
}

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsedBody = await parseV1Json(req, ctx);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body as {
    demandId?: unknown;
    confirmed?: unknown;
    publishMode?: unknown;
    customer?: { name?: string | null; phone?: string | null };
  };

  const demandId = typeof body.demandId === "string" ? body.demandId : "";
  if (!demandId || body.confirmed == null || typeof body.confirmed !== "object") {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const publishMode =
    body.publishMode === "private" ? ("private" as const) : ("network" as const);
  const customerOverride = body.customer;

  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId: principal.dealerId },
  });
  if (!demand) {
    return v1Error(ctx, "RESOURCE_NOT_FOUND");
  }

  const confirmedJson = body.confirmed as Record<string, unknown>;
  const hints = extractCustomerHintsFromText(demand.rawText);
  const customerName =
    customerOverride?.name?.trim() || hints.name || null;
  const customerPhone =
    customerOverride?.phone?.trim() ||
    hints.phone ||
    hints.normalizedPhone ||
    null;

  let customerId = demand.customerId;
  if (customerName || customerPhone) {
    const upserted = await upsertCustomerForDealer({
      dealerId: principal.dealerId,
      name: customerName,
      phone: customerPhone,
      source: { via: "understanding_result", demandId },
    });
    customerId = upserted.customer.id;
  }

  await prisma.demandConstraint.deleteMany({ where: { demandId } });

  const parsed = demand.parsedJson as ParsedDemand | null;

  if (parsed?.exclusions) {
    for (const ex of parsed.exclusions) {
      await prisma.demandConstraint.create({
        data: {
          demandId,
          field: ex.field,
          constraintType: "EXCLUSION",
          value: toJson(ex),
          source: "user_confirmed",
        },
      });
    }
  }

  if (parsed?.hardConstraints) {
    for (const hc of parsed.hardConstraints) {
      await prisma.demandConstraint.create({
        data: {
          demandId,
          field: hc.field,
          constraintType: "HARD",
          value: toJson(hc),
          source: "user_confirmed",
        },
      });
    }
  }

  if (parsed?.softPreferences) {
    for (const sp of parsed.softPreferences) {
      await prisma.demandConstraint.create({
        data: {
          demandId,
          field: sp.field,
          constraintType: "SOFT",
          value: toJson(sp),
          source: "user_confirmed",
        },
      });
    }
  }

  const networkVisibility =
    publishMode === "network" ? "ANONYMOUS_NETWORK" : "PRIVATE";

  const updated = await prisma.demand.update({
    where: { id: demandId },
    data: {
      confirmedJson: toJson(confirmedJson),
      confirmedAt: new Date(),
      status: "ACTIVE",
      expiresAt: computeDemandExpiry(),
      networkVisibility,
      customerId,
    },
  });

  void recordActivationMilestone({
    dealerId: principal.dealerId,
    milestone: "FIRST_DEMAND_ACTIVATED",
    userId: principal.userId,
    entityType: "Demand",
    entityId: demandId,
  }).catch(() => undefined);

  if (publishMode === "network") {
    void runMatchingForDemand(demandId).catch((err) => {
      console.error("[v1/demands/confirm] matching failed", demandId, err);
    });
  }

  return v1Json(ctx, {
    ...updated,
    immediateMatchCount: 0,
    hasImmediateMatch: false,
    matchingStarted: publishMode === "network",
    publishMode,
    customerId,
  });
}

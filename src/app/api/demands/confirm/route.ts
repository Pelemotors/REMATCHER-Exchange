import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeDemandExpiry,
  runMatchingForDemand,
} from "@/services/domain/matching-flow";
import type { ParsedDemand } from "@/lib/schemas/ai";
import type { Prisma } from "@prisma/client";
import { toPrismaJson } from "@/lib/prisma-json";
import { recordActivationMilestone } from "@/services/activation/milestones";
import { upsertCustomerForDealer } from "@/services/customers";
import { extractCustomerHintsFromText } from "@/services/capture/customer-extract";

function toJson(value: object): Prisma.InputJsonValue {
  return toPrismaJson(value);
}

/**
 * Confirm Understanding Result.
 * publishMode:
 *  - "network" → ACTIVE + ANONYMOUS_NETWORK + matching
 *  - "private" → ACTIVE + PRIVATE (no network matching)
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { demandId, confirmed } = body;
  const publishMode =
    body.publishMode === "private" ? ("private" as const) : ("network" as const);
  const customerOverride = body.customer as
    | { name?: string | null; phone?: string | null }
    | undefined;

  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId: session.user.dealerId },
  });
  if (!demand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const confirmedJson = confirmed as Record<string, unknown>;
  const hints = extractCustomerHintsFromText(demand.rawText);
  const customerName =
    customerOverride?.name?.trim() || hints.name || null;
  const customerPhone =
    customerOverride?.phone?.trim() || hints.phone || null;

  let customerId = demand.customerId;
  if (customerName || customerPhone) {
    const upserted = await upsertCustomerForDealer({
      dealerId: session.user.dealerId,
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
    dealerId: session.user.dealerId,
    milestone: "FIRST_DEMAND_ACTIVATED",
    userId: session.user.id,
    entityType: "Demand",
    entityId: demandId,
  }).catch(() => undefined);

  if (publishMode === "network") {
    await runMatchingForDemand(demandId).catch((err) => {
      console.error("[demands/confirm] matching failed", demandId, err);
    });
  }

  return NextResponse.json({
    ...updated,
    immediateMatchCount: 0,
    hasImmediateMatch: false,
    matchingStarted: publishMode === "network",
    publishMode,
    customerId,
  });
}

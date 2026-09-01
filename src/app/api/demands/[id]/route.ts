import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { runMatchingForDemand } from "@/services/domain/matching-flow";
import { logAppEvent } from "@/services/notifications";
import { getEnrichedDemandsForDealer } from "@/services/demand/demand-queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id } = await params;
  const all = await getEnrichedDemandsForDealer(
    authResult.session.user.dealerId!,
    { includeHistory: true }
  );
  const demand = all.find((d) => d.id === id);
  if (!demand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(demand);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id } = await params;
  const dealerId = authResult.session.user.dealerId!;
  const body = await req.json();
  const { confirmed } = body;

  const demand = await prisma.demand.findFirst({
    where: { id, dealerId },
  });
  if (!demand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!["ACTIVE", "EXPIRED", "PENDING_CONFIRMATION"].includes(demand.status)) {
    return NextResponse.json({ error: "Cannot edit" }, { status: 400 });
  }

  const updated = await prisma.demand.update({
    where: { id },
    data: {
      confirmedJson: toPrismaJson(confirmed),
      updatedAt: new Date(),
      status: demand.status === "EXPIRED" ? "ACTIVE" : demand.status,
    },
  });

  await prisma.demandConstraint.deleteMany({ where: { demandId: id } });

  await logAppEvent({
    eventType: "demand_updated",
    entityType: "Demand",
    entityId: id,
    dealerId,
    metadata: { fields: Object.keys(confirmed ?? {}) },
  });

  if (updated.status === "ACTIVE" || updated.status === "PENDING_CONFIRMATION") {
    await runMatchingForDemand(id);
  }

  return NextResponse.json(updated);
}

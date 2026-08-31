import { NextResponse } from "next/server";
import { requireDealerSession } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import {
  computeDemandExpiry,
  runMatchingForDemand,
} from "@/services/domain/matching-flow";
import { logAppEvent, notifyDealerUsers } from "@/services/notifications";

export async function GET() {
  const authResult = await requireDealerSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const demands = await prisma.demand.findMany({
    where: {
      dealerId: authResult.session.user.dealerId!,
      status: { in: ["ACTIVE", "EXPIRED"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(demands);
}

export async function POST(req: Request) {
  const authResult = await requireDealerSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { demandId, action } = await req.json();
  const dealerId = authResult.session.user.dealerId!;

  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId },
  });
  if (!demand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    return NextResponse.json(updated);
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

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/** Expire demands past their deadline — call from matching or cron */
export async function PATCH() {
  const authResult = await requireDealerSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const dealerId = authResult.session.user.dealerId!;
  const now = new Date();

  const expiring = await prisma.demand.findMany({
    where: {
      dealerId,
      status: "ACTIVE",
      expiresAt: { lte: now },
    },
  });

  for (const d of expiring) {
    await prisma.demand.update({
      where: { id: d.id },
      data: { status: "EXPIRED" },
    });
    await logAppEvent({
      eventType: "demand_expired",
      entityType: "Demand",
      entityId: d.id,
      dealerId,
    });
    await notifyDealerUsers(dealerId, {
      type: "DEMAND_EXPIRY",
      title: "עדיין מחפש את הרכב הזה?",
      body: "החיפוש שלך הסתיים — אפשר להמשיך לחפש או לסגור",
      link: "/demand",
      entityType: "demand",
      entityId: d.id,
      sendPush: true,
    });
  }

  return NextResponse.json({ expired: expiring.length });
}

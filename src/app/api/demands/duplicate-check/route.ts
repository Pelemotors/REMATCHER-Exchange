import { NextResponse } from "next/server";
import { requireDealerSession } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { findDuplicateDemand, confirmedFromParsed } from "@/services/demand/duplicate-detection";
import { logAppEvent } from "@/services/notifications";

export async function POST(req: Request) {
  const authResult = await requireDealerSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { parsed } = await req.json();
  const dealerId = authResult.session.user.dealerId!;
  const incoming = confirmedFromParsed(parsed);

  const existing = await prisma.demand.findMany({
    where: {
      dealerId,
      status: { in: ["ACTIVE", "PENDING_CONFIRMATION", "DRAFT"] },
    },
    select: { id: true, status: true, confirmedJson: true },
  });

  const result = findDuplicateDemand(incoming, existing);

  if (result.level !== "DIFFERENT") {
    await logAppEvent({
      eventType: "duplicate_demand_detected",
      dealerId,
      metadata: {
        level: result.level,
        existingDemandId: result.existingDemandId,
      },
    });
  }

  return NextResponse.json(result);
}

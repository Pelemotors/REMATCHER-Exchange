import { NextResponse } from "next/server";
import { requireDealerSession } from "@/lib/auth-guards";
import { getEnrichedDemandsForDealer } from "@/services/demand/demand-queries";

export async function GET(req: Request) {
  const authResult = await requireDealerSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { searchParams } = new URL(req.url);
  const includeHistory = searchParams.get("history") === "true";

  const demands = await getEnrichedDemandsForDealer(
    authResult.session.user.dealerId!,
    { includeHistory }
  );

  const active = demands.filter((d) =>
    ["ACTIVE", "EXPIRING", "PENDING_CONFIRMATION"].includes(d.uxStatus)
  );
  const ended = demands.filter((d) =>
    ["EXPIRED", "CLOSED"].includes(d.uxStatus)
  );

  return NextResponse.json({ active, ended, all: demands });
}

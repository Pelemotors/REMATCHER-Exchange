import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { matchPrivateVehicleToMyDemands } from "@/services/matching/private-matching";
import { getNetworkIntelligenceSnapshot } from "@/services/network-intelligence";

export async function POST(req: Request) {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const dealerId = auth.session.user.dealerId!;
  const body = await req.json();

  if (body.action === "private_match") {
    const result = await matchPrivateVehicleToMyDemands({
      dealerId,
      vehicleId: String(body.vehicleId),
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  }

  if (body.action === "network_intel") {
    const snap = await getNetworkIntelligenceSnapshot({
      dealerId,
      make: body.make ?? null,
      model: body.model ?? null,
      yearMin: body.yearMin ?? null,
      yearMax: body.yearMax ?? null,
    });
    return NextResponse.json(snap);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

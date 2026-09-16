import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { publishVehicleToCatalog } from "@/services/catalog/catalog-service";

export async function POST(req: Request) {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const dealerId = auth.session.user.dealerId!;
  const body = await req.json().catch(() => ({}));
  const vehicleId = String(body.vehicleId ?? "");
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId required" }, { status: 400 });
  }

  const result = await publishVehicleToCatalog({ dealerId, vehicleId });
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

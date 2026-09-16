import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { bulkPublishVehiclesToCatalog } from "@/services/catalog/catalog-service";

export async function POST(req: Request) {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const dealerId = auth.session.user.dealerId!;
  const body = await req.json().catch(() => ({}));
  const vehicleIds = Array.isArray(body.vehicleIds)
    ? body.vehicleIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];

  if (vehicleIds.length === 0) {
    return NextResponse.json(
      { error: "vehicleIds required" },
      { status: 400 }
    );
  }
  if (vehicleIds.length > 100) {
    return NextResponse.json(
      { error: "too_many_vehicles" },
      { status: 400 }
    );
  }

  const result = await bulkPublishVehiclesToCatalog({ dealerId, vehicleIds });
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import {
  convertToOwnedInventory,
  publishVehicleToNetwork,
  removeVehicleFromNetwork,
  setVehicleRelationship,
} from "@/services/vehicles/relationship-visibility";
import type { DealerVehicleRelationship } from "@prisma/client";

export async function POST(req: Request) {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const dealerId = auth.session.user.dealerId!;
  const body = await req.json();
  const vehicleId = String(body.vehicleId ?? "");
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId required" }, { status: 400 });
  }

  if (body.action === "publish") {
    const result = await publishVehicleToNetwork({ dealerId, vehicleId });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }
  if (body.action === "unpublish") {
    const result = await removeVehicleFromNetwork({ dealerId, vehicleId });
    if (!result.ok) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  }
  if (body.action === "convert_owned") {
    const result = await convertToOwnedInventory({ dealerId, vehicleId });
    if (!result.ok) {
      return NextResponse.json(result, {
        status: result.error === "not_found" ? 404 : 409,
      });
    }
    return NextResponse.json(result);
  }
  if (body.action === "set_relationship") {
    const relationship = body.relationship as DealerVehicleRelationship;
    const result = await setVehicleRelationship({
      dealerId,
      vehicleId,
      relationship,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

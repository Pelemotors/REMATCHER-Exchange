import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { setCatalogPublicationFinance } from "@/services/catalog/catalog-service";

export async function POST(req: Request) {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const dealerId = auth.session.user.dealerId!;
  const body = await req.json().catch(() => ({}));
  const vehicleId = String(body.vehicleId ?? "");
  const showMonthlyFinance = Boolean(body.showMonthlyFinance);
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId required" }, { status: 400 });
  }
  const result = await setCatalogPublicationFinance({
    dealerId,
    vehicleId,
    showMonthlyFinance,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import {
  archiveCustomer,
  getCustomerForDealer,
  listCustomersForDealer,
  upsertCustomerForDealer,
  attachDemandToCustomer,
} from "@/services/customers";

export async function GET(req: Request) {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const dealerId = auth.session.user.dealerId!;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const row = await getCustomerForDealer(dealerId, id);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  }
  const q = url.searchParams.get("q") ?? undefined;
  const rows = await listCustomersForDealer(dealerId, { q });
  return NextResponse.json({ customers: rows });
}

export async function POST(req: Request) {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const dealerId = auth.session.user.dealerId!;
  const body = await req.json();
  if (body.action === "attach_demand") {
    const result = await attachDemandToCustomer({
      dealerId,
      demandId: String(body.demandId),
      customerId: String(body.customerId),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json(result);
  }
  if (body.action === "archive") {
    const row = await archiveCustomer(dealerId, String(body.customerId));
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  }
  const result = await upsertCustomerForDealer({
    dealerId,
    name: body.name ?? null,
    phone: body.phone ?? null,
    notes: body.notes ?? null,
    source: body.source ?? { via: "api" },
  });
  return NextResponse.json(result);
}

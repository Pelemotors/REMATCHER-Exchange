import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import {
  dismissDealerOpportunity,
  listOpenDealerOpportunities,
} from "@/services/opportunities/dealer-opportunity";

export async function GET() {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const rows = await listOpenDealerOpportunities(auth.session.user.dealerId!);
  return NextResponse.json({ opportunities: rows });
}

export async function POST(req: Request) {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await req.json();
  if (body.action === "dismiss") {
    const row = await dismissDealerOpportunity(
      auth.session.user.dealerId!,
      String(body.id)
    );
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

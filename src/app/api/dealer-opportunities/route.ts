import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import {
  dismissDealerOpportunity,
  listOpenDealerOpportunities,
  refreshDealerOpportunitySources,
} from "@/services/opportunities/dealer-opportunity";

export async function GET() {
  const auth = await requireVerifiedDealer();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const dealerId = auth.session.user.dealerId!;
  // Refresh sources opportunistically (deduped upserts)
  await refreshDealerOpportunitySources(dealerId).catch(() => undefined);
  const rows = await listOpenDealerOpportunities(dealerId);
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
  if (body.action === "refresh") {
    const result = await refreshDealerOpportunitySources(
      auth.session.user.dealerId!
    );
    const rows = await listOpenDealerOpportunities(auth.session.user.dealerId!);
    return NextResponse.json({ ...result, opportunities: rows });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

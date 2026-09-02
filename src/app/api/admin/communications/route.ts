import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import {
  getCampaignDetail,
  getCampaignHistory,
  getPushSubscriberStats,
} from "@/services/admin/communications";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const campaignId = new URL(req.url).searchParams.get("id");
  if (campaignId) {
    const detail = await getCampaignDetail(campaignId);
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  }

  const [history, stats] = await Promise.all([
    getCampaignHistory(30),
    getPushSubscriberStats(),
  ]);

  return NextResponse.json({ history, stats });
}

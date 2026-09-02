import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import {
  getCommunicationAnalytics,
  getDealerResponseAnalytics,
  getEngagementMetrics,
  getLifecycleMetrics,
} from "@/services/analytics/product-intelligence";
import { ACTIVE_DEALER_DEFINITION, countActiveDealers } from "@/services/analytics/active-dealer";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const days = Number(new URL(req.url).searchParams.get("days") ?? "7");
  const safeDays = [1, 7, 30].includes(days) ? days : 7;

  const [lifecycle, engagement, dealerResponse, communications, activeDealers] =
    await Promise.all([
      getLifecycleMetrics(safeDays),
      getEngagementMetrics(),
      getDealerResponseAnalytics(),
      getCommunicationAnalytics(true),
      countActiveDealers(30),
    ]);

  return NextResponse.json({
    lifecycle,
    engagement: { ...engagement, activeDealers30d: activeDealers },
    dealerResponse,
    communications,
    activeDealerDefinition: ACTIVE_DEALER_DEFINITION,
    periodDays: safeDays,
  });
}

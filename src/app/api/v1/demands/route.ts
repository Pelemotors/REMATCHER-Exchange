import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Json } from "@/lib/api-v1/respond";
import { getEnrichedDemandsForDealer } from "@/services/demand/demand-queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const url = new URL(req.url);
  const includeHistory = url.searchParams.get("history") === "true";
  const lightweight = url.searchParams.get("lightweight") === "true";

  const demands = await getEnrichedDemandsForDealer(principal.dealerId, {
    includeHistory,
    lightweight,
  });

  const active = demands.filter((d) =>
    ["ACTIVE", "EXPIRING", "PENDING_CONFIRMATION", "PAUSED"].includes(d.uxStatus)
  );
  const ended = demands.filter((d) =>
    ["EXPIRED", "CLOSED"].includes(d.uxStatus)
  );

  return v1Json(ctx, { active, ended, all: demands });
}

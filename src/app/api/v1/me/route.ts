import { requireV1Dealer } from "@/lib/api-v1/auth";
import { mePayload } from "@/lib/api-v1/me-payload";
import { v1Json } from "@/lib/api-v1/respond";
import { hasCompletedPrivacyAiV1 } from "@/services/privacy/policy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1Dealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const privacyAiComplete = await hasCompletedPrivacyAiV1({
    userId: principal.userId,
    dealerId: principal.dealerId,
  });
  return v1Json(ctx, mePayload(principal, { privacyAiComplete }));
}

import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Json } from "@/lib/api-v1/respond";
import { getAssistantContext } from "@/services/assistant/v2-orchestrator";

export const dynamic = "force-dynamic";

/** Thin wrap of Web GET /api/assistant/context */
export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const context = await getAssistantContext(principal.dealerId);
  return v1Json(ctx, context);
}

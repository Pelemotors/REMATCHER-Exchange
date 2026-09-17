import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { applyIntakeIntents } from "@/services/intake/apply-intent";
import { checkIntakeRateLimit } from "@/services/intake/rate-limit";

export const dynamic = "force-dynamic";

/** Thin wrap of Web POST /api/intake/intent */
export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const limited = checkIntakeRateLimit({
    dealerId: principal.dealerId,
    kind: "resolve",
  });
  if (limited.blocked) {
    return v1Error(ctx, "RATE_LIMIT_EXCEEDED");
  }

  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as {
    batchId?: string;
    candidateId?: string;
    intent?: string;
    message?: string;
  };
  if (!body.batchId) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const result = await applyIntakeIntents({
    dealerId: principal.dealerId,
    batchId: body.batchId,
    candidateId: body.candidateId,
    intent: body.intent,
    message: body.message,
  });
  if (!result.ok) {
    return v1Error(
      ctx,
      result.error === "not_found"
        ? "RESOURCE_NOT_FOUND"
        : "VALIDATION_INVALID_REQUEST"
    );
  }
  return v1Json(ctx, result);
}

import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import { applyIntakeIntents } from "@/services/intake/apply-intent";
import { checkIntakeRateLimit } from "@/services/intake/rate-limit";

export async function POST(req: Request) {
  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }
  const dealerId = authResult.session.user.dealerId!;
  const limited = checkIntakeRateLimit({ dealerId, kind: "resolve" });
  if (limited.blocked) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    batchId?: string;
    candidateId?: string;
    intent?: string;
    message?: string;
  };
  if (!body.batchId) {
    return NextResponse.json({ error: "batchId required" }, { status: 400 });
  }

  const result = await applyIntakeIntents({
    dealerId,
    batchId: body.batchId,
    candidateId: body.candidateId,
    intent: body.intent,
    message: body.message,
  });
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

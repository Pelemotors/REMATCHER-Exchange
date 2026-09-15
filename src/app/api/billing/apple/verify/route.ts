import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDealerSession } from "@/lib/auth-guards";
import { verifyApplePurchase } from "@/services/billing/apple-subscription-provider";
import { applyNormalizedSubscription } from "@/services/billing/reconcile";
import { logAppEvent } from "@/services/events/log-event";

const schema = z.object({
  proof: z.string().min(2),
  productId: z.string().optional(),
});

export async function POST(req: Request) {
  const authz = await requireDealerSession();
  if ("error" in authz) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const normalized = await verifyApplePurchase({
      proof: parsed.data.proof,
      productId: parsed.data.productId,
    });
    const result = await applyNormalizedSubscription({
      dealerId: authz.session.user.dealerId!,
      purchaserUserId: authz.session.user.id,
      normalized,
    });
    await logAppEvent({
      eventType: "PURCHASE_VERIFIED",
      dealerId: authz.session.user.dealerId!,
      userId: authz.session.user.id,
      metadata: { provider: "APPLE" },
    });
    return NextResponse.json({
      ok: true,
      entitlement: result.entitlement,
      subscriptionId: result.subscription.id,
      duplicate: !result.transaction.created,
    });
  } catch (err) {
    await logAppEvent({
      eventType: "PURCHASE_FAILED",
      dealerId: authz.session.user.dealerId!,
      userId: authz.session.user.id,
      metadata: {
        provider: "APPLE",
        error: err instanceof Error ? err.message : "unknown",
      },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verify failed" },
      { status: 400 }
    );
  }
}

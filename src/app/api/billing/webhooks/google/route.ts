import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyGoogleWebhookPayload } from "@/services/billing/google-play-subscription-provider";
import { applyNormalizedSubscription } from "@/services/billing/reconcile";

export async function POST(req: Request) {
  const body = await req.text();
  const signature =
    req.headers.get("x-goog-signature") ??
    req.headers.get("authorization");

  try {
    const normalized = await verifyGoogleWebhookPayload(body, signature);
    const dealerId =
      (normalized.raw.dealerId as string | undefined) ??
      (
        await prisma.dealerSubscription.findUnique({
          where: {
            provider_externalSubscriptionId: {
              provider: "GOOGLE",
              externalSubscriptionId: normalized.externalSubscriptionId,
            },
          },
        })
      )?.dealerId;

    if (!dealerId) {
      return NextResponse.json(
        { error: "Unknown subscription; dealerId required in fake payload" },
        { status: 404 }
      );
    }

    const result = await applyNormalizedSubscription({
      dealerId,
      normalized,
    });

    return NextResponse.json({
      ok: true,
      duplicate: !result.transaction.created,
      entitlementStatus: result.entitlement.status,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook failed" },
      { status: 400 }
    );
  }
}

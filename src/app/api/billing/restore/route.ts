import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDealerSession } from "@/lib/auth-guards";
import { verifyApplePurchase } from "@/services/billing/apple-subscription-provider";
import { verifyGooglePlayPurchase } from "@/services/billing/google-play-subscription-provider";
import { restorePurchases } from "@/services/billing/reconcile";

const schema = z.object({
  appleProofs: z.array(z.string()).optional(),
  googleProofs: z.array(z.string()).optional(),
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

  const normalizedList = [];
  for (const proof of parsed.data.appleProofs ?? []) {
    normalizedList.push(await verifyApplePurchase({ proof }));
  }
  for (const proof of parsed.data.googleProofs ?? []) {
    normalizedList.push(await verifyGooglePlayPurchase({ proof }));
  }

  const result = await restorePurchases({
    dealerId: authz.session.user.dealerId!,
    purchaserUserId: authz.session.user.id,
    normalizedList,
  });

  return NextResponse.json({
    ok: true,
    entitlement: result.entitlement,
    restored: result.results.length,
  });
}

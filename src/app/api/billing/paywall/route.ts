import { NextResponse } from "next/server";
import { requireDealerSession } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import {
  compactEntitlementView,
  getDealerEntitlement,
  recalculateEntitlement,
} from "@/services/entitlements";
import { isMonetizationEnabled } from "@/services/product-policy";
import { logAppEvent } from "@/services/events/log-event";

export async function GET() {
  const authz = await requireDealerSession();
  if ("error" in authz) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const dealerId = authz.session.user.dealerId!;
  const monetizationEnabled = await isMonetizationEnabled();

  const [plans, entitlement] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { active: true },
      include: {
        providerProducts: { where: { active: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    monetizationEnabled
      ? recalculateEntitlement(dealerId)
      : getDealerEntitlement(dealerId),
  ]);

  await logAppEvent({
    eventType: "PAYWALL_VIEWED",
    entityType: "Dealer",
    entityId: dealerId,
    dealerId,
    userId: authz.session.user.id,
  });

  return NextResponse.json({
    monetizationEnabled,
    entitlement: compactEntitlementView(entitlement),
    catalog: plans.map((plan) => ({
      slug: plan.slug,
      nameHe: plan.nameHe,
      description: plan.description,
      /** Store provides localized price — server placeholder is always null */
      localizedPrice: null,
      products: plan.providerProducts.map((p) => ({
        provider: p.provider,
        externalProductId: p.externalProductId,
        environment: p.environment,
        localizedPrice: null,
      })),
    })),
  });
}

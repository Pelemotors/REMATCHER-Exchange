import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { getDealer360 } from "@/services/admin/control-center";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const { id } = await params;
  const data = await getDealer360(id);
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { dealer, metrics, recentEvents } = data;
  const owner = dealer.memberships[0]?.user;

  return NextResponse.json({
    id: dealer.id,
    businessName: dealer.businessName,
    contactName: dealer.contactName,
    phone: dealer.phone,
    email: dealer.email,
    city: dealer.city,
    region: dealer.region,
    businessId: dealer.businessId,
    verificationStatus: dealer.verificationStatus,
    createdAt: dealer.createdAt,
    commercial: dealer.commercial,
    onboardingState: dealer.onboardingState,
    metrics,
    recentEvents: recentEvents.map((e) => ({
      eventType: e.eventType,
      entityType: e.entityType,
      entityId: e.entityId,
      createdAt: e.createdAt,
    })),
    owner: owner
      ? {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
          emailVerifiedAt: owner.emailVerifiedAt,
        }
      : null,
  });
}

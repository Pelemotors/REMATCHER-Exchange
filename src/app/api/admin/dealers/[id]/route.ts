import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { getDealerForReview } from "@/services/admin/dealer-verification";

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
  const dealer = await getDealerForReview(id);
  if (!dealer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

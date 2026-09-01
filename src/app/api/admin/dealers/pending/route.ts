import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { getPendingDealers } from "@/services/admin/dealer-verification";

export async function GET() {
  const authResult = await requireAdminSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const dealers = await getPendingDealers();
  return NextResponse.json({
    count: dealers.length,
    dealers: dealers.map((d) => ({
      id: d.id,
      businessName: d.businessName,
      contactName: d.contactName,
      city: d.city,
      region: d.region,
      createdAt: d.createdAt,
      owner: d.memberships[0]?.user
        ? {
            email: d.memberships[0].user.email,
            emailVerified: Boolean(d.memberships[0].user.emailVerifiedAt),
          }
        : null,
    })),
  });
}

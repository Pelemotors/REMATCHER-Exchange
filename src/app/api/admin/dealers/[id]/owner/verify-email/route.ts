import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { verifyDealerOwnerEmail } from "@/services/admin/dealer-management";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdminSession();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { id } = await params;
  const result = await verifyDealerOwnerEmail({
    dealerId: id,
    adminUserId: authResult.session.user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { approveDealer } from "@/services/admin/dealer-verification";

export async function POST(
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
  const result = await approveDealer(id, authResult.session.user.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, already: result.already ?? false });
}

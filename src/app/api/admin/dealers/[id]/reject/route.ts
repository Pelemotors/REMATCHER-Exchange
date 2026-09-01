import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { rejectDealer } from "@/services/admin/dealer-verification";

export async function POST(
  req: Request,
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
  const body = await req.json().catch(() => ({}));
  const result = await rejectDealer(
    id,
    authResult.session.user.id,
    body.reason as string | undefined
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, already: result.already ?? false });
}

import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { createDealerByAdmin } from "@/services/admin/dealer-management";

export async function POST(req: Request) {
  const authResult = await requireAdminSession();
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const body = await req.json().catch(() => ({}));
  const result = await createDealerByAdmin({
    businessName: String(body.businessName ?? ""),
    contactName: String(body.contactName ?? ""),
    phone: String(body.phone ?? ""),
    email: String(body.email ?? ""),
    password: String(body.password ?? ""),
    city: body.city ? String(body.city) : null,
    activateNow: Boolean(body.activateNow),
    adminUserId: authResult.session.user.id,
  });

  if (!result.ok) {
    const status = result.error === "email_exists" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result, { status: 201 });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import {
  addDealerMember,
  listDealerMembers,
} from "@/services/identity/dealer-membership";

export async function GET() {
  const authz = await requireVerifiedDealer({ requireEntitlement: false });
  if ("error" in authz) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }
  const members = await listDealerMembers(authz.session.user.dealerId!);
  return NextResponse.json({
    members: members.map((m) => ({
      userId: m.userId,
      role: m.role,
      email: m.user.email,
      name: m.user.name,
    })),
  });
}

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export async function POST(req: Request) {
  const authz = await requireVerifiedDealer({ requireEntitlement: false });
  if ("error" in authz) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const result = await addDealerMember({
    dealerId: authz.session.user.dealerId!,
    actorUserId: authz.session.user.id,
    email: parsed.data.email,
    role: parsed.data.role,
  });
  if (!result.ok) {
    const status = result.error === "forbidden" || result.error === "owner_only" ? 403 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, already: result.already, role: result.membership.role });
}

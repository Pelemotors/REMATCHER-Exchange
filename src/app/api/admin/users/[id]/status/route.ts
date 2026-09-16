import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/services/notifications";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    status?: "ACTIVE" | "SUSPENDED";
  } | null;
  if (body?.status !== "ACTIVE" && body?.status !== "SUSPENDED") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (target.role === "ADMIN") {
    return NextResponse.json(
      { error: "Cannot change System Admin status here" },
      { status: 403 }
    );
  }
  await prisma.user.update({
    where: { id },
    data: { accountStatus: body.status },
  });
  await logAppEvent({
    eventType: "admin_user_status",
    entityType: "User",
    entityId: id,
    userId: auth.session.user.id,
    metadata: { status: body.status },
  });
  return NextResponse.json({ ok: true, status: body.status });
}

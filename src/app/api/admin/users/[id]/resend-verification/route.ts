import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { createEmailVerificationToken } from "@/services/auth/verification-tokens";
import { sendUserVerificationEmail } from "@/services/email";
import { logAppEvent } from "@/services/notifications";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, emailVerifiedAt: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (user.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }
  const token = await createEmailVerificationToken(user.id);
  const sent = await sendUserVerificationEmail({
    to: user.email,
    name: user.name,
    token,
  });
  await logAppEvent({
    eventType: "admin_resend_verification",
    entityType: "User",
    entityId: user.id,
    userId: auth.session.user.id,
    metadata: { ok: sent.ok },
  });
  return NextResponse.json({ ok: sent.ok, error: sent.error ?? null });
}

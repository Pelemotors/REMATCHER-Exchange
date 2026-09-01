import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import { checkForgotPassword } from "@/lib/rate-limit";
import { createPasswordResetToken } from "@/services/auth/verification-tokens";
import { sendPasswordResetEmail } from "@/services/email";

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email?.trim()) {
    return NextResponse.json({ ok: true });
  }

  const normalized = email.trim().toLowerCase();
  const ip = getClientIp(req);
  const limit = checkForgotPassword(normalized, ip);
  if (limit.blocked) {
    return NextResponse.json(
      {
        error: "rate_limit",
        message: "בוצעו יותר מדי בקשות. נסה שוב מאוחר יותר.",
      },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email: normalized } });

  if (user) {
    const token = await createPasswordResetToken(user.id);
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      token,
    });
  }

  return NextResponse.json({
    ok: true,
    message:
      "אם כתובת האימייל רשומה במערכת, נשלח אליך קישור לאיפוס סיסמה.",
  });
}

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  consumePasswordResetToken,
  markPasswordResetTokenUsed,
} from "@/services/auth/verification-tokens";

const schema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, "סיסמה חייבת להכיל לפחות 8 תווים"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "הסיסמאות אינן תואמות",
    path: ["confirmPassword"],
  });

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "נתונים לא תקינים" },
      { status: 400 }
    );
  }

  const result = await consumePasswordResetToken(parsed.data.token);
  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.reason === "expired"
            ? "הקישור פג תוקף. בקש קישור חדש."
            : "קישור לא תקין או שכבר נוצל.",
      },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: result.userId },
      data: { passwordHash },
    }),
    prisma.session.deleteMany({ where: { userId: result.userId } }),
  ]);

  await markPasswordResetTokenUsed(result.tokenId);

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createEmailVerificationToken } from "@/services/auth/verification-tokens";
import { sendUserVerificationEmail } from "@/services/email";
import { logAppEvent } from "@/services/notifications";
import { ensureDealerCommercial } from "@/services/commercial/reveal-usage";

const signupSchema = z
  .object({
    name: z.string().min(2, "שם מלא נדרש"),
    businessName: z.string().min(2, "שם העסק נדרש"),
    phone: z.string().min(9, "טלפון נדרש"),
    email: z.string().email("אימייל לא תקין"),
    city: z.string().min(1, "עיר נדרשת"),
    region: z.string().optional(),
    businessId: z.string().optional(),
    password: z.string().min(8, "סיסמה חייבת להכיל לפחות 8 תווים"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "הסיסמאות אינן תואמות",
    path: ["confirmPassword"],
  });

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "נתונים לא תקינים" },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const email = data.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "כתובת אימייל זו כבר רשומה במערכת" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: data.name.trim(),
      phone: data.phone.trim(),
      role: "DEALER_USER",
      memberships: {
        create: {
          role: "OWNER",
          dealer: {
            create: {
              businessName: data.businessName.trim(),
              contactName: data.name.trim(),
              phone: data.phone.trim(),
              email,
              city: data.city.trim(),
              region: data.region?.trim() || null,
              businessId: data.businessId?.trim() || null,
              verificationStatus: "PENDING",
            },
          },
        },
      },
    },
    include: {
      memberships: { include: { dealer: true }, take: 1 },
    },
  });

  const dealer = user.memberships[0]!.dealer;
  await ensureDealerCommercial(dealer.id);

  const token = await createEmailVerificationToken(user.id);
  await sendUserVerificationEmail({ to: email, name: user.name, token });

  await logAppEvent({
    eventType: "dealer_signup",
    entityType: "Dealer",
    entityId: dealer.id,
    dealerId: dealer.id,
    metadata: { email, businessName: dealer.businessName },
  });

  return NextResponse.json({
    ok: true,
    message: "נרשמת בהצלחה. בדוק את תיבת האימייל לאימות.",
  });
}

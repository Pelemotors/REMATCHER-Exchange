import { NextResponse } from "next/server";
import { consumeEmailVerificationToken } from "@/services/auth/verification-tokens";
import {
  sendAdminDealerPendingEmail,
} from "@/services/email";
import { logAppEvent } from "@/services/notifications";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const result = await consumeEmailVerificationToken(token);

  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.reason === "expired"
            ? "הקישור פג תוקף. בקש קישור חדש."
            : "קישור לא תקין או שכבר נוצל.",
        reason: result.reason,
      },
      { status: 400 }
    );
  }

  const dealer = result.dealer;
  if (dealer && dealer.verificationStatus === "PENDING") {
    await sendAdminDealerPendingEmail({
      businessName: dealer.businessName,
      contactName: dealer.contactName,
      phone: dealer.phone,
      email: result.user.email,
      city: dealer.city,
      region: dealer.region,
      businessId: dealer.businessId,
      dealerId: dealer.id,
      signedUpAt: dealer.createdAt,
    });

    await logAppEvent({
      eventType: "email_verified",
      entityType: "User",
      entityId: result.user.id,
      dealerId: dealer.id,
    });

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    const { createNotification } = await import("@/services/notifications");
    for (const admin of admins) {
      await createNotification({
        userId: admin.id,
        type: "DEALER_VERIFICATION",
        title: "סוחר חדש ממתין לאישור",
        body: `${dealer.businessName} — ${dealer.contactName}`,
        link: `/admin/dealers/${dealer.id}`,
        sendPush: false,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    message: "האימייל אומת בהצלחה. הבקשה שלך בבדיקה.",
  });
}

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user || user.emailVerifiedAt) {
    return NextResponse.json({ ok: true });
  }

  const { createEmailVerificationToken } = await import(
    "@/services/auth/verification-tokens"
  );
  const { sendUserVerificationEmail } = await import("@/services/email");
  const token = await createEmailVerificationToken(user.id);
  await sendUserVerificationEmail({ to: user.email, name: user.name, token });

  return NextResponse.json({ ok: true });
}

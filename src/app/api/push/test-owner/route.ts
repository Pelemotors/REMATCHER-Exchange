import { NextResponse } from "next/server";
import { requireVerifiedDealer } from "@/lib/auth-guards";
import {
  deliverPushToUser,
  isPushConfigured,
} from "@/services/notifications/push";
import { prisma } from "@/lib/prisma";

/**
 * Field-Test only: Owner self-test push to *their own* subscriptions.
 * Not a public endpoint — requires verified dealer session.
 * Never targets other dealers / Production hosts.
 */
export async function POST() {
  if (process.env.FIELD_TEST !== "true") {
    return NextResponse.json(
      { error: "field_test_only" },
      { status: 403 }
    );
  }

  const authResult = await requireVerifiedDealer();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const userId = authResult.session.user.id!;
  const dealerId = authResult.session.user.dealerId!;
  const email = authResult.session.user.email ?? "";

  // Restrict to Field-Test Owner Gmail or FT dealer emails — never broadcast.
  const allowed =
    email === "galsamama@gmail.com" ||
    email.endsWith("@rematcher.local") ||
    process.env.FIELD_TEST_PUSH_ALLOW_ANY_DEALER === "true";
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "push_not_configured", configured: false },
      { status: 503 }
    );
  }

  const subCount = await prisma.pushSubscription.count({
    where: { userId, invalidatedAt: null },
  });
  if (subCount === 0) {
    return NextResponse.json(
      {
        error: "no_subscription",
        message:
          "אין מנוי התראות פעיל לחשבון הזה. במכשיר: הפעל התראות ואשר Allow, ואז נסה שוב.",
        configured: true,
        subscriptions: 0,
      },
      { status: 400 }
    );
  }

  const result = await deliverPushToUser({
    userId,
    dealerId,
    title: "בדיקת התראות Field Test",
    body: "אם אתה רואה את זה — Web Push ל־REMATCHER Exchange עובד.",
    link: "/activity",
    source: "ADMIN_TEST",
    skipIfNoSubscription: false,
  });

  return NextResponse.json({
    ok: result.sent > 0,
    configured: true,
    subscriptions: subCount,
    sent: result.sent,
    failed: result.failed,
    deliveries: result.deliveries,
  });
}

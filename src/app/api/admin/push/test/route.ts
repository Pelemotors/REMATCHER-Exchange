import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { BRAND } from "@/config/brand";
import { sendPushToUser } from "@/services/notifications/push";

export async function POST() {
  const authResult = await requireAdminSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const result = await sendPushToUser(authResult.session.user.id, {
    title: BRAND.pushSender,
    body: "בדיקת ההתראות הושלמה בהצלחה",
    link: "/activity",
  });

  if (result.sent === 0 && result.failed === 0) {
    return NextResponse.json(
      {
        error: "No active push subscriptions",
        sent: 0,
        failed: 0,
      },
      { status: 400 }
    );
  }

  return NextResponse.json(result);
}

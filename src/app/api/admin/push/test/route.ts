import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { sendAdminCommunication } from "@/services/admin/communications";

export async function POST() {
  const authResult = await requireAdminSession();
  if ("error" in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const result = await sendAdminCommunication({
      createdByUserId: authResult.session.user.id,
      title: "בדיקת התראות",
      body: "בדיקת ההתראות הושלמה בהצלחה",
      destinationLink: "/activity",
      internalName: "admin_legacy_test",
      audienceType: "SINGLE",
      userIds: [authResult.session.user.id],
      source: "ADMIN_TEST",
      createInbox: false,
    });

    if (result.sent === 0 && result.failed === 0) {
      return NextResponse.json(
        {
          error:
            "No active push subscriptions for the logged-in account. Enable Push on this device/account, then retry.",
          sent: 0,
          failed: 0,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ sent: result.sent, failed: result.failed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 400 }
    );
  }
}

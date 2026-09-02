import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guards";
import { sendAdminCommunication } from "@/services/admin/communications";
import type { PushAudienceType } from "@prisma/client";

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const {
    title,
    body: messageBody,
    destinationLink,
    internalName,
    audienceType,
    userIds,
    confirmBroadcast,
    testOnly,
  } = body as {
    title: string;
    body: string;
    destinationLink?: string;
    internalName?: string;
    audienceType: PushAudienceType;
    userIds?: string[];
    confirmBroadcast?: boolean;
    testOnly?: boolean;
  };

  if (testOnly) {
    const result = await sendAdminCommunication({
      createdByUserId: auth.session.user.id,
      title: title || "בדיקת התראות",
      body: messageBody || "בדיקת מערכת Push",
      destinationLink: destinationLink || "/activity",
      internalName: internalName || "admin_test",
      audienceType: "SINGLE",
      userIds: [auth.session.user.id],
      source: "ADMIN_TEST",
      createInbox: false,
    });
    return NextResponse.json(result);
  }

  if (audienceType === "ALL" && !confirmBroadcast) {
    return NextResponse.json(
      { error: "Broadcast requires explicit confirmation" },
      { status: 400 }
    );
  }

  const source =
    audienceType === "SINGLE" ? "ADMIN_DIRECT" : "ADMIN_CAMPAIGN";

  try {
    const result = await sendAdminCommunication({
      createdByUserId: auth.session.user.id,
      title,
      body: messageBody,
      destinationLink,
      internalName,
      audienceType,
      userIds,
      source,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 400 }
    );
  }
}

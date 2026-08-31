import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { savePushSubscription } from "@/services/notifications/push";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await savePushSubscription(session.user.id, { endpoint, keys });

  return NextResponse.json({ ok: true });
}

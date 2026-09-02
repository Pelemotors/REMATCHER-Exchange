import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isDeviceSubscribed,
  isPushConfigured,
} from "@/services/notifications/push";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const endpoint = new URL(req.url).searchParams.get("endpoint");
  const serverSubscriptionCount = await prisma.pushSubscription.count({
    where: { userId: session.user.id },
  });

  let deviceSubscribed = false;
  if (endpoint) {
    deviceSubscribed = await isDeviceSubscribed(session.user.id, endpoint);
  }

  return NextResponse.json({
    /** @deprecated use deviceSubscribed */
    serverSubscribed: serverSubscriptionCount > 0,
    deviceSubscribed,
    serverSubscriptionCount,
    pushConfigured: isPushConfigured(),
  });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPushConfigured } from "@/services/notifications/push";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await prisma.pushSubscription.count({
    where: { userId: session.user.id },
  });

  return NextResponse.json({
    serverSubscribed: count > 0,
    pushConfigured: isPushConfigured(),
  });
}

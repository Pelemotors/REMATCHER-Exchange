import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json(
    prefs ?? {
      criticalProduct: true,
      reminders: true,
      adminCommunications: true,
    }
  );
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      criticalProduct: body.criticalProduct ?? true,
      reminders: body.reminders ?? true,
      adminCommunications: body.adminCommunications ?? true,
    },
    update: {
      ...(body.criticalProduct !== undefined
        ? { criticalProduct: body.criticalProduct }
        : {}),
      ...(body.reminders !== undefined ? { reminders: body.reminders } : {}),
      ...(body.adminCommunications !== undefined
        ? { adminCommunications: body.adminCommunications }
        : {}),
    },
  });

  return NextResponse.json(prefs);
}

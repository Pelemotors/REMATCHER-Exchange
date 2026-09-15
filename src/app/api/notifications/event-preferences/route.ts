import { NextResponse } from "next/server";
import { z } from "zod";
import type { NotificationEventType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EVENT_TYPES: NotificationEventType[] = [
  "NEW_MATCH",
  "MUTUAL_INTEREST",
  "INTAKE_NEEDS_INFO",
  "SEARCH_EXPIRING",
  "SUBSCRIPTION",
  "AGENT_ATTENTION",
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.notificationEventPreference.findMany({
    where: { userId: session.user.id },
  });

  const byType = Object.fromEntries(
    EVENT_TYPES.map((t) => [t, true])
  ) as Record<NotificationEventType, boolean>;

  for (const row of rows) {
    byType[row.eventType] = row.enabled;
  }

  return NextResponse.json({ preferences: byType });
}

const putSchema = z.object({
  preferences: z.record(z.boolean()),
});

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = putSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const userId = session.user.id;
  for (const [eventType, enabled] of Object.entries(parsed.data.preferences)) {
    if (!EVENT_TYPES.includes(eventType as NotificationEventType)) continue;
    await prisma.notificationEventPreference.upsert({
      where: {
        userId_eventType: {
          userId,
          eventType: eventType as NotificationEventType,
        },
      },
      create: {
        userId,
        eventType: eventType as NotificationEventType,
        enabled,
      },
      update: { enabled },
    });
  }

  return GET();
}
